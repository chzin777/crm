import "server-only";
import { prisma } from "@/lib/prisma";
import { EVENT_LABELS, rankOf, type EventKey } from "@/lib/brasil-points/rules";

/** Início do mês em Brasília (instante UTC). */
export function monthStart(now = new Date()) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(now);
  return new Date(`${day}-01T03:00:00Z`);
}

const initials = (name: string) => name.trim().split(/\s+/).filter(Boolean).map((word) => word[0]).slice(0, 2).join("").toUpperCase() || "?";

/** Participantes: usuários ligados a vendedor do VMSet + quem já tem movimento no extrato. Loja = loja principal do vendedor. */
export async function participants() {
  const [sellers, moved] = await Promise.all([
    prisma.seller.findMany({ where: { userId: { not: null } }, select: { userId: true, storeNumber: true, active: true }, orderBy: { active: "desc" } }),
    prisma.brasilPointsLedger.findMany({ distinct: ["userId"], select: { userId: true } }),
  ]);
  const storeOf = new Map<string, string | null>();
  for (const seller of sellers) if (seller.userId && !storeOf.has(seller.userId)) storeOf.set(seller.userId, seller.storeNumber ? String(seller.storeNumber) : null);
  for (const row of moved) if (!storeOf.has(row.userId)) storeOf.set(row.userId, null);
  const users = await prisma.user.findMany({ where: { id: { in: [...storeOf.keys()] } }, select: { id: true, name: true, image: true, banned: true } });
  return users.filter((user) => !user.banned).map((user) => ({ userId: user.id, name: user.name, image: user.image, initials: initials(user.name), store: storeOf.get(user.id) ?? null }));
}

export type Standing = { userId: string; name: string; image: string | null; initials: string; store: string | null; balance: number; earnedMonth: number; lostMonth: number; monthPoints: number; totalPoints: number };

/**
 * Placar: saldo (tudo, inclusive resgates), ganhos e perdas do mês, pontos do mês (ganhos − perdas, base do ranking
 * mensal) e pontos totais (sem resgates: resgatar não derruba ninguém no ranking geral).
 */
export async function standings(now = new Date()): Promise<Standing[]> {
  const people = await participants();
  if (!people.length) return [];
  const ids = people.map((person) => person.userId);
  const start = monthStart(now);
  const [balances, month, total] = await Promise.all([
    prisma.brasilPointsLedger.groupBy({ by: ["userId"], where: { userId: { in: ids } }, _sum: { points: true } }),
    prisma.brasilPointsLedger.groupBy({ by: ["userId", "type"], where: { userId: { in: ids }, createdAt: { gte: start }, type: { in: ["earn", "penalty"] } }, _sum: { points: true } }),
    prisma.brasilPointsLedger.groupBy({ by: ["userId"], where: { userId: { in: ids }, type: { in: ["earn", "penalty"] } }, _sum: { points: true } }),
  ]);
  const balanceOf = new Map(balances.map((row) => [row.userId, row._sum.points ?? 0]));
  const totalOf = new Map(total.map((row) => [row.userId, row._sum.points ?? 0]));
  return people.map((person) => {
    const earned = month.filter((row) => row.userId === person.userId && row.type === "earn").reduce((sum, row) => sum + (row._sum.points ?? 0), 0);
    const lost = -month.filter((row) => row.userId === person.userId && row.type === "penalty").reduce((sum, row) => sum + (row._sum.points ?? 0), 0);
    return { ...person, balance: balanceOf.get(person.userId) ?? 0, earnedMonth: earned, lostMonth: lost, monthPoints: earned - lost, totalPoints: totalOf.get(person.userId) ?? 0 };
  });
}

export type RankingPeriod = "month" | "all";

export function ranking(list: Standing[], period: RankingPeriod, store: string | null = null) {
  const score = (item: Standing) => (period === "month" ? item.monthPoints : item.totalPoints);
  const scoped = store ? list.filter((item) => item.store === store) : list;
  const sorted = [...scoped].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name, "pt-BR"));
  const scores = sorted.map((item) => ({ userId: item.userId, points: score(item) }));
  return sorted.map((item) => ({ ...item, points: score(item), position: rankOf(scores, item.userId) as number }));
}

export const LEDGER_FILTERS = { todos: undefined, ganhos: ["earn"], perdas: ["penalty"], resgates: ["redeem", "adjustment"] } as const;
export type LedgerFilter = keyof typeof LEDGER_FILTERS;

const TYPE_TITLES: Record<string, string> = { earn: "Pontos ganhos", penalty: "Pontos perdidos", redeem: "Resgate de prêmio", adjustment: "Ajuste" };

/** Extrato paginado (mais recente primeiro) com título, motivo, valor e referência legível. */
export async function ledgerPage(userId: string, filter: LedgerFilter, page: number, pageSize = 20) {
  const types = LEDGER_FILTERS[filter];
  const where = { userId, ...(types ? { type: { in: [...types] } } : {}) };
  const [total, rows] = await Promise.all([
    prisma.brasilPointsLedger.count({ where }),
    prisma.brasilPointsLedger.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  const ruleIds = [...new Set(rows.map((row) => row.ruleId).filter((id): id is string => Boolean(id)))];
  const rules = ruleIds.length ? await prisma.brasilPointsRule.findMany({ where: { id: { in: ruleIds } }, select: { id: true, title: true } }) : [];
  const titleOf = new Map(rules.map((rule) => [rule.id, rule.title]));
  return {
    page,
    pageSize,
    total,
    items: rows.map((row) => ({
      id: row.id,
      type: row.type,
      title: (row.ruleId && titleOf.get(row.ruleId)) || EVENT_LABELS[row.eventKey as EventKey] || TYPE_TITLES[row.type] || "Movimento",
      reason: row.reason,
      points: row.points,
      label: row.points > 0 ? `+${row.points}` : String(row.points),
      balanceAfter: row.balanceAfter,
      reference: referenceLabel(row.referenceType, row.referenceId),
      referenceType: row.referenceType,
      referenceId: row.referenceId,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

export function referenceLabel(type: string, id: string | null) {
  if (!id) return type === "manual" ? "Lançamento da gestão" : null;
  if (type === "order") {
    const match = /^(.*)-(\d+)-(\d{4})-(\d{2})-(\d{2})$/.exec(id);
    return match ? `Pedido ${match[2]} · Loja ${match[1]} · ${match[5]}/${match[4]}/${match[3]}` : `Pedido ${id}`;
  }
  if (type === "nps") return "Pesquisa NPS";
  if (type === "redemption") return "Resgate";
  return id;
}

export async function activeRewards() {
  return prisma.brasilPointsReward.findMany({ where: { isActive: true }, orderBy: [{ pointsCost: "asc" }, { title: "asc" }] });
}

/** Próximo prêmio que o vendedor ainda não alcança (o mais barato acima do saldo) e o progresso até ele. */
export function nextReward(rewards: { id: string; title: string; pointsCost: number; stockQuantity: number | null }[], balance: number) {
  const target = rewards.filter((reward) => reward.stockQuantity !== 0 && reward.pointsCost > balance).sort((a, b) => a.pointsCost - b.pointsCost)[0];
  if (!target) return null;
  return { id: target.id, title: target.title, pointsCost: target.pointsCost, missing: target.pointsCost - Math.max(0, balance), progress: Math.max(0, Math.min(100, Math.round((Math.max(0, balance) / target.pointsCost) * 100))) };
}
