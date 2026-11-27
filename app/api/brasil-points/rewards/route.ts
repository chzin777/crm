import { prisma } from "@/lib/prisma";
import { pointsErrorResponse, requirePointsAdmin, rewardBody } from "@/lib/brasil-points/api";

/** Catálogo de prêmios (gestão): ativos e desligados. */
export async function GET() {
  const guard = await requirePointsAdmin();
  if (guard.response) return guard.response;
  const rewards = await prisma.brasilPointsReward.findMany({ orderBy: [{ isActive: "desc" }, { pointsCost: "asc" }] });
  return Response.json({ data: rewards }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const guard = await requirePointsAdmin();
  if (guard.response) return guard.response;
  const parsed = rewardBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Prêmio inválido." }, { status: 400 });
  try {
    const reward = await prisma.brasilPointsReward.create({ data: { ...parsed.data, imageUrl: parsed.data.imageUrl ?? null } });
    return Response.json({ data: reward }, { status: 201 });
  } catch (error) {
    return pointsErrorResponse(error, "criar prêmio");
  }
}
