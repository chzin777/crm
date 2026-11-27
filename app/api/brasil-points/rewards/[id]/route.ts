import { prisma } from "@/lib/prisma";
import { pointsErrorResponse, requirePointsAdmin, rewardBody } from "@/lib/brasil-points/api";

type Context = { params: Promise<{ id: string }> };

/** Editar prêmio (custo, estoque, ativo). Resgates já feitos mantêm os pontos que custaram na hora. */
export async function PUT(request: Request, context: Context) {
  const guard = await requirePointsAdmin();
  if (guard.response) return guard.response;
  const { id } = await context.params;
  const parsed = rewardBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Prêmio inválido." }, { status: 400 });
  try {
    const exists = await prisma.brasilPointsReward.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return Response.json({ error: "Prêmio não encontrado." }, { status: 404 });
    const reward = await prisma.brasilPointsReward.update({ where: { id }, data: { ...parsed.data, imageUrl: parsed.data.imageUrl ?? null } });
    return Response.json({ data: reward });
  } catch (error) {
    return pointsErrorResponse(error, "editar prêmio");
  }
}
