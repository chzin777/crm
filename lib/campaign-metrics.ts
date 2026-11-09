import "server-only";
import { prisma } from "@/lib/prisma";
import { phoneVariants } from "@/lib/chat/phone";
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

type Recipient = { contactId: string; phone: string; sentDay: string };
type ContactRow = { id: string; sourceKey: string; phone: string | null; name: string };
type SaleRow = { sourceKey: string; pedido: string; dia: string; loja: string; total: number; itens: number; resumo: string | null };

/** Dia (AAAA-MM-DD) no fuso de Brasília: as vendas do ERP só têm data, sem hora. */
const brDay = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(date);
const addDays = (day: string, days: number) => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/**
 * Funil e conversão de um disparo. `campaignId` é o id da campanha ou `bulk:<lote>`.
 * Venda atribuída: pedido do ERP (tipo Venda) do próprio contato ou de outro cadastro com o mesmo
 * telefone, feito do dia do envio até `windowDays` dias depois. Só contam contatos com entrega confirmada.
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
    if (!current || sentDay < current.sentDay) recipients.set(key, { contactId: message.contactId ?? "", phone: message.phone, sentDay });
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
  const contacts = recipientList.length === 0 ? [] : await prisma.$queryRaw<ContactRow[]>`
    SELECT "id", "sourceKey", "phone", "name" FROM "Contact"
    WHERE "id" = ANY(${ids}::text[]) OR "phone" = ANY(${[...byPhone.keys()]}::text[])
  `;
  const byId = new Map(recipientList.map((recipient) => [recipient.contactId, recipient]));
  const contactInfo = new Map(contacts.map((contact) => [contact.id, contact]));
  // sourceKey -> destinatário (o envio mais antigo, se o cadastro casar com mais de um)
  const owners = new Map<string, Recipient>();
  for (const contact of contacts) {
    const candidates = [byId.get(contact.id), ...(contact.phone ? byPhone.get(contact.phone) ?? [] : [])].filter((item): item is Recipient => Boolean(item));
    for (const candidate of candidates) {
      const current = owners.get(contact.sourceKey);
      if (!current || candidate.sentDay < current.sentDay) owners.set(contact.sourceKey, candidate);
    }
  }

  const firstDay = recipientList.reduce<string | null>((min, recipient) => (!min || recipient.sentDay < min ? recipient.sentDay : min), null);
  const sales = owners.size === 0 || !firstDay ? [] : await prisma.$queryRaw<SaleRow[]>`
    WITH parsed AS (
      SELECT "sourceKey",
        COALESCE("data"->>'NUM_PEDIDO', '') AS pedido,
        COALESCE("data"->>'LOJA', '') AS loja,
        NULLIF(trim(COALESCE("data"->>'DESCRICAO', '')), '') AS descricao,
        CASE
          WHEN "data"->>'DATA_PEDIDO' ~ '^\\d{2}/\\d{2}/\\d{4}$' THEN to_date("data"->>'DATA_PEDIDO', 'DD/MM/YYYY')
          WHEN "data"->>'DATA_PEDIDO' ~ '^\\d{4}-\\d{2}-\\d{2}' THEN to_date(left("data"->>'DATA_PEDIDO', 10), 'YYYY-MM-DD')
        END AS dia,
        regexp_replace(COALESCE("data"->>'VALOR_ITEM_VENDA', ''), '[^0-9,.-]', '', 'g') AS raw_amount
      FROM "ImportedSale"
      WHERE "sourceKey" = ANY(${[...owners.keys()]}::text[]) AND COALESCE("data"->>'TIPO', 'Venda') = 'Venda'
    )
    SELECT "sourceKey", pedido, to_char(dia, 'YYYY-MM-DD') AS dia, max(loja) AS loja,
      COUNT(*)::int AS itens, left(string_agg(DISTINCT descricao, ' · '), 180) AS resumo,
      SUM(CASE
        WHEN raw_amount ~ '^-?[0-9][0-9.]*,[0-9]{1,2}$' THEN replace(replace(raw_amount, '.', ''), ',', '.')::numeric
        WHEN raw_amount ~ '^-?[0-9]+(\\.[0-9]{1,2})?$' THEN raw_amount::numeric
        ELSE 0
      END)::float8 AS total
    FROM parsed
    WHERE dia >= ${firstDay}::date AND dia <= ${addDays(new Date().toISOString().slice(0, 10), 1)}::date
    GROUP BY "sourceKey", pedido, dia
  `;

  const converted = new Set<string>();
  const convertedSales: ConvertedSale[] = [];
  let revenue = 0;
  for (const sale of sales) {
    const owner = owners.get(sale.sourceKey);
    if (!owner || sale.dia < owner.sentDay || sale.dia > addDays(owner.sentDay, windowDays)) continue;
    const ownerKey = owner.contactId || `phone:${owner.phone}`;
    converted.add(ownerKey);
    revenue += sale.total;
    const info = contactInfo.get(owner.contactId);
    convertedSales.push({ contactId: owner.contactId, nome: info?.name ?? owner.phone, telefone: owner.phone, pedido: sale.pedido, data: sale.dia, valor: sale.total, loja: sale.loja, itens: Number(sale.itens), resumo: sale.resumo ?? "" });
  }
  convertedSales.sort((a, b) => b.data.localeCompare(a.data) || b.valor - a.valor);

  const lastSale = await prisma.$queryRaw<{ last: string | null }[]>`
    SELECT max(left("data"->>'DATA_PEDIDO', 10)) AS last FROM "ImportedSale"
    WHERE "id" > (SELECT COALESCE(max("id"), 0) - 20000 FROM "ImportedSale") AND "data"->>'DATA_PEDIDO' ~ '^\\d{4}-\\d{2}-\\d{2}'
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
