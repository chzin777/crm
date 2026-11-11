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
