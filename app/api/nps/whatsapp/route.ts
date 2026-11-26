import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { startOfBrazilDay } from "@/lib/chat/format";
import { forbidUnless } from "@/lib/api-auth";
import { NPS_SCALE, NPS_SURVEY_TYPES, consolidateByCustomer, isNpsSurveyType, npsMetrics } from "@/lib/nps-scale";

const DAY_MS = 86_400_000;
const LATEST_LIMIT = 100;
const CUSTOMER_LIMIT = 100;
const SCORES = Array.from({ length: 11 }, (_, index) => 10 - index);

function periodStart(period: string | null) {
  if (period === "today") return startOfBrazilDay();
  return new Date(Date.now() - (period === "7d" ? 7 : period === "90d" ? 90 : 30) * DAY_MS);
}

const percent = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);

/** Painel de NPS (0 a 10): pesquisas do encerramento do atendimento e pós-compra do VMSet. Pesquisas antigas de 1 a 5 ficam fora. */
export async function GET(request: Request) {
  const forbidden = await forbidUnless("nps/whatsapp", "GET");
  if (forbidden) return forbidden;
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const since = periodStart(params.get("period"));
  const attendantId = params.get("attendantId") || undefined;
  const surveyType = isNpsSurveyType(params.get("type")) ? params.get("type")! : undefined;
  const where = { createdAt: { gte: since }, scale: NPS_SCALE, ...(attendantId ? { attendantId } : {}), ...(surveyType ? { surveyType } : {}) };

  const [sent, answeredRows, attendants] = await Promise.all([
    prisma.npsFeedback.count({ where }),
    prisma.npsFeedback.findMany({
      where: { ...where, status: "ANSWERED", score: { not: null } },
      orderBy: { answeredAt: "desc" },
      take: 5000,
      select: {
        id: true,
        contactId: true,
        score: true,
        comment: true,
        answeredAt: true,
        surveyType: true,
        source: true,
        orderKey: true,
        store: true,
        seller: true,
        contact: { select: { name: true } },
        attendant: { select: { id: true, name: true } },
        queue: { select: { name: true } },
      },
    }),
    prisma.user.findMany({
      where: { npsFeedbacks: { some: { createdAt: { gte: since }, scale: NPS_SCALE } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const answers = answeredRows.map((row) => ({ ...row, score: row.score ?? 0, answeredAt: row.answeredAt ?? new Date() }));
  const metrics = npsMetrics(answers.map((row) => row.score));
  const countOf = (score: number) => answers.filter((row) => row.score === score).length;

  // Ranking oficial de NPS por loja (pós-compra) e por atendente/vendedor.
  const groupBy = (key: (row: (typeof answers)[number]) => string | null) => {
    const groups = new Map<string, number[]>();
    for (const row of answers) {
      const name = key(row);
      if (name) groups.set(name, [...(groups.get(name) ?? []), row.score]);
    }
    return [...groups.entries()].map(([name, scores]) => ({ name, ...npsMetrics(scores) })).sort((a, b) => b.count - a.count).slice(0, 20);
  };

  // Soma e média por cliente usam todo o histórico da escala nova (não só o período).
  const contactIds = [...new Set(answers.map((row) => row.contactId))].slice(0, CUSTOMER_LIMIT);
  const history = contactIds.length
    ? await prisma.npsFeedback.findMany({ where: { contactId: { in: contactIds }, scale: NPS_SCALE, status: "ANSWERED", score: { not: null } }, select: { contactId: true, surveyType: true, score: true, answeredAt: true } })
    : [];
  const names = new Map(answers.map((row) => [row.contactId, row.contact.name]));
  const customers = consolidateByCustomer(history.map((row) => ({ contactId: row.contactId, surveyType: row.surveyType, score: row.score ?? 0, answeredAt: row.answeredAt ?? new Date() })))
    .map((item) => ({ ...item, name: names.get(item.contactId) ?? "Cliente" }));

  return Response.json({
    summary: {
      sent,
      answered: metrics.count,
      responseRate: percent(metrics.count, sent),
      average: metrics.average,
      sum: metrics.sum,
      nps: metrics.nps,
      promoters: percent(metrics.promoters, metrics.count),
      neutral: percent(metrics.neutrals, metrics.count),
      detractors: percent(metrics.detractors, metrics.count),
      withComment: answers.filter((row) => row.comment).length,
    },
    byType: NPS_SURVEY_TYPES.map((type) => ({ type, ...npsMetrics(answers.filter((row) => row.surveyType === type).map((row) => row.score)) })),
    distribution: SCORES.map((score) => ({ score, count: countOf(score) })),
    latest: answers.slice(0, LATEST_LIMIT).map((row) => ({
      id: row.id,
      contactId: row.contactId,
      score: row.score,
      comment: row.comment,
      answeredAt: row.answeredAt,
      surveyType: row.surveyType,
      source: row.source,
      orderKey: row.orderKey,
      store: row.store,
      seller: row.seller,
      contact: row.contact,
      attendant: row.attendant ? { name: row.attendant.name } : null,
      queue: row.queue,
    })),
    stores: groupBy((row) => row.store),
    people: groupBy((row) => row.attendant?.name ?? row.seller),
    customers,
    attendants,
  });
}
