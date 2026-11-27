import { prisma } from "@/lib/prisma";
import { pointsErrorResponse, requirePointsAdmin, ruleBody, ruleData } from "@/lib/brasil-points/api";

/** Critérios & Regras: todas (ativas e desligadas), ganhos primeiro. */
export async function GET() {
  const guard = await requirePointsAdmin();
  if (guard.response) return guard.response;
  const rules = await prisma.brasilPointsRule.findMany({ orderBy: [{ type: "asc" }, { isActive: "desc" }, { title: "asc" }] });
  return Response.json({ data: rules }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const guard = await requirePointsAdmin();
  if (guard.response) return guard.response;
  const parsed = ruleBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Regra inválida." }, { status: 400 });
  try {
    const rule = await prisma.brasilPointsRule.create({ data: ruleData(parsed.data) });
    return Response.json({ data: rule }, { status: 201 });
  } catch (error) {
    return pointsErrorResponse(error, "criar regra");
  }
}
