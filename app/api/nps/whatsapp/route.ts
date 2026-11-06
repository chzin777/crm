import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { startOfBrazilDay } from "@/lib/chat/format";

const DAY_MS = 86_400_000;
const LATEST_LIMIT = 100;
const SCORES = [5, 4, 3, 2, 1];

function periodStart(period: string | null) {
  if (period === "today") return startOfBrazilDay();
  return new Date(Date.now() - (period === "7d" ? 7 : 30) * DAY_MS);
}

export async function GET(request: Request) {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const since = periodStart(params.get("period"));
  const attendantId = params.get("attendantId") || undefined;
  const where = { createdAt: { gte: since }, ...(attendantId ? { attendantId } : {}) };

  const [sent, scores, latest, attendants] = await Promise.all([
    prisma.npsFeedback.count({ where }),
    prisma.npsFeedback.groupBy({ by: ["score"], where: { ...where, status: "ANSWERED" }, _count: { _all: true } }),
    prisma.npsFeedback.findMany({
      where: { ...where, status: "ANSWERED" },
      orderBy: { answeredAt: "desc" },
      take: LATEST_LIMIT,
      select: {
        id: true,
        score: true,
        comment: true,
        answeredAt: true,
        contact: { select: { name: true } },
        attendant: { select: { name: true } },
        queue: { select: { name: true } },
      },
    }),
    prisma.user.findMany({
      where: { npsFeedbacks: { some: { createdAt: { gte: since } } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const countOf = (score: number) => scores.find((item) => item.score === score)?._count._all ?? 0;
  const distribution = SCORES.map((score) => ({ score, count: countOf(score) }));
  const answered = distribution.reduce((total, item) => total + item.count, 0);
  const total = distribution.reduce((sum, item) => sum + item.score * item.count, 0);

  return Response.json({
    summary: {
      sent,
      answered,
      responseRate: sent ? Math.round((answered / sent) * 100) : 0,
      average: answered ? Number((total / answered).toFixed(1)) : null,
      satisfied: answered ? Math.round(((countOf(5) + countOf(4)) / answered) * 100) : 0,
      neutral: answered ? Math.round((countOf(3) / answered) * 100) : 0,
      unsatisfied: answered ? Math.round(((countOf(2) + countOf(1)) / answered) * 100) : 0,
    },
    distribution,
    latest,
    attendants,
  });
}
