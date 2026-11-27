import { z } from "zod";
import { adminName, pointsErrorResponse, requirePointsAdmin } from "@/lib/brasil-points/api";
import { reviewRedemption } from "@/lib/brasil-points/engine";

type Context = { params: Promise<{ id: string }> };
const body = z.object({ status: z.enum(["approved", "delivered", "rejected"]), notes: z.string().trim().max(500).nullable().optional() });

/** Aprovar, marcar como entregue ou recusar (recusa devolve os pontos e o estoque). */
export async function PUT(request: Request, context: Context) {
  const guard = await requirePointsAdmin();
  if (guard.response) return guard.response;
  const { id } = await context.params;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Status inválido." }, { status: 400 });
  if (parsed.data.status === "rejected" && !parsed.data.notes) return Response.json({ error: "Explique o motivo da recusa (o vendedor vê no app)." }, { status: 400 });
  try {
    const redemption = await reviewRedemption({ id, status: parsed.data.status, notes: parsed.data.notes || null, by: adminName(guard.user) });
    return Response.json({ data: redemption });
  } catch (error) {
    return pointsErrorResponse(error, "revisar resgate");
  }
}
