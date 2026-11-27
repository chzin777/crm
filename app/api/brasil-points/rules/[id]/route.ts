import { prisma } from "@/lib/prisma";
import { pointsErrorResponse, requirePointsAdmin, ruleBody, ruleData } from "@/lib/brasil-points/api";

type Context = { params: Promise<{ id: string }> };

/** Editar ou ativar/desativar. Ativar começa a vigência agora (nada retroativo); desativar para de pontuar eventos novos. */
export async function PUT(request: Request, context: Context) {
  const guard = await requirePointsAdmin();
  if (guard.response) return guard.response;
  const { id } = await context.params;
  const current = await prisma.brasilPointsRule.findUnique({ where: { id } });
  if (!current) return Response.json({ error: "Regra não encontrada." }, { status: 404 });
  const parsed = ruleBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Regra inválida." }, { status: 400 });
  try {
    const rule = await prisma.brasilPointsRule.update({ where: { id }, data: ruleData(parsed.data, current) });
    return Response.json({ data: rule });
  } catch (error) {
    return pointsErrorResponse(error, "editar regra");
  }
}

/** Regra que já pontuou alguém só é desligada (o extrato continua mostrando o nome dela); sem uso, é apagada. */
export async function DELETE(_request: Request, context: Context) {
  const guard = await requirePointsAdmin();
  if (guard.response) return guard.response;
  const { id } = await context.params;
  const used = await prisma.brasilPointsLedger.count({ where: { ruleId: id } });
  if (used > 0) {
    await prisma.brasilPointsRule.update({ where: { id }, data: { isActive: false } });
    return Response.json({ ok: true, deactivated: true });
  }
  await prisma.brasilPointsRule.deleteMany({ where: { id } });
  return Response.json({ ok: true, deleted: true });
}
