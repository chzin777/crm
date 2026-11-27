import { requireModule } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { NPS_SCALE, npsMetrics } from "@/lib/nps-scale";

export async function GET() {
  const guard = await requireModule("ia", "configuracoes");
  if (guard.response) return guard.response;
  const where = { responderType: "ai", source: "chat", surveyType: "ATENDIMENTO", scale: NPS_SCALE, createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } };
  const [sent, answered] = await Promise.all([
    prisma.npsFeedback.count({ where }),
    prisma.npsFeedback.findMany({ where: { ...where, status: "ANSWERED", score: { not: null } }, select: { score: true } }),
  ]);
  const metrics = npsMetrics(answered.flatMap((row) => row.score === null ? [] : [row.score]));
  const percent = (count: number, total: number) => total ? Math.round(count * 100 / total) : 0;
  return Response.json({
    nps: metrics.nps, average: metrics.average, answered: metrics.count, sent,
    responseRate: percent(metrics.count, sent),
    promoters: percent(metrics.promoters, metrics.count),
    neutrals: percent(metrics.neutrals, metrics.count),
    detractors: percent(metrics.detractors, metrics.count),
  });
}
