/** Regra pura de atribuição de venda a um disparo, separada de campaign-metrics para poder ser testada. */

/** Dia (AAAA-MM-DD) no fuso de Brasília: as vendas do ERP só têm data, sem hora. */
export const brDay = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(date);

export const addDays = (day: string, days: number) => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export type AttributionInput = {
  /** Dia do pedido no ERP (AAAA-MM-DD). */
  saleDay: string;
  /** Primeira vez que o pedido apareceu no espelho do ERP (sincronizado a cada minuto). */
  firstSeen: Date | null;
  /** Dia e instante do envio ao destinatário. */
  sentDay: string;
  sentAt: Date;
  windowDays: number;
};

/**
 * Venda conta para o disparo se o pedido for do dia do envio até `windowDays` dias depois.
 * O ERP só guarda a data do pedido: um pedido do próprio dia do envio que já estava no espelho
 * antes da mensagem foi feito antes dela e não é conversão.
 */
export function isAttributedSale({ saleDay, firstSeen, sentDay, sentAt, windowDays }: AttributionInput) {
  if (saleDay < sentDay || saleDay > addDays(sentDay, windowDays)) return false;
  if (saleDay === sentDay && firstSeen && firstSeen < sentAt) return false;
  return true;
}

/** Linha do espelho do ERP (VmsetSale): um item de venda ou de devolução. */
export type SaleItemRow = {
  sourceKey: string;
  type: string;
  orderNumber: string;
  /** Dia do pedido (AAAA-MM-DD). */
  day: string;
  store: string;
  productCode: string;
  /** Valor líquido do item (já com desconto); nas devoluções o ERP não informa. */
  amount: number | null;
  invoiceNumber: string;
  description: string;
  syncedAt: Date | null;
};

export type ErpOrder = {
  sourceKey: string;
  pedido: string;
  dia: string;
  loja: string;
  total: number;
  itens: number;
  resumo: string;
  notaFiscal: string | null;
  /** Primeira sincronização de um item do pedido (mais cedo entre os itens). */
  firstSeen: Date | null;
};

const SALE = "Venda";
const RETURN = "Devolucao Cliente";

/**
 * Agrupa itens de venda em pedidos (cliente + loja + número + dia) e descarta itens devolvidos:
 * a devolução no ERP repete o número do pedido, o código do produto e a data da venda original, sem valor.
 * O número do pedido se repete entre anos no mesmo cliente, por isso a data entra na chave. Pedido com tudo devolvido some.
 */
export function buildOrders(rows: SaleItemRow[]): ErpOrder[] {
  const itemKey = (row: SaleItemRow) => `${row.sourceKey}|${row.orderNumber}|${row.productCode}|${row.day}`;
  const returned = new Set(rows.filter((row) => row.type === RETURN).map(itemKey));
  const orders = new Map<string, ErpOrder & { descriptions: Set<string> }>();
  for (const row of rows) {
    if (row.type !== SALE || returned.has(itemKey(row))) continue;
    const key = `${row.sourceKey}|${row.store}|${row.orderNumber}|${row.day}`;
    const order = orders.get(key) ?? { sourceKey: row.sourceKey, pedido: row.orderNumber, dia: row.day, loja: row.store, total: 0, itens: 0, resumo: "", notaFiscal: null, firstSeen: null, descriptions: new Set<string>() };
    order.total += row.amount ?? 0;
    order.itens += 1;
    if (row.description.trim()) order.descriptions.add(row.description.trim());
    if (row.invoiceNumber && (!order.notaFiscal || row.invoiceNumber > order.notaFiscal)) order.notaFiscal = row.invoiceNumber;
    if (row.syncedAt && (!order.firstSeen || row.syncedAt < order.firstSeen)) order.firstSeen = row.syncedAt;
    orders.set(key, order);
  }
  return [...orders.values()].map(({ descriptions, ...order }) => ({
    ...order,
    // Centavos exatos: soma de decimais em ponto flutuante acumula resíduo.
    total: Math.round(order.total * 100) / 100,
    resumo: [...descriptions].sort().join(" · ").slice(0, 180),
  }));
}

/**
 * Indicadores financeiros do disparo.
 * - Conversão de leads: clientes que compraram ÷ destinatários únicos com entrega confirmada.
 * - Ticket médio: vendido ÷ clientes que compraram (por pedido: vendido ÷ pedidos).
 * - Retorno (%): (vendido − gasto) ÷ gasto × 100; ROAS: vendido ÷ gasto. Sem gasto, não se aplicam (null).
 */
export function campaignFinancials({ revenue, cost, buyers, recipients, orders }: { revenue: number; cost: number; buyers: number; recipients: number; orders: number }) {
  // Divide em centavos inteiros e arredonda meio centavo para cima: 58.144,20 ÷ 24 = 2.422,675 → 2.422,68
  // (em ponto flutuante daria 2.422,6749… e a tela oscilaria entre ,67 e ,68).
  const revenueCents = Math.round(revenue * 100);
  const perUnit = (divisor: number) => (divisor > 0 ? Math.round(revenueCents / divisor) / 100 : null);
  return {
    conversionRate: recipients > 0 ? (buyers / recipients) * 100 : null,
    averageTicket: perUnit(buyers),
    ticketPerOrder: perUnit(orders),
    roi: cost > 0 ? ((revenue - cost) / cost) * 100 : null,
    roas: cost > 0 ? revenue / cost : null,
  };
}
