import { activeRewards, nextReward, ranking, standings } from "@/lib/brasil-points/queries";
import { noStore, requireMobileUser } from "@/lib/brasil-points/mobile";
import { balanceOf } from "@/lib/brasil-points/engine";
import { prisma } from "@/lib/prisma";

/** Resumo do app: saldo, ganho/perdido no mês, posição no ranking geral e da loja (mês) e progresso ao próximo prêmio. */
export async function GET() {
  const guard = await requireMobileUser();
  if (guard.response) return guard.response;
  const userId = guard.user.id;
  const [list, rewards] = await Promise.all([standings(), activeRewards()]);
  const me = list.find((item) => item.userId === userId);
  const balance = me?.balance ?? (await balanceOf(prisma, userId));
  const general = ranking(list, "month");
  const store = me?.store ? ranking(list, "month", me.store) : [];
  return Response.json({
    data: {
      available_points: balance,
      earned_month: me?.earnedMonth ?? 0,
      lost_month: me?.lostMonth ?? 0,
      month_points: me?.monthPoints ?? 0,
      rank_general: general.find((item) => item.userId === userId)?.position ?? null,
      rank_general_total: general.length,
      store: me?.store ?? null,
      rank_store: store.find((item) => item.userId === userId)?.position ?? null,
      rank_store_total: store.length,
      next_reward: nextReward(rewards, balance),
    },
  }, noStore);
}
