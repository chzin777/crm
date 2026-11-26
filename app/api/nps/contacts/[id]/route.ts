import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { NPS_SCALE, consolidateByCustomer } from "@/lib/nps-scale";

/** Notas de 0 a 10 do cliente (perfil): cada avaliação, soma e média geral. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;
  const [feedbacks, manual] = await Promise.all([
    prisma.npsFeedback.findMany({
      where: { contactId: id, scale: NPS_SCALE, status: "ANSWERED", score: { not: null } },
      orderBy: { answeredAt: "desc" },
      take: 50,
      select: { id: true, score: true, comment: true, answeredAt: true, surveyType: true, orderKey: true, store: true },
    }),
    prisma.npsResponse.findMany({ where: { contactId: id }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, rating: true, comment: true, createdAt: true, surveyKey: true } }),
  ]);
  const answers = [
    ...feedbacks.map((row) => ({ id: row.id, score: row.score ?? 0, comment: row.comment, answeredAt: (row.answeredAt ?? new Date()).toISOString(), surveyType: row.surveyType, orderKey: row.orderKey, store: row.store })),
    ...manual.map((row) => ({ id: row.id, score: row.rating, comment: row.comment, answeredAt: row.createdAt.toISOString(), surveyType: row.surveyKey === "produto" ? "PRODUTO_ADAPTACAO" : "ATENDIMENTO", orderKey: null, store: null })),
  ].sort((a, b) => b.answeredAt.localeCompare(a.answeredAt));
  const [summary] = consolidateByCustomer(answers.map((row) => ({ ...row, contactId: id })));
  return Response.json({ data: { answers, summary: summary ?? null } });
}
