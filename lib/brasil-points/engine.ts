import "server-only";
import { prisma } from "@/lib/prisma";
import {
  brDayOf, parseConditions, planNps, planOrders, type LedgerNet, type NpsAnswer, type PlannedEntry, type PointsOrder, type PointsRule,
} from "@/lib/brasil-points/rules";

/**
 * BrasilPointsEngine: único caminho que mexe no saldo. Cada lançamento entra numa transação com trava por vendedor
 * (pg_advisory_xact_lock): o saldo (balance_after) é sempre a soma anterior + os pontos, e a mesma referência + regra
 * + sequência nunca entra duas vezes (índice único parcial em prisma/brasil-points.sql).
 */

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
export type LedgerInput = Omit<PlannedEntry, "ruleId" | "referenceType" | "type" | "store" | "referenceId"> & {
  ruleId: string | null;
  type: "earn" | "penalty" | "redeem" | "adjustment";
  referenceType: "order" | "nps" | "attendance" | "redemption" | "manual";
  referenceId: string | null;
  store: string | null;
  createdBy?: string;
};

export class PointsError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/** Janela máxima que o motor revisa (vendas, devoluções e cancelamentos). */
export const SYNC_WINDOW_DAYS = 45;
const RUN_EVERY_MS = 10 * 60_000;

async function lockUser(tx: Tx, userId: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`brasil-points:${userId}`}))::text AS locked`;
}

export async function balanceOf(tx: Tx | typeof prisma, userId: string) {
  const sum = await tx.brasilPointsLedger.aggregate({ where: { userId }, _sum: { points: true } });
  return sum._sum.points ?? 0;
}

/** Lança um movimento já dentro da trava do vendedor. Repetido (mesma referência + evento) = ignorado (null). */
async function insertLocked(tx: Tx, entry: LedgerInput) {
  if (entry.referenceId) {
    const exists = await tx.brasilPointsLedger.findFirst({ where: { referenceType: entry.referenceType, referenceId: entry.referenceId, eventKey: entry.eventKey }, select: { id: true } });
    if (exists) return null;
  }
  const balance = await balanceOf(tx, entry.userId);
  return tx.brasilPointsLedger.create({
    data: {
      userId: entry.userId, ruleId: entry.ruleId, type: entry.type, points: entry.points, balanceAfter: balance + entry.points, reason: entry.reason,
      referenceType: entry.referenceType, referenceId: entry.referenceId, eventKey: entry.eventKey, store: entry.store, createdBy: entry.createdBy ?? "system",
    },
  });
}

export async function postEntry(entry: LedgerInput) {
  try {
    return await prisma.$transaction(async (tx) => {
      await lockUser(tx, entry.userId);
      return insertLocked(tx, entry);
    });
  } catch (error) {
    // Corrida com outra instância (blue/green): o índice único barrou o duplicado. Nada a fazer.
    if ((error as { code?: string }).code === "P2002") return null;
    throw error;
  }
}

export function toRule(row: { id: string; title: string; type: string; triggerType: string; eventKey: string; pointsAmount: number; conditionsJson: unknown; isActive: boolean; activeSince: Date | null }): PointsRule {
  return {
    id: row.id, title: row.title, type: row.type === "penalty" ? "penalty" : "earn", triggerType: row.triggerType === "manual" ? "manual" : "automatic",
    eventKey: row.eventKey, pointsAmount: row.pointsAmount, conditions: parseConditions(row.conditionsJson), isActive: row.isActive, activeSince: row.activeSince,
  };
}

async function ledgerNets(referenceType: "order" | "nps", referenceIds: string[]) {
  const nets = new Map<string, LedgerNet>();
  const earned = new Set<string>();
  if (!referenceIds.length) return { netOf: () => ({ points: 0, entries: 0 }), earnedOnOrder: () => false };
  const rows = await prisma.brasilPointsLedger.findMany({ where: { referenceType, referenceId: { in: referenceIds } }, select: { referenceId: true, ruleId: true, points: true } });
  for (const row of rows) {
    const key = `${row.referenceId}|${row.ruleId}`;
    const net = nets.get(key) ?? { points: 0, entries: 0 };
    net.points += row.points;
    net.entries += 1;
    nets.set(key, net);
  }
  const rules = await prisma.brasilPointsRule.findMany({ where: { eventKey: { in: ["sale_completed", "sale_high_ticket", "whatsapp_sale"] } }, select: { id: true } });
  const saleRules = new Set(rules.map((rule) => rule.id));
  for (const [key, net] of nets) {
    const [reference, ruleId] = key.split("|");
    if (saleRules.has(ruleId) && net.points > 0) earned.add(reference);
  }
  return {
    netOf: (reference: string, ruleId: string) => nets.get(`${reference}|${ruleId}`) ?? { points: 0, entries: 0 },
    earnedOnOrder: (reference: string) => earned.has(reference),
  };
}

const addDays = (day: string, days: number) => new Date(Date.parse(`${day}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

type SaleRow = { userId: string; sourceKey: string; store: string; orderNumber: string; orderDay: string; invoiceDay: string; productCode: string; amount: number; brand: string; category: string };

/** Pedidos faturados do espelho do VMSet (mesmos filtros do /vendas/ao-vivo) dos vendedores ligados a usuários. */
async function loadOrders(since: string, whatsappDays: number): Promise<PointsOrder[]> {
  const sales = await prisma.$queryRaw<SaleRow[]>`
    SELECT s."userId" AS "userId", COALESCE(v."sourceKey", '') AS "sourceKey", COALESCE(v.store, '') AS store, COALESCE(v."orderNumber", '') AS "orderNumber",
      to_char(v."orderDate", 'YYYY-MM-DD') AS "orderDay", to_char(v."invoiceDate", 'YYYY-MM-DD') AS "invoiceDay", COALESCE(v."productCode", '') AS "productCode",
      COALESCE(v.amount, 0)::float8 AS amount, COALESCE(upper(trim(v.brand)), '') AS brand, COALESCE(upper(trim(v.category)), '') AS category
    FROM "VmsetSale" v
    JOIN "Seller" s ON upper(trim(s.name)) = upper(trim(v.seller)) AND s."userId" IS NOT NULL
    WHERE v.type = 'Venda' AND v."invoiceDate" IS NOT NULL AND v."invoiceDate" >= ${since}::date AND COALESCE(v."orderNumber", '') <> ''
      AND COALESCE(CASE WHEN v.store ~ '^[0-9]{1,9}$' THEN v.store::bigint END NOT BETWEEN 100 AND 199
        AND CASE WHEN v.store ~ '^[0-9]{1,9}$' THEN v.store::bigint END NOT BETWEEN 1000 AND 2999, true)`;
  if (!sales.length) return [];
  const keys = [...new Set(sales.map((row) => row.sourceKey).filter(Boolean))];
  // Devolução repete cliente, pedido, produto e data do pedido original (mesma regra do vendido das campanhas).
  const returns = await prisma.$queryRaw<{ sourceKey: string; orderNumber: string; orderDay: string; productCode: string }[]>`
    SELECT COALESCE("sourceKey", '') AS "sourceKey", COALESCE("orderNumber", '') AS "orderNumber", to_char("orderDate", 'YYYY-MM-DD') AS "orderDay", COALESCE("productCode", '') AS "productCode"
    FROM "VmsetSale" WHERE type = 'Devolucao Cliente' AND "sourceKey" = ANY(${keys}::text[]) AND "orderDate" >= ${addDays(since, -SYNC_WINDOW_DAYS)}::date`;
  const returned = new Set(returns.map((row) => `${row.sourceKey}|${row.orderNumber}|${row.productCode}|${row.orderDay}`));

  // WhatsApp do CRM: conversa do cliente com este vendedor como atendente, aberta até 30 dias antes do faturamento.
  const chats = await prisma.$queryRaw<{ sourceKey: string; userId: string; day: string }[]>`
    SELECT ct."sourceKey" AS "sourceKey", c."assigneeId" AS "userId", to_char(COALESCE(c."lastMessageAt", c."createdAt") AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS day
    FROM "ChatConversation" c JOIN "Contact" ct ON ct.id = c."contactId"
    WHERE c."assigneeId" IS NOT NULL AND ct."sourceKey" = ANY(${keys}::text[]) AND COALESCE(c."lastMessageAt", c."createdAt") >= ${addDays(since, -whatsappDays)}::date`;

  const orders = new Map<string, PointsOrder & { sourceKey: string }>();
  for (const row of sales) {
    const reference = `${row.store}-${row.orderNumber}-${row.orderDay}`;
    const order = orders.get(reference) ?? { reference, userId: row.userId, store: row.store, orderNumber: row.orderNumber, day: row.invoiceDay, items: [], fromWhatsapp: false, sourceKey: row.sourceKey };
    if (row.invoiceDay < order.day) order.day = row.invoiceDay;
    order.items.push({ amount: row.amount, brand: row.brand, category: row.category, returned: returned.has(`${row.sourceKey}|${row.orderNumber}|${row.productCode}|${row.orderDay}`) });
    orders.set(reference, order);
  }
  return [...orders.values()].map(({ sourceKey, ...order }) => {
    const days = chats
      .filter((chat) => chat.sourceKey === sourceKey && chat.userId === order.userId && chat.day <= order.day && chat.day >= addDays(order.day, -whatsappDays))
      .map((chat) => Math.floor((Date.parse(`${order.day}T12:00:00Z`) - Date.parse(`${chat.day}T12:00:00Z`)) / 86_400_000));
    const whatsappDaysBefore = days.length ? Math.min(...days) : null;
    return { ...order, fromWhatsapp: whatsappDaysBefore !== null && whatsappDaysBefore <= 30, whatsappDaysBefore };
  });
}

/** Aplica os lançamentos planejados (um por transação, com trava do vendedor). */
async function applyPlans(plans: PlannedEntry[]) {
  let posted = 0;
  for (const plan of plans) if (await postEntry({ ...plan, createdBy: "system" })) posted += 1;
  return posted;
}

export async function syncSales(now = new Date()) {
  const rules = (await prisma.brasilPointsRule.findMany({ where: { eventKey: { in: ["sale_completed", "sale_high_ticket", "whatsapp_sale", "sale_canceled_refund"] } } })).map(toRule);
  const today = brDayOf(now);
  const windowStart = addDays(today, -SYNC_WINDOW_DAYS);
  const tracked = await prisma.brasilPointsLedger.findMany({ where: { referenceType: "order", createdAt: { gte: new Date(`${windowStart}T03:00:00Z`) } }, distinct: ["referenceId"], select: { referenceId: true, userId: true, store: true } });
  const starts = rules.filter((rule) => rule.isActive && rule.triggerType === "automatic" && rule.activeSince).map((rule) => brDayOf(rule.activeSince as Date));
  if (!starts.length && !tracked.length) return { orders: 0, posted: 0 };
  // Desde a vigência mais antiga (nunca antes da janela); com pedidos já pontuados, a janela inteira (estornos).
  const earliest = [...starts].sort()[0];
  const since = tracked.length || !earliest || earliest < windowStart ? windowStart : earliest;
  const whatsappDays = Math.max(30, ...rules.filter((rule) => rule.eventKey === "whatsapp_sale").map((rule) => rule.conditions.withinDays ?? 30));
  const orders = await loadOrders(since, whatsappDays);

  // Pedido pontuado que sumiu do espelho = cancelado no VMSet. Trava de segurança: espelho vazio/atrasado nunca
  // estorna em massa (só com sync recente e no máximo 10% dos pedidos acompanhados de uma vez).
  const present = new Set(orders.map((order) => order.reference));
  const missing = tracked.filter((row) => row.referenceId && !present.has(row.referenceId) && /-\d{4}-\d{2}-\d{2}$/.test(row.referenceId) && row.referenceId.slice(-10) >= windowStart);
  const lastSync = await prisma.vmsetSale.aggregate({ _max: { syncedAt: true } });
  const fresh = Boolean(lastSync._max.syncedAt && now.getTime() - lastSync._max.syncedAt.getTime() < 3 * 3_600_000);
  if (fresh && orders.length > 0 && missing.length <= Math.max(3, Math.floor(tracked.length * 0.1))) {
    for (const row of missing) {
      const [store, orderNumber] = (row.referenceId as string).split("-");
      orders.push({ reference: row.referenceId as string, userId: row.userId, store: row.store ?? store, orderNumber, day: (row.referenceId as string).slice(-10), items: [], fromWhatsapp: false, canceled: true });
    }
  }
  const { netOf, earnedOnOrder } = await ledgerNets("order", orders.map((order) => order.reference));
  const posted = await applyPlans(planOrders(orders, rules, netOf, earnedOnOrder));
  return { orders: orders.length, posted };
}

export async function syncNps(now = new Date()) {
  const rules = (await prisma.brasilPointsRule.findMany({ where: { eventKey: { in: ["nps_promoter", "nps_detractor"] }, isActive: true, triggerType: "automatic" } })).map(toRule);
  const starts = rules.filter((rule) => rule.activeSince).map((rule) => rule.activeSince as Date);
  if (!starts.length) return { answers: 0, posted: 0 };
  const since = new Date(Math.max(Math.min(...starts.map((date) => date.getTime())), now.getTime() - SYNC_WINDOW_DAYS * 86_400_000));
  const rows = await prisma.npsFeedback.findMany({
    where: { scale: 10, score: { not: null }, answeredAt: { gte: since }, attendantId: { not: null }, OR: [{ responderType: null }, { responderType: { not: "ai" } }] },
    select: { id: true, attendantId: true, score: true, answeredAt: true, store: true },
  });
  const answers: NpsAnswer[] = rows.filter((row) => row.attendantId && row.answeredAt && row.score !== null).map((row) => ({ id: row.id, userId: row.attendantId as string, score: row.score as number, answeredAt: row.answeredAt as Date, store: row.store }));
  const { netOf } = await ledgerNets("nps", answers.map((answer) => answer.id));
  const posted = await applyPlans(planNps(answers, rules, netOf));
  return { answers: answers.length, posted };
}

let lastRun = 0;
let running: Promise<unknown> | null = null;

/** Relógio do CRM (a cada minuto): roda o motor no máximo a cada 10 min, em segundo plano. */
export function scheduleBrasilPoints(now = Date.now()) {
  if (running || now - lastRun < RUN_EVERY_MS) return null;
  lastRun = now;
  running = runBrasilPoints(new Date(now)).finally(() => (running = null));
  return running;
}

export async function runBrasilPoints(now = new Date()) {
  const sales = await syncSales(now);
  const nps = await syncNps(now);
  return { sales, nps };
}

/** Lançamento manual da gestão (bônus ou desconto) com justificativa obrigatória. */
export async function manualEntry(input: { userId: string; points: number; reason: string; ruleId: string | null; by: string }) {
  const points = Math.round(input.points);
  if (!points) throw new PointsError("Informe os pontos (diferente de zero).");
  if (input.reason.trim().length < 5) throw new PointsError("Escreva a justificativa (o vendedor vê no extrato).");
  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { id: true } });
  if (!user) throw new PointsError("Vendedor não encontrado.", 404);
  let eventKey: string | null = null;
  if (input.ruleId) {
    const rule = await prisma.brasilPointsRule.findUnique({ where: { id: input.ruleId }, select: { type: true, triggerType: true, eventKey: true, isActive: true } });
    if (!rule || !rule.isActive || rule.triggerType !== "manual") throw new PointsError("Critério manual indisponível.", 400);
    if ((points > 0 ? "earn" : "penalty") !== rule.type) throw new PointsError("O critério não corresponde ao tipo de lançamento.", 400);
    eventKey = rule.eventKey;
  }
  return postEntry({
    userId: input.userId, ruleId: input.ruleId, type: points > 0 ? "earn" : "penalty", points, reason: input.reason.trim(),
    referenceType: "manual", referenceId: null, eventKey: eventKey ?? (points > 0 ? "manual_bonus" : "manual_penalty"), store: null, createdBy: input.by,
  });
}

/** Resgate: saldo e estoque conferidos e debitados na mesma transação (trava do vendedor + baixa condicional). */
export async function redeemReward(userId: string, rewardId: string) {
  return prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    const reward = await tx.brasilPointsReward.findUnique({ where: { id: rewardId } });
    if (!reward || !reward.isActive) throw new PointsError("Prêmio indisponível.", 404);
    const balance = await balanceOf(tx, userId);
    if (balance < reward.pointsCost) throw new PointsError(`Saldo insuficiente: faltam ${reward.pointsCost - balance} pontos.`, 409);
    if (reward.stockQuantity !== null) {
      const taken = await tx.brasilPointsReward.updateMany({ where: { id: rewardId, stockQuantity: { gt: 0 } }, data: { stockQuantity: { decrement: 1 } } });
      if (taken.count === 0) throw new PointsError("Prêmio esgotado.", 409);
    }
    const redemption = await tx.brasilPointsRedemption.create({ data: { userId, rewardId, pointsSpent: reward.pointsCost, status: "pending" } });
    const entry = await insertLocked(tx, {
      userId, ruleId: null, type: "redeem", points: -reward.pointsCost, reason: `Resgate: ${reward.title} (aguardando aprovação).`,
      referenceType: "redemption", referenceId: redemption.id, eventKey: "redeem", store: null,
    });
    return { redemption, balance: entry?.balanceAfter ?? balance - reward.pointsCost };
  });
}

const NEXT_STATUS: Record<string, string[]> = { pending: ["approved", "rejected", "delivered"], approved: ["delivered", "rejected"], delivered: [], rejected: [] };

/** Aprovar, entregar ou recusar. Recusa devolve os pontos (estorno no extrato) e o estoque. */
export async function reviewRedemption(input: { id: string; status: "approved" | "delivered" | "rejected"; notes: string | null; by: string }) {
  return prisma.$transaction(async (tx) => {
    const initial = await tx.brasilPointsRedemption.findUnique({ where: { id: input.id } });
    if (!initial) throw new PointsError("Resgate não encontrado.", 404);
    await lockUser(tx, initial.userId);
    const current = await tx.brasilPointsRedemption.findUnique({ where: { id: input.id } });
    if (!current) throw new PointsError("Resgate não encontrado.", 404);
    if (!NEXT_STATUS[current.status]?.includes(input.status)) throw new PointsError("Este resgate já foi finalizado.", 409);
    const updated = await tx.brasilPointsRedemption.update({ where: { id: input.id }, data: { status: input.status, adminNotes: input.notes, reviewedBy: input.by, reviewedAt: new Date() } });
    if (input.status === "rejected") {
      const reward = await tx.brasilPointsReward.findUnique({ where: { id: current.rewardId } });
      if (reward && reward.stockQuantity !== null) await tx.brasilPointsReward.update({ where: { id: reward.id }, data: { stockQuantity: { increment: 1 } } });
      await insertLocked(tx, {
        userId: current.userId, ruleId: null, type: "adjustment", points: current.pointsSpent,
        reason: `Estorno do resgate recusado: ${reward?.title ?? "prêmio"}${input.notes ? ` (${input.notes})` : ""}.`,
        referenceType: "redemption", referenceId: current.id, eventKey: "refund", store: null, createdBy: input.by,
      });
    }
    return updated;
  });
}
