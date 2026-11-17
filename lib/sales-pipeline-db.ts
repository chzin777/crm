import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { phoneVariants } from "@/lib/chat/phone";
import { invalidateCache } from "@/lib/cache";
import { orderedStages, resolveStageConfigs, type LegacyPipelineRules, type StageId } from "@/lib/pipeline-stages";
import { applySalesEvent, brl, moveCardManually, openSalesCard, SALES_PIPELINE, type PipelineCard, type Recurrence, type SalesEvent } from "@/lib/sales-pipeline";

/** Mesmo lock da sincronização do pipeline: IA, sync e vendedor nunca gravam o JSON ao mesmo tempo. */
const PIPELINE_LOCK = Prisma.sql`WITH advisory_lock AS MATERIALIZED (SELECT pg_advisory_xact_lock(730021, 1)) SELECT 1::int AS locked FROM advisory_lock`;
type Tx = Prisma.TransactionClient;

/** Cadastro da conversa + outros com o mesmo telefone ou CPF (espelho do ERP usa "cpf:..." como chave). */
async function relatedKeys(db: Tx | typeof prisma, contact: { id: string; sourceKey: string; cpf: string | null; phone: string | null }) {
  const related = contact.phone ? await db.contact.findMany({ where: { phone: { in: phoneVariants(contact.phone) } }, select: { id: true, sourceKey: true, purchases: true, lastPurchaseDate: true } }) : [];
  const cpf = contact.cpf?.replace(/\D/g, "");
  const keys = [...new Set([contact.sourceKey, ...(cpf ? [`cpf:${cpf}`, `cpf:${cpf.replace(/^0+/, "")}`] : []), ...related.map((item) => item.sourceKey)])];
  return { keys, related };
}

const day = (value: Date | string | null) => {
  if (!value) return null;
  const iso = typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : typeof value === "string" ? value : null;
};

/**
 * Novo Cliente x Cliente Recorrente: compra/OS no espelho do VMSet (cadastro, CPF ou mesmo telefone), compras no
 * cadastro importado do ERP ou venda já ganha no funil do CRM. Devolve o resumo da última compra para o card.
 */
export async function classifyCustomerRecurrence(contactId: string, db: Tx | typeof prisma = prisma, cards: PipelineCard[] = []): Promise<Recurrence> {
  const contact = await db.contact.findUnique({ where: { id: contactId }, select: { id: true, sourceKey: true, cpf: true, phone: true, purchases: true, lastPurchaseDate: true } });
  if (!contact) return { type: "novo", lastPurchase: null };
  const { keys, related } = await relatedKeys(db, contact);
  const [last] = await db.$queryRaw<{ dia: Date | null; total: number; resumo: string | null }[]>`
    SELECT "orderDate" AS dia, COALESCE(SUM("amount"), 0)::float8 AS total, left(string_agg(DISTINCT NULLIF(btrim("description"), ''), ' · '), 90) AS resumo
    FROM "VmsetSale"
    WHERE "sourceKey" = ANY(${keys}::text[]) AND "type" = 'Venda'
    GROUP BY "orderNumber", "orderDate"
    ORDER BY "orderDate" DESC NULLS LAST
    LIMIT 1
  `;
  if (last) return { type: "recorrente", lastPurchase: [day(last.dia), last.resumo, last.total > 0 ? brl(last.total) : null].filter(Boolean).join(" — ") };
  const buyer = [contact, ...related].find((item) => item.purchases > 0);
  if (buyer) return { type: "recorrente", lastPurchase: buyer.lastPurchaseDate ? `${day(buyer.lastPurchaseDate)} (${buyer.purchases} compra${buyer.purchases > 1 ? "s" : ""} no ERP)` : `${buyer.purchases} compra(s) no ERP` };
  const won = cards.find((card) => card.pipelineId === SALES_PIPELINE && card.contactId === contactId && card.coluna === "ganho");
  if (won) return { type: "recorrente", lastPurchase: `Venda ganha no CRM${won.valorFaturado ? ` — ${brl(won.valorFaturado)}` : ""}` };
  return { type: "novo", lastPurchase: null };
}

async function readPipeline(tx: Tx | typeof prisma) {
  const [settings, stages, pipeline] = await Promise.all([
    tx.crmWorkspaceData.findUnique({ where: { key: "settings" } }),
    tx.crmWorkspaceData.findUnique({ where: { key: "pipeline-stages" } }),
    tx.crmWorkspaceData.findUnique({ where: { key: "pipeline" } }),
  ]);
  const legacy = ((settings?.value as { pipelineRules?: LegacyPipelineRules } | null)?.pipelineRules ?? {}) as LegacyPipelineRules;
  const configs = resolveStageConfigs(stages?.value, legacy);
  const cards = Array.isArray(pipeline?.value) ? (pipeline.value as unknown as PipelineCard[]) : [];
  const autoEnabled = (settings?.value as { pipelineAutoSyncEnabled?: boolean } | null)?.pipelineAutoSyncEnabled !== false;
  return { configs, cards, autoEnabled };
}

async function writePipeline(tx: Tx, cards: PipelineCard[]) {
  await tx.crmWorkspaceData.upsert({ where: { key: "pipeline" }, update: { value: cards as never }, create: { key: "pipeline", value: cards as never } });
}

type PipelineWrite = { before: PipelineCard[]; after: PipelineCard[] };
/** Depois do commit: cards que entraram numa etapa disparam as automações "Lead entrou na etapa" (em segundo plano). */
function emitStageAutomations(write: PipelineWrite | null) {
  if (!write) return;
  void import("@/lib/automations/engine-db").then((engine) => engine.emitStageChanges(write.before, write.after)).catch(() => undefined);
}

/**
 * Eventos comerciais da conversa → oportunidade do contato no funil de vendas (cria uma só por contato, avança sem
 * regredir, histórico no card). Falha aqui nunca derruba o atendimento.
 */
export async function recordSalesEvents(input: { contactId: string; conversationId?: string | null; events: SalesEvent[] }) {
  if (!input.events.length) return null;
  let write: PipelineWrite | null = null;
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(PIPELINE_LOCK);
      const { configs, cards, autoEnabled } = await readPipeline(tx);
      if (!autoEnabled) return null;
      const contact = await tx.contact.findUnique({ where: { id: input.contactId }, select: { id: true, name: true, phone: true, email: true, birthDate: true } });
      if (!contact) return null;
      const recurrence = openSalesCard(cards, contact.id)?.customerType ? { type: "novo" as const, lastPurchase: null } : await classifyCustomerRecurrence(contact.id, tx, cards);
      let current = cards;
      let changed = false;
      let last: PipelineCard | null = null;
      for (const event of input.events) {
        const applied = applySalesEvent(current, { contact, conversationId: input.conversationId, event, recurrence, configs });
        if (applied.card) {
          current = applied.cards;
          changed = true;
          last = applied.card;
        }
      }
      if (changed) {
        await writePipeline(tx, current);
        write = { before: cards, after: current };
      }
      return last;
    }, { maxWait: 10_000, timeout: 30_000 });
    emitStageAutomations(write);
    if (result) await invalidateCache("dashboard").catch(() => undefined);
    return result;
  } catch (error) {
    console.warn(`[pipeline] evento de venda não registrado (${input.contactId})`, error);
    return null;
  }
}

/** Oportunidade aberta (ou a última ganha) do contato e as etapas do funil, para o atendimento no /chat. */
export async function contactOpportunity(contactId: string) {
  const { configs, cards } = await readPipeline(prisma);
  const card = openSalesCard(cards, contactId) ?? cards.find((item) => item.pipelineId === SALES_PIPELINE && item.contactId === contactId) ?? null;
  const stages = orderedStages(SALES_PIPELINE, configs).map((stage) => ({ id: stage.id, titulo: configs[stage.id].titulo }));
  // Selo Novo/Recorrente do cabeçalho do "Dados do cliente": o do card, ou o ERP quando ainda não há oportunidade.
  const recurrence = card?.customerType ? card.customerType : (await classifyCustomerRecurrence(contactId, prisma, cards).catch(() => null))?.type ?? null;
  return { card, stages, recurrence };
}

/**
 * "+ Criar oportunidade" no Dados do cliente: abre o card do contato em Novo lead (independe da automação global).
 * Já existindo uma aberta, devolve a existente.
 */
export async function createOpportunity(input: { contactId: string; conversationId?: string | null; author: string }) {
  let write: PipelineWrite | null = null;
  const card = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(PIPELINE_LOCK);
    const { configs, cards } = await readPipeline(tx);
    const open = openSalesCard(cards, input.contactId);
    if (open) return open;
    const contact = await tx.contact.findUnique({ where: { id: input.contactId }, select: { id: true, name: true, phone: true, email: true, birthDate: true } });
    if (!contact) return null;
    const [recurrence, prescriptions] = await Promise.all([
      classifyCustomerRecurrence(contact.id, tx, cards),
      tx.customerPrescription.count({ where: { contactId: contact.id } }),
    ]);
    const applied = applySalesEvent(cards, { contact, conversationId: input.conversationId, event: { type: "criacao_manual", summary: input.author }, recurrence, configs });
    if (!applied.card) return null;
    let created = applied.card;
    let next = applied.cards;
    if (prescriptions > 0) {
      created = { ...created, receitaAnexada: true, titulo: `Lentes com receita - ${contact.name}`.slice(0, 120) };
      next = next.map((item) => (item.id === created.id ? created : item));
    }
    await writePipeline(tx, next);
    write = { before: cards, after: next };
    return created;
  }, { maxWait: 10_000, timeout: 30_000 });
  emitStageAutomations(write);
  if (card) await invalidateCache("dashboard").catch(() => undefined);
  return card;
}

/** Vendedor muda a etapa pelo atendimento (ou pausa a automação do card). */
export async function updateOpportunity(input: { contactId: string; cardId: string; column?: StageId; autoMoveEnabled?: boolean; author: string }) {
  let write: PipelineWrite | null = null;
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(PIPELINE_LOCK);
    const { configs, cards } = await readPipeline(tx);
    const card = cards.find((item) => item.id === input.cardId && item.contactId === input.contactId);
    if (!card) return null;
    let next = cards;
    let updated: PipelineCard | null = card;
    if (input.column) ({ cards: next, card: updated } = moveCardManually(next, { cardId: card.id, column: input.column, author: input.author, configs }));
    if (!updated) return null;
    if (typeof input.autoMoveEnabled === "boolean") {
      updated = { ...updated, autoMoveEnabled: input.autoMoveEnabled };
      next = next.map((item) => (item.id === updated!.id ? updated! : item));
    }
    await writePipeline(tx, next);
    write = { before: cards, after: next };
    return updated;
  }, { maxWait: 10_000, timeout: 30_000 });
  emitStageAutomations(write);
  return result;
}

let lastWonSync = 0;
const WON_SYNC_MS = 60 * 60 * 1000;

/**
 * Venda faturada no espelho do VMSet depois da abertura da oportunidade → card em "Ganho" com o valor real.
 * Roda no relógio do chat no máximo 1x por hora (o espelho do ERP é sincronizado 1x por dia).
 */
export async function syncWonOpportunities(now = Date.now()) {
  if (now - lastWonSync < WON_SYNC_MS) return 0;
  lastWonSync = now;
  const { cards } = await prisma.$transaction(async (tx) => readPipeline(tx));
  const open = cards.filter((card) => card.pipelineId === SALES_PIPELINE && card.contactId && card.abertaEm && card.coluna !== "ganho");
  let won = 0;
  for (const card of open) {
    const contact = await prisma.contact.findUnique({ where: { id: card.contactId! }, select: { id: true, sourceKey: true, cpf: true, phone: true } });
    if (!contact) continue;
    const { keys } = await relatedKeys(prisma, contact);
    const [sale] = await prisma.$queryRaw<{ total: number }[]>`
      SELECT COALESCE(SUM("amount"), 0)::float8 AS total FROM "VmsetSale"
      WHERE "sourceKey" = ANY(${keys}::text[]) AND "type" = 'Venda' AND "orderDate" >= ${card.abertaEm!.slice(0, 10)}::date
    `;
    if (!sale || sale.total <= 0) continue;
    const result = await recordSalesEvents({ contactId: contact.id, conversationId: card.conversationId, events: [{ type: "venda_faturada", value: sale.total }] });
    if (result?.coluna === "ganho") won += 1;
  }
  if (won) console.log(`[pipeline] ${won} oportunidade(s) movida(s) para Ganho pela venda no ERP`);
  return won;
}
