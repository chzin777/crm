import "server-only";
import { prisma } from "@/lib/prisma";
import { phoneVariants } from "@/lib/chat/phone";
import { addDays, brDay, isAttributedSale } from "@/lib/campaign-attribution";
import { getMetaPricing, priceFor } from "@/lib/meta-pricing";

export type ConvertedSale = {
  contactId: string;
  nome: string;
  telefone: string;
  pedido: string;
  data: string;
  valor: number;
  loja: string;
  /** Linhas do pedido no ERP e descrição resumida dos produtos. */
  itens: number;
  resumo: string;
  /** Número da NF no ERP; sem ela o pedido ainda aguarda faturamento. */
  notaFiscal: string | null;
  /** Envio da mensagem e primeira vez que o pedido apareceu no espelho do ERP (ISO). */
  enviadoEm: string;
  registradoEm: string | null;
  /** Conversa do comprador no chat, se houver. */
  conversationId: string | null;
};

export type CampaignMetrics = {
  category: string | null;
  unitPrice: number;
  windowDays: number;
  cost: { estimated: number; real: number };
  funnel: { attempted: number; dispatched: number; delivered: number; read: number; replied: number; converted: number };
  conversionRate: number | null;
  revenue: number;
  orders: number;
  averageTicket: number | null;
  roi: number | null;
  sales: ConvertedSale[];
  lastSaleDate: string | null;
};

type Recipient = { contactId: string; phone: string; sentDay: string; sentAt: Date };
type ContactRow = { id: string; sourceKey: string; phone: string | null; name: string };
type SaleRow = { sourceKey: string; pedido: string; dia: string; loja: string; total: number; itens: number; resumo: string | null; firstSeen: Date | null; nota: string };


/**
 * Funil e conversão de um disparo. `campaignId` é o id da campanha ou `bulk:<lote>`.
 * Venda atribuída: pedido do ERP (tipo Venda) do próprio contato ou de outro cadastro com o mesmo
 * telefone, feito depois da mensagem e até `windowDays` dias após o dia do envio. Só contam contatos com entrega confirmada.
 */
export async function campaignMetrics(campaignId: string, category: string | null): Promise<CampaignMetrics> {
  const [pricing, messages] = await Promise.all([
    getMetaPricing(),
    prisma.campaignMessage.findMany({
      where: { campaignId },
      select: { contactId: true, phone: true, status: true, sentAt: true, deliveredAt: true, readAt: true, repliedAt: true },
    }),
  ]);
  const unitPrice = priceFor(pricing, category);
  const windowDays = pricing.conversionWindowDays;

  let dispatched = 0;
  let delivered = 0;
  let read = 0;
  let replied = 0;
  const recipients = new Map<string, Recipient>();
  for (const message of messages) {
    if (!message.sentAt) continue;
    dispatched += 1;
    // Resposta implica leitura e entrega; falha informada pela Meta depois do envio não conta como entregue.
    const wasDelivered = message.status !== "failed" && Boolean(message.deliveredAt || message.readAt || message.repliedAt);
    if (!wasDelivered) continue;
    delivered += 1;
    if (message.readAt || message.repliedAt) read += 1;
    if (message.repliedAt) replied += 1;
    const key = message.contactId ?? `phone:${message.phone}`;
    const sentDay = brDay(message.sentAt);
    const current = recipients.get(key);
    if (!current || message.sentAt < current.sentAt) recipients.set(key, { contactId: message.contactId ?? "", phone: message.phone, sentDay, sentAt: message.sentAt });
  }

  // Cadastros ligados a cada destinatário: o próprio e os que têm o mesmo telefone (a venda pode estar no cadastro do ERP).
  const recipientList = [...recipients.values()];
  const ids = recipientList.map((recipient) => recipient.contactId).filter(Boolean);
  const byPhone = new Map<string, Recipient[]>();
  for (const recipient of recipientList) {
    for (const variant of phoneVariants(recipient.phone)) {
      const list = byPhone.get(variant) ?? [];
      list.push(recipient);
      byPhone.set(variant, list);
    }
  }
  // Por id e por telefone em consultas separadas (UNION) para usar os índices; o OR varria o cadastro inteiro.
  const contacts = recipientList.length === 0 ? [] : await prisma.$queryRaw<ContactRow[]>`
    SELECT "id", "sourceKey", "phone", "name" FROM "Contact" WHERE "id" = ANY(${ids}::text[])
    UNION
    SELECT "id", "sourceKey", "phone", "name" FROM "Contact" WHERE "phone" = ANY(${[...byPhone.keys()]}::text[])
  `;
  const byId = new Map(recipientList.map((recipient) => [recipient.contactId, recipient]));
  const contactInfo = new Map(contacts.map((contact) => [contact.id, contact]));
  // sourceKey -> destinatário (o envio mais antigo, se o cadastro casar com mais de um)
  const owners = new Map<string, Recipient>();
  for (const contact of contacts) {
    const candidates = [byId.get(contact.id), ...(contact.phone ? byPhone.get(contact.phone) ?? [] : [])].filter((item): item is Recipient => Boolean(item));
    for (const candidate of candidates) {
      const current = owners.get(contact.sourceKey);
      if (!current || candidate.sentAt < current.sentAt) owners.set(contact.sourceKey, candidate);
    }
  }

  const firstDay = recipientList.reduce<string | null>((min, recipient) => (!min || recipient.sentDay < min ? recipient.sentDay : min), null);
  // Vendas do espelho do VMSet (uma linha por item, sem duplicidade), atualizado a cada minuto.
  const sales = owners.size === 0 || !firstDay ? [] : await prisma.$queryRaw<SaleRow[]>`
    SELECT "sourceKey", COALESCE("orderNumber", '') AS pedido, to_char("orderDate", 'YYYY-MM-DD') AS dia,
      COALESCE(max("store"), '') AS loja, COUNT(*)::int AS itens,
      left(string_agg(DISTINCT NULLIF(btrim("description"), ''), ' · '), 180) AS resumo,
      COALESCE(SUM("amount"), 0)::float8 AS total, min("syncedAt") AS "firstSeen", COALESCE(max("invoiceNumber"), '') AS nota
    FROM "VmsetSale"
    WHERE "sourceKey" = ANY(${[...owners.keys()]}::text[]) AND "type" = 'Venda'
      AND "orderDate" >= ${firstDay}::date AND "orderDate" <= ${addDays(new Date().toISOString().slice(0, 10), 1)}::date
    GROUP BY "sourceKey", "store", "orderNumber", "orderDate"
  `;

  const converted = new Set<string>();
  const convertedSales: ConvertedSale[] = [];
  let revenue = 0;
  for (const sale of sales) {
    const owner = owners.get(sale.sourceKey);
    if (!owner) continue;
    const firstSeen = sale.firstSeen ? new Date(sale.firstSeen) : null;
    if (!isAttributedSale({ saleDay: sale.dia, firstSeen, sentDay: owner.sentDay, sentAt: owner.sentAt, windowDays })) continue;
    const ownerKey = owner.contactId || `phone:${owner.phone}`;
    converted.add(ownerKey);
    revenue += sale.total;
    const info = contactInfo.get(owner.contactId);
    convertedSales.push({
      contactId: owner.contactId, nome: info?.name ?? owner.phone, telefone: owner.phone, pedido: sale.pedido, data: sale.dia, valor: sale.total,
      loja: sale.loja, itens: Number(sale.itens), resumo: sale.resumo ?? "", notaFiscal: sale.nota || null,
      enviadoEm: owner.sentAt.toISOString(), registradoEm: sale.firstSeen ? new Date(sale.firstSeen).toISOString() : null, conversationId: null,
    });
  }
  convertedSales.sort((a, b) => b.data.localeCompare(a.data) || b.valor - a.valor);

  // Conversa do chat de cada comprador (pelo contato ou pelo telefone), para abrir direto do relatório.
  if (convertedSales.length > 0) {
    const buyerIds = [...new Set(convertedSales.map((sale) => sale.contactId).filter(Boolean))];
    const buyerPhones = [...new Set(convertedSales.flatMap((sale) => phoneVariants(sale.telefone)))];
    const conversations = await prisma.chatConversation.findMany({
      where: { OR: [{ contactId: { in: buyerIds } }, { phone: { in: buyerPhones } }] },
      orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }],
      select: { id: true, contactId: true, phone: true },
    });
    for (const sale of convertedSales) {
      const variants = new Set(phoneVariants(sale.telefone));
      sale.conversationId = conversations.find((item) => (sale.contactId && item.contactId === sale.contactId) || variants.has(item.phone))?.id ?? null;
    }
  }

  const lastSale = await prisma.$queryRaw<{ last: string | null }[]>`
    SELECT to_char(max("orderDate"), 'YYYY-MM-DD') AS last FROM "VmsetSale"
  `;

  const realCost = delivered * unitPrice;
  return {
    category,
    unitPrice,
    windowDays,
    cost: { estimated: messages.length * unitPrice, real: realCost },
    funnel: { attempted: messages.length, dispatched, delivered, read, replied, converted: converted.size },
    conversionRate: delivered > 0 ? (converted.size / delivered) * 100 : null,
    revenue,
    orders: convertedSales.length,
    averageTicket: converted.size > 0 ? revenue / converted.size : null,
    roi: realCost > 0 ? (revenue - realCost) / realCost : null,
    sales: convertedSales,
    lastSaleDate: lastSale[0]?.last ?? null,
  };
}
