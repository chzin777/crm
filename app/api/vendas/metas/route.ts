import { requireModule } from "@/lib/api-auth";
import { goalsForMonth, saveCompanyGoals, saveGoals, syncSellersIfStale } from "@/lib/seller-goals";
import { parseGoalsPayload } from "@/lib/seller-goals-schema";

const GOAL_MODULES = ["metas", "lojas", "usuarios"] as const;

/** Metas do mês: vendedores (sincronizados do VMSet se a lista estiver velha), meta de cada um, realizado e soma por loja. */
export async function GET(request: Request) {
  const guard = await requireModule(...GOAL_MODULES);
  if (guard.response) return guard.response;
  await syncSellersIfStale();
  const month = new URL(request.url).searchParams.get("month");
  return Response.json({ data: await goalsForMonth(month ?? "") }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Grava metas do mês (zod): { month: "2026-11", goals: [{ sellerId, amount?, quantity? }], company?: { global?, brands?: [{ key, label, amount?, quantity? }] } }.
 * amount = R$, quantity = quantidade inteira; campo omitido fica como está; os dois zerados removem a meta.
 */
export async function PUT(request: Request) {
  const guard = await requireModule(...GOAL_MODULES);
  if (guard.response) return guard.response;
  const parsed = parseGoalsPayload(await request.json().catch(() => null));
  if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });
  const { month, goals, company } = parsed.data;
  let saved = goals.length ? await saveGoals(month, goals, guard.user.id) : 0;
  if (company && (company.global !== undefined || company.brands.length)) saved += await saveCompanyGoals(month, company, guard.user.id);
  return Response.json({ saved, data: await goalsForMonth(month) });
}
