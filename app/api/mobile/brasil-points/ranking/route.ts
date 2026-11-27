import { ranking, standings, type RankingPeriod } from "@/lib/brasil-points/queries";
import { noStore, requireMobileUser } from "@/lib/brasil-points/mobile";

/** Ranking do app: ?period=month|all&scope=general|store. Top 50 + a linha do vendedor logado (destacada com me: true). */
export async function GET(request: Request) {
  const guard = await requireMobileUser();
  if (guard.response) return guard.response;
  const params = new URL(request.url).searchParams;
  const period: RankingPeriod = params.get("period") === "all" ? "all" : "month";
  const list = await standings();
  const mine = list.find((item) => item.userId === guard.user.id);
  const store = params.get("scope") === "store" ? mine?.store ?? null : null;
  const rows = ranking(list, period, store).map((item) => ({
    position: item.position, user_id: item.userId, name: item.name, initials: item.initials, avatar: item.image, store: item.store, points: item.points, me: item.userId === guard.user.id,
  }));
  return Response.json({ data: { period, store, total: rows.length, top: rows.slice(0, 50), me: rows.find((row) => row.me) ?? null } }, noStore);
}
