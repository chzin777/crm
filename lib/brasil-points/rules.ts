/**
 * Brasil Points (puro, sem banco): condições das regras, pontos devidos por pedido/NPS e o ajuste a lançar.
 * O motor (engine.ts) compara "devido agora" com o que já está no extrato daquela referência + regra e lança só a
 * diferença: re-sync com o mesmo estado não lança nada; devolução/cancelamento lança o estorno com referência ao pedido.
 */

export const RULE_TYPES = ["earn", "penalty"] as const;
export const TRIGGER_TYPES = ["automatic", "manual"] as const;
export const EVENT_KEYS = [
  "sale_completed", "sale_high_ticket", "whatsapp_sale", "sale_canceled_refund", "nps_promoter", "nps_detractor", "sla_breach", "manual_bonus", "manual_penalty",
] as const;
export type EventKey = (typeof EVENT_KEYS)[number];

/** Eventos que o motor calcula sozinho hoje. sla_breach fica só manual até existir a medição de SLA por vendedor. */
export const AUTOMATIC_EVENTS: readonly EventKey[] = ["sale_completed", "sale_high_ticket", "whatsapp_sale", "sale_canceled_refund", "nps_promoter", "nps_detractor"];
const SALE_EVENTS: readonly string[] = ["sale_completed", "sale_high_ticket", "whatsapp_sale"];

export const EVENT_LABELS: Record<EventKey, string> = {
  sale_completed: "Venda faturada",
  sale_high_ticket: "Venda de ticket alto",
  whatsapp_sale: "Venda pelo WhatsApp do CRM",
  sale_canceled_refund: "Venda devolvida ou cancelada",
  nps_promoter: "NPS promotor (9 ou 10)",
  nps_detractor: "NPS detrator (0 a 6)",
  sla_breach: "Estouro de SLA / abandono",
  manual_bonus: "Bônus manual",
  manual_penalty: "Desconto manual",
};

export type RuleConditions = {
  /** Valor mínimo/máximo dos itens elegíveis do pedido (R$). */
  minOrderAmount?: number;
  maxOrderAmount?: number;
  /** Só itens destas marcas/categorias contam (normalizado: maiúsculas, sem espaços nas pontas). */
  brands?: string[];
  categories?: string[];
  /** Pontos proporcionais: points_amount a cada X reais elegíveis (ex.: 1 ponto a cada R$ 100). */
  pointsPerAmount?: number;
  /** whatsapp_sale: atendimento no CRM até N dias antes da compra (padrão 30). */
  withinDays?: number;
  /** NPS: nota mínima do promotor (padrão 9) e máxima do detrator (padrão 6). */
  minScore?: number;
  maxScore?: number;
};

export type PointsRule = {
  id: string;
  title: string;
  type: "earn" | "penalty";
  triggerType: "automatic" | "manual";
  eventKey: string;
  pointsAmount: number;
  conditions: RuleConditions;
  isActive: boolean;
  activeSince: Date | null;
};

const upper = (value: string) => value.trim().toLocaleUpperCase("pt-BR");
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined);
const list = (value: unknown) => (Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string" && item.trim() !== "").map(upper))] : undefined);

export function parseConditions(raw: unknown): RuleConditions {
  const source = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const conditions: RuleConditions = {
    minOrderAmount: num(source.minOrderAmount),
    maxOrderAmount: num(source.maxOrderAmount),
    brands: list(source.brands),
    categories: list(source.categories),
    pointsPerAmount: num(source.pointsPerAmount) || undefined,
    withinDays: num(source.withinDays),
    minScore: num(source.minScore),
    maxScore: num(source.maxScore),
  };
  return Object.fromEntries(Object.entries(conditions).filter(([, value]) => value !== undefined && !(Array.isArray(value) && value.length === 0))) as RuleConditions;
}

/** Ganho sempre positivo, perda sempre negativa (independente do sinal digitado). */
export const signedPoints = (type: "earn" | "penalty", amount: number) => (type === "earn" ? Math.abs(Math.round(amount)) : -Math.abs(Math.round(amount)));

/** Pedido faturado do VMSet (espelho), por item; returned = item devolvido. */
export type PointsOrderItem = { amount: number; brand: string; category: string; returned: boolean };
export type PointsOrder = {
  /** "loja-pedido-AAAA-MM-DD" (o número do pedido se repete entre anos). */
  reference: string;
  userId: string;
  store: string;
  orderNumber: string;
  /** Dia do faturamento (DATA_NOTA). */
  day: string;
  items: PointsOrderItem[];
  /** Cliente atendido por este vendedor no WhatsApp do CRM nos dias anteriores à compra. */
  fromWhatsapp: boolean;
  whatsappDaysBefore?: number | null;
  /** Pedido some do espelho (cancelado no VMSet): devido zera. */
  canceled?: boolean;
};

/** Valor elegível do pedido para a regra: itens não devolvidos, das marcas/categorias da regra. */
export function eligibleAmount(order: PointsOrder, conditions: RuleConditions) {
  if (order.canceled) return 0;
  return Math.round(order.items
    .filter((item) => !item.returned)
    .filter((item) => !conditions.brands?.length || conditions.brands.some((brand) => upper(brand) === upper(item.brand)))
    .filter((item) => !conditions.categories?.length || conditions.categories.some((category) => upper(category) === upper(item.category)))
    .reduce((sum, item) => sum + item.amount, 0) * 100) / 100;
}

function originalEligibleAmount(order: PointsOrder, conditions: RuleConditions) {
  return Math.round(order.items
    .filter((item) => !conditions.brands?.length || conditions.brands.some((brand) => upper(brand) === upper(item.brand)))
    .filter((item) => !conditions.categories?.length || conditions.categories.some((category) => upper(category) === upper(item.category)))
    .reduce((sum, item) => sum + item.amount, 0) * 100) / 100;
}

const inForce = (rule: PointsRule, day: string) => rule.isActive && rule.triggerType === "automatic" && Boolean(rule.activeSince) && day >= brDayOf(rule.activeSince as Date);

/** Pontos devidos AGORA pelo pedido nesta regra (0 quando não qualifica mais: devolvido, cancelado, abaixo do mínimo). */
export function duePointsForOrder(order: PointsOrder, rule: PointsRule, credited: { earnedOnOrder: boolean }): number {
  if (SALE_EVENTS.includes(rule.eventKey)) {
    if (rule.eventKey === "whatsapp_sale") {
      const days = order.whatsappDaysBefore ?? (order.fromWhatsapp ? 30 : null);
      if (days === null || days === undefined || days > (rule.conditions.withinDays ?? 30)) return 0;
    }
    const amount = eligibleAmount(order, rule.conditions);
    if (amount <= 0) return 0;
    if (rule.conditions.minOrderAmount !== undefined && amount < rule.conditions.minOrderAmount) return 0;
    if (rule.conditions.maxOrderAmount !== undefined && amount > rule.conditions.maxOrderAmount) return 0;
    const base = signedPoints(rule.type, rule.pointsAmount);
    if (rule.conditions.pointsPerAmount) return Math.floor(amount / rule.conditions.pointsPerAmount) * base;
    const original = originalEligibleAmount(order, rule.conditions);
    if (amount === original) return base;
    return original > 0 ? Math.trunc(Math.abs(base) * amount / original) * Math.sign(base) : 0;
  }
  if (rule.eventKey === "sale_canceled_refund") {
    // Penalidade só para venda que chegou a pontuar e depois foi devolvida (algum item) ou cancelada.
    const hit = order.canceled || order.items.some((item) => item.returned);
    return hit && credited.earnedOnOrder ? signedPoints("penalty", rule.pointsAmount) : 0;
  }
  return 0;
}

export type NpsAnswer = { id: string; userId: string; score: number; answeredAt: Date; store: string | null };

export function duePointsForNps(answer: NpsAnswer, rule: PointsRule): number {
  if (rule.eventKey === "nps_promoter") return answer.score >= (rule.conditions.minScore ?? 9) ? signedPoints(rule.type, rule.pointsAmount) : 0;
  if (rule.eventKey === "nps_detractor") return answer.score <= (rule.conditions.maxScore ?? 6) ? signedPoints(rule.type, rule.pointsAmount) : 0;
  return 0;
}

export type LedgerNet = { points: number; entries: number };
export type PlannedEntry = {
  userId: string;
  ruleId: string;
  type: "earn" | "penalty";
  points: number;
  reason: string;
  referenceType: "order" | "nps";
  referenceId: string;
  /** "rule:<id>#<n>": n = lançamentos que já existiam para a referência + regra (idempotência e sequência). */
  eventKey: string;
  store: string | null;
};

/** Diferença entre o devido e o já lançado: vira um lançamento (ou nada, se já está certo). */
export function planAdjustment(input: { userId: string; rule: PointsRule; due: number; net: LedgerNet; referenceType: "order" | "nps"; referenceId: string; store: string | null; describe: (delta: number, first: boolean) => string }): PlannedEntry | null {
  const delta = input.due - input.net.points;
  if (delta === 0) return null;
  const first = input.net.entries === 0;
  return {
    userId: input.userId,
    ruleId: input.rule.id,
    type: delta > 0 ? "earn" : "penalty",
    points: delta,
    reason: input.describe(delta, first),
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    eventKey: `rule:${input.rule.id}#${input.net.entries}`,
    store: input.store,
  };
}

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const shortDay = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;

/** Motivo claro para o vendedor no extrato. */
export function orderReason(rule: PointsRule, order: PointsOrder, delta: number, first: boolean) {
  const ref = `pedido ${order.orderNumber} da loja ${order.store} (${shortDay(order.day)})`;
  if (rule.eventKey === "sale_canceled_refund") return `${rule.title}: ${ref} ${order.canceled ? "cancelado" : "com devolução"} no VMSet.`;
  if (first) return `${rule.title}: ${ref}, ${money(eligibleAmount(order, rule.conditions))} faturados.`;
  if (delta < 0) return `Estorno de "${rule.title}": ${ref} ${order.canceled ? "cancelado" : "devolvido"} no VMSet${order.canceled ? "" : `, restou ${money(eligibleAmount(order, rule.conditions))}`}.`;
  return `Ajuste de "${rule.title}": ${ref} voltou a valer ${money(eligibleAmount(order, rule.conditions))}.`;
}

export function npsReason(rule: PointsRule, answer: NpsAnswer, delta: number) {
  const when = answer.answeredAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return delta < 0 && rule.eventKey === "nps_promoter" ? `Estorno de "${rule.title}" (pesquisa de ${when}).` : `${rule.title}: nota ${answer.score} na pesquisa do seu atendimento (${when}).`;
}

/** Dia em Brasília (AAAA-MM-DD). */
export function brDayOf(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export const isRuleInForce = inForce;

/** Planeja todos os ajustes de pedidos para as regras em vigor (puro). netOf(reference, ruleId) = já lançado. */
export function planOrders(orders: PointsOrder[], rules: PointsRule[], netOf: (reference: string, ruleId: string) => LedgerNet, earnedOnOrder: (reference: string) => boolean): PlannedEntry[] {
  const plans: PlannedEntry[] = [];
  const orderRules = rules.filter((rule) => SALE_EVENTS.includes(rule.eventKey) || rule.eventKey === "sale_canceled_refund");
  for (const order of orders) {
    for (const rule of orderRules) {
      const net = netOf(order.reference, rule.id);
      // Fora da vigência: não pontua pedido novo, mas o que já foi pontuado continua sendo acompanhado (estorno).
      if (!inForce(rule, order.day) && net.entries === 0) continue;
      const due = rule.isActive || net.entries > 0 ? duePointsForOrder(order, rule, { earnedOnOrder: earnedOnOrder(order.reference) }) : 0;
      // Regra desligada: não cria crédito novo nem "devolve" o que foi dado; só estorna se o pedido perdeu o direito.
      const target = rule.isActive ? due : Math.min(net.points, due === 0 ? 0 : net.points);
      const plan = planAdjustment({ userId: order.userId, rule, due: target, net, referenceType: "order", referenceId: order.reference, store: order.store, describe: (delta, first) => orderReason(rule, order, delta, first) });
      if (plan) plans.push(plan);
    }
  }
  return plans;
}

export function planNps(answers: NpsAnswer[], rules: PointsRule[], netOf: (reference: string, ruleId: string) => LedgerNet): PlannedEntry[] {
  const plans: PlannedEntry[] = [];
  const npsRules = rules.filter((rule) => rule.eventKey === "nps_promoter" || rule.eventKey === "nps_detractor");
  for (const answer of answers) {
    for (const rule of npsRules) {
      const net = netOf(answer.id, rule.id);
      if (net.entries > 0 || !inForce(rule, brDayOf(answer.answeredAt))) continue;
      const due = duePointsForNps(answer, rule);
      const plan = planAdjustment({ userId: answer.userId, rule, due, net, referenceType: "nps", referenceId: answer.id, store: answer.store, describe: (delta) => npsReason(rule, answer, delta) });
      if (plan) plans.push(plan);
    }
  }
  return plans;
}

/** Posição no ranking (1 = primeiro); empate divide a posição. */
export function rankOf(scores: { userId: string; points: number }[], userId: string) {
  const mine = scores.find((score) => score.userId === userId);
  if (!mine) return null;
  return scores.filter((score) => score.points > mine.points).length + 1;
}
