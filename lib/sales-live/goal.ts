import type { SalesGoal } from "@/lib/sales-live/feed";

/**
 * Meta do Dia do /vendas/ao-vivo: uma só para a empresa (não por usuário nem por navegador), gravada no banco
 * (CrmWorkspaceData). store null = meta geral; código de loja = meta daquela loja. updatedBy/updatedAt só auditam.
 */
export type GoalStore = {
  findUnique(args: { where: { key: string } }): Promise<{ value: unknown; updatedAt?: Date } | null>;
  upsert(args: { where: { key: string }; create: { key: string; value: SalesGoal }; update: { value: SalesGoal } }): Promise<unknown>;
  deleteMany(args: { where: { key: string } }): Promise<unknown>;
};

export const MAX_GOAL = 100_000_000;

export const goalKey = (store: string | null) => (store ? `sales-live:goal:store:${store}` : "sales-live:goal:all");

export function parseGoal(value: unknown, store: string | null): SalesGoal | null {
  const raw = (value ?? {}) as Partial<SalesGoal>;
  const amount = typeof raw.amount === "number" && Number.isFinite(raw.amount) ? Math.round(raw.amount) : 0;
  if (amount <= 0) return null;
  return { amount, store, updatedBy: typeof raw.updatedBy === "string" ? raw.updatedBy : null, updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date(0).toISOString() };
}

/** Valor enviado pela tela: número positivo (arredondado) ou null/0 para remover a meta. */
export function normalizeGoalAmount(input: unknown): number | null | "invalid" {
  if (input === null || input === 0) return null;
  if (typeof input !== "number" || !Number.isFinite(input) || input < 0 || input > MAX_GOAL) return "invalid";
  const amount = Math.round(input);
  return amount > 0 ? amount : null;
}

export async function readGoal(db: GoalStore, store: string | null = null) {
  const row = await db.findUnique({ where: { key: goalKey(store) } });
  return row ? parseGoal(row.value, store) : null;
}

export async function writeGoal(db: GoalStore, amount: number | null, by: string | null, store: string | null = null, now = new Date()) {
  const key = goalKey(store);
  if (!amount) {
    await db.deleteMany({ where: { key } });
    return null;
  }
  const goal: SalesGoal = { amount, store, updatedBy: by, updatedAt: now.toISOString() };
  await db.upsert({ where: { key }, create: { key, value: goal }, update: { value: goal } });
  return goal;
}

/** Percentual atingido (inteiro, pode passar de 100). */
export function goalProgress(revenue: number, goal: SalesGoal | null) {
  if (!goal || goal.amount <= 0) return null;
  return Math.round((Math.max(0, revenue) / goal.amount) * 100);
}
