import { requirePointsAdmin } from "@/lib/brasil-points/api";
import { ranking, standings, type RankingPeriod } from "@/lib/brasil-points/queries";

/** Ranking & extrato (gestão): placar de todos os vendedores, por período (mês ou geral) e loja. */
export async function GET(request: Request) {
  const guard = await requirePointsAdmin();
  if (guard.response) return guard.response;
  const params = new URL(request.url).searchParams;
  const period: RankingPeriod = params.get("period") === "all" ? "all" : "month";
  const store = params.get("store") || null;
  const list = await standings();
  const stores = [...new Set(list.map((item) => item.store).filter((value): value is string => Boolean(value)))].sort((a, b) => Number(a) - Number(b));
  return Response.json({ data: { period, store, stores, items: ranking(list, period, store) } }, { headers: { "Cache-Control": "no-store" } });
}
