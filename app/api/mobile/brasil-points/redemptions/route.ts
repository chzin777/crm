import { prisma } from "@/lib/prisma";
import { noStore, requireMobileUser } from "@/lib/brasil-points/mobile";

const STATUS_LABELS: Record<string, string> = { pending: "Aguardando aprovação", approved: "Aprovado", delivered: "Entregue", rejected: "Recusado (pontos devolvidos)" };

/** Resgates do vendedor logado, mais recentes primeiro. */
export async function GET() {
  const guard = await requireMobileUser();
  if (guard.response) return guard.response;
  const rows = await prisma.brasilPointsRedemption.findMany({ where: { userId: guard.user.id }, orderBy: { createdAt: "desc" }, take: 100 });
  const rewards = await prisma.brasilPointsReward.findMany({ where: { id: { in: [...new Set(rows.map((row) => row.rewardId))] } }, select: { id: true, title: true, imageUrl: true } });
  const rewardOf = new Map(rewards.map((reward) => [reward.id, reward]));
  return Response.json({
    data: rows.map((row) => ({
      id: row.id,
      reward_id: row.rewardId,
      title: rewardOf.get(row.rewardId)?.title ?? "Prêmio",
      image_url: rewardOf.get(row.rewardId)?.imageUrl ?? null,
      points_spent: row.pointsSpent,
      status: row.status,
      status_label: STATUS_LABELS[row.status] ?? row.status,
      admin_notes: row.adminNotes,
      created_at: row.createdAt.toISOString(),
      reviewed_at: row.reviewedAt?.toISOString() ?? null,
    })),
  }, noStore);
}
