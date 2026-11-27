import { pointsErrorResponse } from "@/lib/brasil-points/api";
import { redeemReward } from "@/lib/brasil-points/engine";
import { requireMobileUser } from "@/lib/brasil-points/mobile";

type Context = { params: Promise<{ id: string }> };

/** Resgatar: saldo e estoque conferidos e debitados na mesma transação; fica pendente até a gestão aprovar. */
export async function POST(_request: Request, context: Context) {
  const guard = await requireMobileUser();
  if (guard.response) return guard.response;
  const { id } = await context.params;
  try {
    const { redemption, balance } = await redeemReward(guard.user.id, id);
    return Response.json({ data: { id: redemption.id, status: redemption.status, points_spent: redemption.pointsSpent, available_points: balance } }, { status: 201 });
  } catch (error) {
    return pointsErrorResponse(error, "resgate");
  }
}
