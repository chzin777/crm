import { activeRewards } from "@/lib/brasil-points/queries";
import { balanceOf } from "@/lib/brasil-points/engine";
import { noStore, requireMobileUser } from "@/lib/brasil-points/mobile";
import { prisma } from "@/lib/prisma";

/** Catálogo de prêmios disponíveis com o que falta para cada um. */
export async function GET() {
  const guard = await requireMobileUser();
  if (guard.response) return guard.response;
  const [rewards, balance] = await Promise.all([activeRewards(), balanceOf(prisma, guard.user.id)]);
  return Response.json({
    data: {
      available_points: balance,
      items: rewards.map((reward) => ({
        id: reward.id,
        title: reward.title,
        description: reward.description,
        image_url: reward.imageUrl,
        points_cost: reward.pointsCost,
        stock: reward.stockQuantity,
        sold_out: reward.stockQuantity === 0,
        can_redeem: reward.stockQuantity !== 0 && balance >= reward.pointsCost,
        missing: Math.max(0, reward.pointsCost - balance),
      })),
    },
  }, noStore);
}
