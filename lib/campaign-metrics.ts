import "server-only";
import { prisma } from "@/lib/prisma";
import { phoneVariants } from "@/lib/chat/phone";
import { addDays, brDay, buildOrders, campaignFinancials, isAttributedSale, lastTouch, type SaleItemRow, type Touch } from "@/lib/campaign-attribution";
import { getMetaPricing, priceFor } from "@/lib/meta-pricing";
import { storeNameForErpCode } from "@/lib/stores";

export type ConvertedSale = {
  contactId: string;
  nome: string;
  telefone: string;
  pedido: string;
  data: string;
  valor: number;
  /** Código da loja no ERP ("13") e nome cadastrado da unidade ("LJ 13 ..."). */
  loja: string;
  lojaNome: string;
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
  /** Chaves do comprador e do pedido, para o total geral contar cada um uma vez. */
  buyerKey: string;
  orderKey: string;
};

export type CampaignMetrics = {
  category: string | null;
  unitPrice: number;
  windowDays: number;
  cost: { estimated: number; real: number };
  funnel: { attempted: number; dispatched: number; delivered: number; read: number; replied: number; converted: number };
  /** Clientes que compraram ÷ destinatários únicos com entrega confirmada (%). */
  conversionRate: number | null;
  /** Destinatários únicos com entrega confirmada (base da conversão). */
  recipients: number;
  revenue: number;
  orders: number;
  /** Vendido ÷ clientes que compraram. */
  averageTicket: number | null;
  /** Vendido ÷ pedidos. */
  ticketPerOrder: number | null;
  /** Retorno financeiro em %: ((vendido − gasto) / gasto) × 100. Null quando não houve gasto. */
  roi: number | null;
  /** ROAS: vendido / gasto (quantas vezes o gasto voltou em vendas). Null quando não houve gasto. */
  roas: number | null;
  sales: ConvertedSale[];
  lastSaleDate: string | null;
};

type Recipient = { contactId: string; phone: string; sentDay: string; sentAt: Date };
type ContactRow = { id: string; sourceKey: string; phone: string | null; name: string };
type SaleItemSqlRow = Omit<SaleItemRow, "amount" | "syncedAt"> & { amount: number | string | null; syncedAt: Date | string | null };


/**
 * Funil e conversão de um disparo. `campaignId` é o id da campanha ou `bulk:<lote>`.
 * Venda atribuída: pedido do ERP (tipo Venda) do próprio contato ou de outro cadastro com o mesmo
 * telefone, feito depois da mensagem e até `windowDays` dias após o dia do envio. Só contam contatos com entrega confirmada.
 */
export async function campaignMetrics(campaignId: string, category: string | null): Promise<CampaignMetrics> {
  const [pricing, messages, stores] = await Promise.all([
    getMetaPricing(),
    prisma.campaignMessage.findMany({
      where: { campaignId },
      select: { contactId: true, phone: true, status: true, sentAt: true, deliveredAt: true, readAt: true, repliedAt: true },
    }),
    prisma.store.findMany({ select: { number: true, name: true } }),
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
  // Itens de venda e de devolução (a devolução repete o pedido e o produto): pedidos e devoluções são resolvidos em buildOrders.
  // Devoluções podem vir depois da janela, por isso não têm limite de data final.
  const rows = owners.size === 0 || !firstDay ? [] : await prisma.$queryRaw<SaleItemSqlRow[]>`
    SELECT "sourceKey", "type", COALESCE("orderNumber", '') AS "orderNumber", to_char("orderDate", 'YYYY-MM-DD') AS day,
      COALESCE("store", '') AS store, COALESCE("productCode", '') AS "productCode", "amount"::float8 AS amount,
      COALESCE("invoiceNumber", '') AS "invoiceNumber", COALESCE("description", '') AS description, "syncedAt"
    FROM "VmsetSale"
    WHERE "sourceKey" = ANY(${[...owners.keys()]}::text[]) AND "orderDate" >= ${firstDay}::date
      AND ("type" = 'Devolucao Cliente' OR ("type" = 'Venda' AND "orderDate" <= ${addDays(brDay(), 1)}::date))
  `;
  const sales = buildOrders(rows.map((row) => ({ ...row, amount: row.amount === null ? null : Number(row.amount), syncedAt: row.syncedAt ? new Date(row.syncedAt) : null })));

  const candidates = sales.filter((sale) => {
    const owner = owners.get(sale.sourceKey);
    return owner && isAttributedSale({ saleDay: sale.dia, firstSeen: sale.firstSeen, sentDay: owner.sentDay, sentAt: owner.sentAt, windowDays });
  });
  // Outros disparos entregues aos mesmos compradores (por contato ou telefone): o pedido fica com o mais recente (last-touch).
  const buyers = [...new Set(candidates.map((sale) => owners.get(sale.sourceKey) as Recipient))];
  const buyerPhones = [...new Set(buyers.flatMap((buyer) => phoneVariants(buyer.phone)))];
  const otherTouches = buyers.length === 0 ? [] : await prisma.campaignMessage.findMany({
    where: {
      campaignId: { not: campaignId },
      sentAt: { not: null },
      status: { not: "failed" },
      AND: [
        { OR: [{ deliveredAt: { not: null } }, { readAt: { not: null } }, { repliedAt: { not: null } }] },
        { OR: [{ contactId: { in: buyers.map((buyer) => buyer.contactId).filter(Boolean) } }, { phone: { in: buyerPhones } }] },
      ],
    },
    select: { campaignId: true, contactId: true, phone: true, sentAt: true },
  });
  const touchesOf = (owner: Recipient): Touch[] => {
    const variants = new Set(phoneVariants(owner.phone));
    return [
      { campaignId, sentAt: owner.sentAt },
      ...otherTouches
        .filter((touch) => (owner.contactId && touch.contactId === owner.contactId) || variants.has(touch.phone))
        .map((touch) => ({ campaignId: touch.campaignId, sentAt: touch.sentAt as Date })),
    ];
  };

  const converted = new Set<string>();
  const convertedSales: ConvertedSale[] = [];
  let revenue = 0;
  for (const sale of candidates) {
    const owner = owners.get(sale.sourceKey) as Recipient;
    if (lastTouch({ saleDay: sale.dia, firstSeen: sale.firstSeen }, touchesOf(owner), windowDays) !== campaignId) continue;
    const ownerKey = owner.contactId || `phone:${owner.phone}`;
    converted.add(ownerKey);
    revenue += sale.total;
    const info = contactInfo.get(owner.contactId);
    convertedSales.push({
      contactId: owner.contactId, nome: info?.name ?? owner.phone, telefone: owner.phone, pedido: sale.pedido, data: sale.dia, valor: sale.total,
      loja: sale.loja, lojaNome: storeNameForErpCode(stores, sale.loja), itens: sale.itens, resumo: sale.resumo, notaFiscal: sale.notaFiscal,
      enviadoEm: owner.sentAt.toISOString(), registradoEm: sale.firstSeen ? sale.firstSeen.toISOString() : null, conversationId: null,
      buyerKey: ownerKey, orderKey: `${sale.sourceKey}|${sale.loja}|${sale.pedido}|${sale.dia}`,
    });
  }
  revenue = Math.round(revenue * 100) / 100;
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

  // A Meta cobra por mensagem de modelo entregue; o estimado considera todas as mensagens do disparo.
  const realCost = Math.round(delivered * unitPrice * 100) / 100;
  const financials = campaignFinancials({ revenue, cost: realCost, buyers: converted.size, recipients: recipients.size, orders: convertedSales.length });
  return {
    category,
    unitPrice,
    windowDays,
    cost: { estimated: Math.round(messages.length * unitPrice * 100) / 100, real: realCost },
    funnel: { attempted: messages.length, dispatched, delivered, read, replied, converted: converted.size },
    conversionRate: financials.conversionRate,
    recipients: recipients.size,
    revenue,
    orders: convertedSales.length,
    averageTicket: financials.averageTicket,
    ticketPerOrder: financials.ticketPerOrder,
    roi: financials.roi,
    roas: financials.roas,
    sales: convertedSales,
    lastSaleDate: lastSale[0]?.last ?? null,
  };
}

/**
 * Contatos de um disparo para segmentação: quem recebeu (entrega confirmada) e quem converteu,
 * pela mesma regra de atribuição das métricas da campanha.
 */
export async function campaignAudienceSets(campaignId: string): Promise<{ delivered: string[]; converted: string[] }> {
  const [metrics, messages] = await Promise.all([
    campaignMetrics(campaignId, null),
    prisma.campaignMessage.findMany({
      where: {
        campaignId,
        contactId: { not: null },
        sentAt: { not: null },
        status: { not: "failed" },
        OR: [{ deliveredAt: { not: null } }, { readAt: { not: null } }, { repliedAt: { not: null } }],
      },
      select: { contactId: true },
    }),
  ]);
  return {
    delivered: [...new Set(messages.map((message) => message.contactId).filter((id): id is string => Boolean(id)))],
    converted: [...new Set(metrics.sales.map((sale) => sale.contactId).filter(Boolean))],
  };
}
