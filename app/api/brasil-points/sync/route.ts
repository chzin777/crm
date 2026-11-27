import { pointsErrorResponse, requirePointsAdmin } from "@/lib/brasil-points/api";
import { runBrasilPoints } from "@/lib/brasil-points/engine";

/** "Recalcular agora": roda o motor na hora (vendas, devoluções/cancelamentos e NPS). Repetir não duplica pontos. */
export async function POST() {
  const guard = await requirePointsAdmin();
  if (guard.response) return guard.response;
  try {
    return Response.json({ data: await runBrasilPoints() });
  } catch (error) {
    return pointsErrorResponse(error, "recalcular");
  }
}
