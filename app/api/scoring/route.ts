import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/api-auth";
import { isTier, readThresholds, thresholdProblems, TIERS } from "@/lib/scoring";
import { readScoringSettings, saveThresholds } from "@/lib/scoring-db";

const PAGE_SIZE = 50;
const SORTS = { score_desc: { score: "desc" }, score_asc: { score: "asc" }, name: { name: "asc" }, recent: { scoreUpdatedAt: { sort: "desc", nulls: "last" } } } as const;

/**
 * /clientes-vip: resumo por nível, faixas configuradas e ranking (busca, filtro de nível, ordenação e página),
 * com a última conversa e as últimas movimentações de pontos de cada contato.
 */
export async function GET(request: Request) {
  const guard = await requireModule("pontuacao");
  if (guard.response) return guard.response;
  const params = new URL(request.url).searchParams;
  const search = (params.get("q") ?? "").trim().slice(0, 80);
  const tier = params.get("tier");
  const sort = (params.get("sort") ?? "score_desc") as keyof typeof SORTS;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const onlyScored = params.get("all") !== "1";
  const digits = search.replace(/\D/g, "");
  const where: Prisma.ContactWhereInput = {
    ...(isTier(tier) ? { tier } : {}),
    ...(onlyScored ? { OR: [{ score: { gt: 0 } }, { scoreUpdatedAt: { not: null } }] } : {}),
    ...(search ? { AND: [{ OR: [{ name: { contains: search, mode: "insensitive" } }, ...(digits.length >= 4 ? [{ phone: { contains: digits } }, { cpf: { contains: digits } }] : [])] }] } : {}),
  };
  const [{ thresholds }, groups, total, rows] = await Promise.all([
    readScoringSettings(),
    prisma.contact.groupBy({ by: ["tier"], _count: { _all: true }, _avg: { score: true }, where: onlyScored ? { OR: [{ score: { gt: 0 } }, { scoreUpdatedAt: { not: null } }] } : {} }),
    prisma.contact.count({ where }),
    prisma.contact.findMany({
      where, orderBy: [SORTS[sort] ?? SORTS.score_desc, { id: "asc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
      select: {
        id: true, name: true, phone: true, city: true, score: true, tier: true, scoreUpdatedAt: true,
        chatConversations: { orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } }, take: 1, select: { id: true, lastMessageAt: true } },
        scoreLogs: { orderBy: { createdAt: "desc" }, take: 3, select: { id: true, delta: true, reason: true, createdAt: true } },
      },
    }),
  ]);
  const summary = TIERS.map((item) => {
    const group = groups.find((row) => row.tier === item);
    return { tier: item, count: group?._count._all ?? 0, avgScore: Math.round(group?._avg.score ?? 0) };
  });
  return Response.json({
    thresholds, summary, total, page, pageSize: PAGE_SIZE,
    contacts: rows.map((row) => {
      const conversation = row.chatConversations[0] ?? null;
      const activity = [row.scoreUpdatedAt, conversation?.lastMessageAt].filter((value): value is Date => !!value).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
      return { id: row.id, name: row.name, phone: row.phone, city: row.city, score: row.score, tier: row.tier, lastActivity: activity, conversationId: conversation?.id ?? null, logs: row.scoreLogs };
    }),
  });
}

/** Novas faixas dos níveis: valida (crescentes) e reclassifica todos os contatos. */
export async function PUT(request: Request) {
  const guard = await requireModule("pontuacao");
  if (guard.response) return guard.response;
  const body = (await request.json().catch(() => null)) as { thresholds?: Record<string, unknown> } | null;
  const raw = body?.thresholds ?? {};
  const problems = thresholdProblems(raw);
  if (problems.length) return Response.json({ error: problems[0] }, { status: 400 });
  const thresholds = readThresholds(raw);
  const moved = await saveThresholds(thresholds);
  return Response.json({ thresholds, moved });
}
