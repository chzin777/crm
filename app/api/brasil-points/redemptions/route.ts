import { prisma } from "@/lib/prisma";
import { requirePointsAdmin } from "@/lib/brasil-points/api";

const STATUSES = ["pending", "approved", "delivered", "rejected"] as const;

/** Fila de resgates (gestão): ?status=pending|approved|delivered|rejected (padrão: pendentes e aprovados). */
export async function GET(request: Request) {
  const guard = await requirePointsAdmin();
  if (guard.response) return guard.response;
  const status = new URL(request.url).searchParams.get("status");
  const where = status && (STATUSES as readonly string[]).includes(status) ? { status } : { status: { in: ["pending", "approved"] } };
  const rows = await prisma.brasilPointsRedemption.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 });
  const [users, rewards] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((row) => row.userId))] } }, select: { id: true, name: true } }),
    prisma.brasilPointsReward.findMany({ where: { id: { in: [...new Set(rows.map((row) => row.rewardId))] } }, select: { id: true, title: true } }),
  ]);
  const userName = new Map(users.map((user) => [user.id, user.name]));
  const rewardTitle = new Map(rewards.map((reward) => [reward.id, reward.title]));
  return Response.json({ data: rows.map((row) => ({ ...row, userName: userName.get(row.userId) ?? "Vendedor", rewardTitle: rewardTitle.get(row.rewardId) ?? "Prêmio" })) }, { headers: { "Cache-Control": "no-store" } });
}
