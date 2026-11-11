import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { conversationNotFound, findScopedConversation, requireChatActor } from "@/lib/chat/access";
import { campaignNames } from "@/lib/chat/campaign-origin";
import { phoneVariants } from "@/lib/chat/phone";
import type { CustomerHistory } from "@/lib/chat/types";

type Context = { params: Promise<{ id: string }> };

const ORDERS_LIMIT = 8;
const CAMPAIGNS_LIMIT = 10;
const RENEWAL_DAYS = 365;

type OrderRow = { pedido: string; dia: string | null; loja: string; total: number; itens: number; resumo: string | null; nota: string; tipo: string };
type LensRow = { dia: string | null; tipo: string | null };

const STATUS_BY_TYPE: Record<string, string> = { Venda: "Venda", "Devolucao Cliente": "Devolução", Bonificacao: "Bonificação", ANTIGO: "Histórico" };

/** Datas do cadastro vêm como texto do ERP (AAAA-MM-DD ou DD/MM/AAAA). */
function parseDay(value: string | null) {
  if (!value) return null;
  const br = value.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  const iso = br ? `${br[3]}-${br[2]}-${br[1]}` : value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

/**
 * Visão 360 do cliente no ERP: pedidos do espelho do VMSet, referência para renovação da receita
 * e campanhas recebidas. Considera o cadastro da conversa e os outros com o mesmo telefone.
 */
export async function GET(_request: Request, context: Context) {
  const guard = await requireChatActor();
  if (guard.response) return guard.response;
  const { id } = await context.params;
  const conversation = await findScopedConversation(guard.actor, id);
  if (!conversation) return conversationNotFound();

  const contact = await prisma.contact.findUnique({
    where: { id: conversation.contactId },
    select: { id: true, sourceKey: true, cpf: true, store: true, purchases: true, totalSpent: true, lastPurchaseDate: true, prescriptionExpiry: true },
  });
  if (!contact) return conversationNotFound();

  const related = await prisma.contact.findMany({ where: { phone: { in: phoneVariants(conversation.phone) } }, select: { id: true, sourceKey: true } });
  const contactIds = [...new Set([contact.id, ...related.map((item) => item.id)])];
  const sourceKeys = [...new Set([contact.sourceKey, ...related.map((item) => item.sourceKey)])];

  const [orders, lens, messages, names] = await Promise.all([
    prisma.$queryRaw<OrderRow[]>`
      SELECT COALESCE("orderNumber", '') AS pedido, to_char("orderDate", 'YYYY-MM-DD') AS dia,
        COALESCE(max("store"), '') AS loja, COUNT(*)::int AS itens, COALESCE(SUM("amount"), 0)::float8 AS total,
        left(string_agg(DISTINCT NULLIF(btrim("description"), ''), ' · '), 160) AS resumo,
        COALESCE(max("invoiceNumber"), '') AS nota, COALESCE(max("type"), '') AS tipo
      FROM "VmsetSale"
      WHERE "sourceKey" = ANY(${sourceKeys}::text[])
      GROUP BY "orderNumber", "orderDate"
      ORDER BY "orderDate" DESC NULLS LAST
      LIMIT ${ORDERS_LIMIT}
    `,
    prisma.$queryRaw<LensRow[]>`
      SELECT to_char(max("orderDate"), 'YYYY-MM-DD') AS dia, (array_agg("subcategory" ORDER BY "orderDate" DESC))[1] AS tipo
      FROM "VmsetSale"
      WHERE "sourceKey" = ANY(${sourceKeys}::text[]) AND "type" = 'Venda' AND "category" = 'LENTES'
    `,
    prisma.campaignMessage.findMany({
      // Por contato (indexado); os cadastros com o mesmo telefone já estão em contactIds.
      where: { contactId: { in: contactIds } },
      orderBy: { createdAt: "desc" },
      take: CAMPAIGNS_LIMIT,
      select: { campaignId: true, status: true, sentAt: true, repliedAt: true },
    }),
    campaignNames(),
  ]);

  const lastLens = lens[0]?.dia ?? null;
  const expiry = parseDay(contact.prescriptionExpiry);
  const today = new Date().toISOString().slice(0, 10);
  const renewalDue = expiry
    ? expiry <= today
    : !!lastLens && Date.now() - new Date(`${lastLens}T12:00:00Z`).getTime() > RENEWAL_DAYS * 24 * 60 * 60 * 1000;

  const history: CustomerHistory = {
    cpf: contact.cpf,
    store: contact.store,
    purchases: contact.purchases,
    totalSpent: Number(contact.totalSpent),
    lastPurchaseDate: parseDay(contact.lastPurchaseDate) ?? orders.find((order) => order.tipo === "Venda")?.dia ?? null,
    prescription: { lastLensPurchase: lastLens, lensType: lens[0]?.tipo ?? null, expiry, renewalDue },
    orders: orders.map((order) => ({
      orderNumber: order.pedido,
      date: order.dia,
      total: order.total,
      store: order.loja,
      status: STATUS_BY_TYPE[order.tipo] ?? (order.tipo || "Pedido"),
      invoice: order.nota || null,
      items: Number(order.itens),
      summary: order.resumo ?? "",
    })),
    campaigns: messages.map((message) => ({
      name: names.get(message.campaignId) ?? (message.campaignId.startsWith("bulk:") ? "Envio em massa" : "Campanha excluída"),
      sentAt: message.sentAt?.toISOString() ?? null,
      status: message.status,
      repliedAt: message.repliedAt?.toISOString() ?? null,
    })),
  };
  return NextResponse.json(history);
}
