import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/api-auth";
import { changeScore } from "@/lib/scoring-db";

/** Histórico completo de pontos do contato (últimas 100 movimentações). */
export async function GET(_request: Request, context: { params: Promise<{ contactId: string }> }) {
  const guard = await requireModule("pontuacao", "contatos", "chat");
  if (guard.response) return guard.response;
  const { contactId } = await context.params;
  const logs = await prisma.contactScoreLog.findMany({ where: { contactId }, orderBy: { createdAt: "desc" }, take: 100 });
  return Response.json({ logs });
}

/** Ajuste manual da equipe (+/− pontos com motivo), registrado como "equipe" no histórico. */
export async function POST(request: Request, context: { params: Promise<{ contactId: string }> }) {
  const guard = await requireModule("pontuacao");
  if (guard.response) return guard.response;
  const { contactId } = await context.params;
  const body = (await request.json().catch(() => null)) as { delta?: unknown; reason?: unknown } | null;
  const delta = Math.round(Number(body?.delta));
  const reason = String(body?.reason ?? "").trim().slice(0, 200);
  if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 100_000) return Response.json({ error: "Informe os pontos (positivo soma, negativo tira)." }, { status: 400 });
  if (!reason) return Response.json({ error: "Informe o motivo." }, { status: 400 });
  try {
    const change = await changeScore(contactId, delta, `${reason} (por ${guard.user.name ?? "equipe"})`, "equipe");
    return Response.json({ change });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível ajustar." }, { status: 400 });
  }
}
