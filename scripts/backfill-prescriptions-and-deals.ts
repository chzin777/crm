/**
 * Backfill idempotente (pode rodar várias vezes):
 *  1. Receitas que a IA já tinha lido antes do v1.53 (nota interna "Cliente enviou receita ... Receita — OD: ...")
 *     → CustomerPrescription (origem ia_extracao, a conferir), vinculada à foto/PDF original do cliente.
 *     Duplicidade: messageId da mídia, ou conversationId + dataReceita quando não há mídia.
 *  2. Oportunidades no funil de vendas para conversas abertas (ou encerradas nos últimos 7 dias) com receita,
 *     transbordo para Vendas/Comercial ou ficha de modelo enviada pela IA, só para contatos ainda sem oportunidade
 *     aberta. Novo x Recorrente pelo ERP (classifyCustomerRecurrence, dentro de recordSalesEvents).
 *
 * Uso: npx tsx --conditions=react-server scripts/backfill-prescriptions-and-deals.ts [--dry-run]
 * Banco: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD (as mesmas variáveis do app).
 */
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { messageMediaUrl } from "@/lib/prescriptions-db";
import { extractionFromSummary, hasPrescriptionData, prescriptionFromExtraction, prescriptionSummariesFromNote } from "@/lib/prescriptions";
import { contactOpportunity, recordSalesEvents } from "@/lib/sales-pipeline-db";
import { isSalesQueue, productFromCard, type SalesEvent, type SalesTrigger } from "@/lib/sales-pipeline";

const DRY = process.argv.includes("--dry-run");
const RECENT_DAYS = 7;
const report = {
  notasDeReceita: 0,
  receitasNasNotas: 0,
  receitasMigradas: 0,
  receitasJaExistiam: 0,
  receitasIlegiveis: 0,
  conversasComSinal: 0,
  contatosComSinal: 0,
  oportunidadesCriadas: 0,
  contatosJaComOportunidade: 0,
};

async function backfillPrescriptions() {
  const notes = await prisma.chatMessage.findMany({
    where: { internal: true, text: { contains: "Cliente enviou receita" } },
    orderBy: { createdAt: "asc" },
    select: { id: true, text: true, createdAt: true, conversationId: true, conversation: { select: { contactId: true } } },
  });
  report.notasDeReceita = notes.length;
  for (const note of notes) {
    const summaries = prescriptionSummariesFromNote(note.text);
    // Fotos/PDFs do cliente até a nota, em ordem: cada receita da nota casa com um arquivo.
    const media = await prisma.chatMessage.findMany({
      where: {
        conversationId: note.conversationId,
        author: "customer",
        createdAt: { lte: note.createdAt },
        OR: [{ NOT: { attachment: { equals: Prisma.DbNull } } }, { NOT: { metaMedia: { equals: Prisma.DbNull } } }],
      },
      orderBy: { createdAt: "desc" },
      take: Math.max(1, summaries.length),
      select: { id: true },
    });
    const files = media.reverse();
    for (const [index, summary] of summaries.entries()) {
      report.receitasNasNotas += 1;
      const fields = prescriptionFromExtraction(extractionFromSummary(summary));
      if (!hasPrescriptionData(fields)) {
        report.receitasIlegiveis += 1;
        continue;
      }
      const file = files[index] ?? files.at(-1) ?? null;
      const duplicate = file
        ? await prisma.customerPrescription.findUnique({ where: { messageId: file.id }, select: { id: true } })
        : await prisma.customerPrescription.findFirst({ where: { conversationId: note.conversationId, dataReceita: fields.dataReceita }, select: { id: true } });
      if (duplicate) {
        report.receitasJaExistiam += 1;
        continue;
      }
      console.log(`  receita: conversa ${note.conversationId}, ${fields.medicoNome ?? "médico não lido"} ${fields.dataReceita?.toISOString().slice(0, 10) ?? ""}${file ? ` (arquivo ${file.id})` : " (sem arquivo)"}`);
      if (!DRY) {
        await prisma.customerPrescription.create({
          data: {
            ...fields,
            contactId: note.conversation.contactId,
            conversationId: note.conversationId,
            messageId: file?.id ?? null,
            attachmentUrl: file ? messageMediaUrl(file.id) : null,
            origem: "ia_extracao",
            conferidoPorHumano: false,
            createdAt: note.createdAt,
          },
        });
      }
      report.receitasMigradas += 1;
    }
  }
}

// Ordem do funil: o produto abre o card (com o valor); receita e Vendas avançam para Orçamento.
const ORDER: Record<SalesTrigger, number> = { interesse_produto: 0, orcamento_lentes: 1, receita_enviada: 2, transbordo_vendas: 3, visita_loja: 4, venda_faturada: 5, venda_manual: 6, criacao_manual: -1 };

async function backfillDeals() {
  const since = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000);
  const queues = await prisma.chatQueue.findMany({ select: { id: true, name: true } });
  const salesQueueIds = queues.filter((queue) => isSalesQueue(queue.name)).map((queue) => queue.id);
  // Só mensagens com sinal comercial (receita, transbordo para Vendas, ficha de modelo).
  const signals = await prisma.chatMessage.findMany({
    where: {
      conversation: { OR: [{ closedAt: null }, { closedAt: { gte: since } }] },
      OR: [
        { internal: true, text: { contains: "Cliente enviou receita" } },
        { internal: true, text: { contains: "para a fila Vendas" } },
        { internal: true, text: { contains: "para a fila Comercial" } },
        { author: "bot", text: { contains: "| Ref. " } },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: { text: true, internal: true, conversationId: true, conversation: { select: { contactId: true } } },
  });
  // Conversas abertas já na fila de Vendas também contam (transferência feita pelo atendente).
  const inSalesQueue = salesQueueIds.length
    ? await prisma.chatConversation.findMany({ where: { closedAt: null, queueId: { in: salesQueueIds } }, select: { id: true, contactId: true } })
    : [];

  const byContact = new Map<string, { conversationId: string; events: SalesEvent[] }>();
  const conversations = new Set<string>();
  const push = (contactId: string, conversationId: string, event: SalesEvent) => {
    conversations.add(conversationId);
    const entry = byContact.get(contactId) ?? { conversationId, events: [] };
    entry.conversationId = conversationId;
    entry.events.push(event);
    byContact.set(contactId, entry);
  };
  for (const signal of signals) {
    const { contactId } = signal.conversation;
    if (signal.internal && signal.text.includes("Cliente enviou receita")) {
      for (const summary of prescriptionSummariesFromNote(signal.text)) push(contactId, signal.conversationId, { type: "receita_enviada", summary });
    } else if (signal.internal) {
      push(contactId, signal.conversationId, { type: "transbordo_vendas", summary: signal.text.replace(/^.*?\):\s*|^[^:]*:\s*/, "").slice(0, 200) });
    } else {
      const product = productFromCard(signal.text);
      if (product) push(contactId, signal.conversationId, { type: "interesse_produto", product: product.name, value: product.price });
    }
  }
  for (const conversation of inSalesQueue) {
    if (!byContact.has(conversation.contactId)) push(conversation.contactId, conversation.id, { type: "transbordo_vendas", summary: "Conversa na fila de Vendas" });
  }
  report.conversasComSinal = conversations.size;
  report.contatosComSinal = byContact.size;

  for (const [contactId, entry] of byContact) {
    const { card } = await contactOpportunity(contactId);
    if (card && card.coluna !== "ganho") {
      report.contatosJaComOportunidade += 1;
      continue;
    }
    const events = [...entry.events].sort((a, b) => ORDER[a.type] - ORDER[b.type]);
    console.log(`  oportunidade: contato ${contactId}, eventos ${events.map((event) => event.type).join(", ")}`);
    if (DRY) {
      report.oportunidadesCriadas += 1;
      continue;
    }
    const created = await recordSalesEvents({ contactId, conversationId: entry.conversationId, events });
    if (created) {
      report.oportunidadesCriadas += 1;
      console.log(`    → ${created.customerType === "recorrente" ? "Cliente Recorrente" : "Novo Cliente"} em '${created.coluna}' (${created.valor})`);
    }
  }
}

async function main() {
  console.log(`Backfill de receitas e oportunidades${DRY ? " (simulação, nada é gravado)" : ""}`);
  await backfillPrescriptions();
  await backfillDeals();
  console.log("\nRelatório:");
  console.table(report);
}

main()
  .catch((error) => {
    console.error("Backfill falhou:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
