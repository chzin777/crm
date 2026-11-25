import { requireModule } from "@/lib/api-auth";
import { goalsForMonth, saveCompanyGoals, saveGoals, syncSellersIfStale } from "@/lib/seller-goals";

const GOAL_MODULES = ["metas", "lojas", "usuarios"] as const;

/** Metas do mês: vendedores (sincronizados do VMSet se a lista estiver velha), meta de cada um e soma por loja. */
export async function GET(request: Request) {
  const guard = await requireModule(...GOAL_MODULES);
  if (guard.response) return guard.response;
  await syncSellersIfStale();
  const month = new URL(request.url).searchParams.get("month");
  return Response.json({ data: await goalsForMonth(month ?? "") }, { headers: { "Cache-Control": "no-store" } });
}

const validAmount = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 1_000_000_000;

/**
 * Grava metas do mês (0 remove a meta):
 * { month: "2026-11", goals: [{ sellerId, amount }], company?: { global?: number, brands?: [{ key, label, amount }] } }
 */
export async function PUT(request: Request) {
  const guard = await requireModule(...GOAL_MODULES);
  if (guard.response) return guard.response;
  const body = (await request.json().catch(() => null)) as { month?: string; goals?: { sellerId?: unknown; amount?: unknown }[]; company?: { global?: unknown; brands?: { key?: unknown; label?: unknown; amount?: unknown }[] } } | null;
  if (!body?.month || !/^\d{4}-\d{2}$/.test(body.month)) return Response.json({ error: "Informe o mês (AAAA-MM)." }, { status: 400 });
  const goals = (Array.isArray(body.goals) ? body.goals : [])
    .filter((goal): goal is { sellerId: string; amount: number } => typeof goal.sellerId === "string" && validAmount(goal.amount))
    .slice(0, 2000);
  const brands = (Array.isArray(body.company?.brands) ? body.company.brands : [])
    .filter((brand): brand is { key: string; label: string; amount: number } => typeof brand.key === "string" && brand.key.trim().length > 0 && brand.key.length <= 120 && typeof brand.label === "string" && validAmount(brand.amount))
    .slice(0, 500);
  const global = validAmount(body.company?.global) ? body.company.global : undefined;
  let saved = goals.length ? await saveGoals(body.month, goals, guard.user.id) : 0;
  if (global !== undefined || brands.length) saved += await saveCompanyGoals(body.month, { global, brands }, guard.user.id);
  return Response.json({ saved, data: await goalsForMonth(body.month) });
}
