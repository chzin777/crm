import "server-only";
import { prisma } from "@/lib/prisma";
import { phoneVariants } from "@/lib/chat/phone";
import { isValidCpf } from "@/lib/ai/installments";
import { lookupInstallments } from "@/lib/ai/installments-db";
import { consultarEstoqueProduto, getStockInBatches, storeDirectory } from "@/lib/ai/stock-db";
import { catalogProducts } from "@/lib/ai/catalog-db";
import { retailStock } from "@/lib/ai/stock";
import { doctorLine, sortPrescriptions } from "@/lib/prescriptions";
import { runQuickQuery, type QuickQueryDeps, type QuickQueryParams } from "@/lib/chat/quick-query";
import { extractChatOperationalContext, suggestQuickQueries, type PrescriptionQuick, type PurchaseQuickItem, type QuickQueryKind, type StockQuickProduct } from "@/lib/chat/operational-context";

const MAX_ORDERS = 5;

async function findByName(name: string) {
  const rows = await prisma.contact.findMany({
    where: { name: { contains: name.trim(), mode: "insensitive" }, cpf: { not: null } },
    select: { name: true, cpf: true },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });
  const unique = new Map<string, { name: string; cpf: string }>();
  for (const row of rows) {
    const cpf = (row.cpf ?? "").replace(/\D/g, "");
    if (isValidCpf(cpf) && !unique.has(cpf)) unique.set(cpf, { name: row.name, cpf });
  }
  return [...unique.values()].slice(0, 5);
}

async function stock(term: string): Promise<{ status: "ok" | "unavailable"; products: StockQuickProduct[] }> {
  const { result } = await consultarEstoqueProduto({ termoBusca: term }, { products: catalogProducts, withPrices: true });
  if (result.cenario === "unavailable_api") return { status: "unavailable", products: [] };
  if ("modelos" in result) {
    const models = result.modelos.slice(0, 5);
    const codes = [...new Set(models.flatMap((model) => model.codigos))];
    const [lookup, stores] = await Promise.all([getStockInBatches(codes), storeDirectory()]);
    if (lookup.stockStatus !== "ok") return { status: "unavailable", products: [] };
    return {
      status: "ok",
      products: models.map((model) => {
        const byStore = new Map<string, { loja: string; quantidade: number }>();
        for (const code of model.codigos) {
          for (const store of retailStock(lookup.byCode[code] ?? [], stores)) {
            const current = byStore.get(store.code);
            if (current) current.quantidade += store.quantidade;
            else byStore.set(store.code, { loja: store.loja, quantidade: store.quantidade });
          }
        }
        return {
          produto: [model.nomeComercial, model.referencia].filter(Boolean).join(" "),
          preco: model.precoVenda,
          total: model.totalDisponivelRede,
          lojas: [...byStore.values()].sort((a, b) => b.quantidade - a.quantidade),
        };
      }),
    };
  }
  return {
    status: "ok",
    products: result.produtos.map((product) => ({
      produto: product.nomeProduto || product.produto,
      preco: product.precoVenda,
      total: product.totalDisponivelRede,
      lojas: product.lojasComEstoque.map((store) => ({ loja: store.loja, quantidade: store.quantidade })),
    })),
  };
}

const cpfKeys = (cpf: string) => [`cpf:${cpf}`, `cpf:${cpf.replace(/^0+/, "")}`];

/** Pedidos do espelho do VMSet: CPF, cadastro da conversa (mesmo telefone) ou nome. */
async function purchases(input: { cpf: string | null; name: string | null; contactId: string | null }): Promise<PurchaseQuickItem[]> {
  const keys = new Set<string>();
  if (input.cpf) cpfKeys(input.cpf).forEach((key) => keys.add(key));
  if (input.contactId) {
    const contact = await prisma.contact.findUnique({ where: { id: input.contactId }, select: { sourceKey: true, cpf: true, phone: true } });
    if (contact) {
      keys.add(contact.sourceKey);
      const cpf = contact.cpf?.replace(/\D/g, "");
      if (cpf?.length === 11) cpfKeys(cpf).forEach((key) => keys.add(key));
      if (contact.phone) {
        const related = await prisma.contact.findMany({ where: { phone: { in: phoneVariants(contact.phone) } }, select: { sourceKey: true } });
        related.forEach((item) => keys.add(item.sourceKey));
      }
    }
  }
  const or = [
    ...(keys.size ? [{ sourceKey: { in: [...keys] } }] : []),
    ...(!keys.size && input.name ? [{ customerName: { contains: input.name, mode: "insensitive" as const } }] : []),
  ];
  if (!or.length) return [];
  const rows = await prisma.vmsetSale.findMany({
    where: { OR: or },
    select: { orderNumber: true, orderDate: true, store: true, description: true, amount: true, type: true },
    orderBy: { orderDate: "desc" },
    take: 80,
  });
  const orders = new Map<string, PurchaseQuickItem>();
  for (const row of rows) {
    const key = row.orderNumber ?? `${row.orderDate?.toISOString()}-${row.store}`;
    const current = orders.get(key) ?? { pedido: row.orderNumber ?? "", data: row.orderDate?.toISOString() ?? null, loja: row.store, itens: [], total: 0 };
    const item = [row.type && row.type !== "Venda" ? `[${row.type}]` : "", row.description?.trim() ?? ""].filter(Boolean).join(" ");
    if (item && !current.itens.includes(item)) current.itens.push(item);
    current.total = Math.round((current.total + Number(row.amount ?? 0)) * 100) / 100;
    orders.set(key, current);
    if (orders.size > MAX_ORDERS) break;
  }
  return [...orders.values()].slice(0, MAX_ORDERS);
}

const eye = (values: (string | null)[], labels: string[]) => values.map((value, index) => (value ? `${labels[index]} ${value}` : "")).filter(Boolean).join(" | ") || "—";

async function prescriptions(contactId: string): Promise<PrescriptionQuick[]> {
  const rows = await prisma.customerPrescription.findMany({ where: { contactId }, orderBy: [{ dataReceita: "desc" }, { createdAt: "desc" }], take: 10 });
  const labels = ["esf", "cil", "eixo", "ad", "DNP"];
  return sortPrescriptions(rows).map((row) => ({
    data: row.dataReceita ? row.dataReceita.toISOString().slice(0, 10).split("-").reverse().join("/") : null,
    medico: doctorLine(row) || null,
    od: eye([row.odEsferico, row.odCilindrico, row.odEixo, row.odAdicao, row.odDnp], labels),
    oe: eye([row.oeEsferico, row.oeCilindrico, row.oeEixo, row.oeAdicao, row.oeDnp], labels),
    anexo: row.attachmentUrl,
  }));
}

export const quickQueryDeps: QuickQueryDeps = { lookupInstallments: (cpf) => lookupInstallments(cpf), findByName, stock, purchases, prescriptions };

export const quickQuery = (input: { kind: QuickQueryKind; params: QuickQueryParams; contactId?: string | null }) => runQuickQuery(input, quickQueryDeps);

const CONTEXT_MESSAGES = 30;
const AUTHOR_LABEL: Record<string, string> = { customer: "Cliente", agent: "Atendente", ai: "IA", bot: "Bot", system: "Sistema" };

/** Contexto operacional da conversa (sessão atual): CPF, nome, produto, intenção, sugestões e transcrição curta. */
export async function loadOperationalContext(conversation: { id: string; contactId: string }) {
  const [contact, since] = await Promise.all([
    prisma.contact.findUnique({ where: { id: conversation.contactId }, select: { name: true, cpf: true } }),
    prisma.chatAudit.findFirst({ where: { targetId: conversation.id, action: "conversation.reopen" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  const rows = await prisma.chatMessage.findMany({
    where: { conversationId: conversation.id, internal: false, ...(since ? { createdAt: { gt: since.createdAt } } : {}) },
    orderBy: { createdAt: "desc" },
    take: CONTEXT_MESSAGES,
    select: { author: true, text: true },
  });
  const messages = rows.reverse().map((row) => ({ author: String(row.author), text: row.text ?? "" })).filter((row) => row.text.trim());
  const context = extractChatOperationalContext({ contact: { name: contact?.name ?? null, cpf: contact?.cpf ?? null }, messages });
  const transcript = messages.map((row) => `${AUTHOR_LABEL[row.author] ?? row.author}: ${row.text.slice(0, 400)}`).join("\n");
  return { context, suggestions: suggestQuickQueries(context), transcript };
}
