import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/api-auth";
import { isTier, readThresholds, thresholdProblems, TIERS } from "@/lib/scoring";
import { readScoringSettings, saveThresholds } from "@/lib/scoring-db";
import { RFVP_SEGMENT_BY_KEY } from "@/lib/rfvp";

const PAGE_SIZES = [15, 25, 50];
const SORTS = { score_desc: { score: "desc" }, score_asc: { score: "asc" }, name: { name: "asc" }, recent: { scoreUpdatedAt: { sort: "desc", nulls: "last" } }, rfvp_desc: { rfvpCode: { sort: "desc", nulls: "last" } }, rfvp_asc: { rfvpCode: { sort: "asc", nulls: "last" } }, value_desc: { totalSpent: "desc" } } as const;
const PILLAR_COLUMNS = { r: "rfvpR", f: "rfvpF", v: "rfvpV", p: "rfvpP" } as const;

/** Filtros por nota mínima/máxima de cada pilar do RFV-P (?rMin=4&pMax=2) e por segmento. */
function rfvpWhere(params: URLSearchParams): Prisma.ContactWhereInput[] {
  const filters: Prisma.ContactWhereInput[] = [];
  for (const [pillar, column] of Object.entries(PILLAR_COLUMNS)) {
    const min = Number(params.get(`${pillar}Min`));
    const max = Number(params.get(`${pillar}Max`));
    const range = { ...(min >= 1 && min <= 5 ? { gte: Math.round(min) } : {}), ...(max >= 1 && max <= 5 ? { lte: Math.round(max) } : {}) };
    if (Object.keys(range).length) filters.push({ [column]: range });
  }
  const segments = (params.get("segment") ?? "").split(",").filter((key) => RFVP_SEGMENT_BY_KEY[key]);
  if (segments.length) filters.push({ rfvpSegment: { in: segments } });
  return filters;
}

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
  const pageSize = PAGE_SIZES.includes(Number(params.get("pageSize"))) ? Number(params.get("pageSize")) : 25;
  const rfvpFilters = rfvpWhere(params);
  // Filtro de RFV-P olha a base toda (não só quem tem Lead Score).
  const onlyScored = params.get("all") !== "1" && !rfvpFilters.length;
  const digits = search.replace(/\D/g, "");
  const where: Prisma.ContactWhereInput = {
    ...(isTier(tier) ? { tier } : {}),
    ...(onlyScored ? { OR: [{ score: { gt: 0 } }, { scoreUpdatedAt: { not: null } }] } : {}),
    AND: [...rfvpFilters, ...(search ? [{ OR: [{ name: { contains: search, mode: "insensitive" as const } }, ...(digits.length >= 4 ? [{ phone: { contains: digits } }, { cpf: { contains: digits } }] : [])] }] : [])],
  };
  const [{ thresholds }, groups, total, rows] = await Promise.all([
    readScoringSettings(),
    prisma.contact.groupBy({ by: ["tier"], _count: { _all: true }, _avg: { score: true, totalSpent: true }, where: onlyScored ? { OR: [{ score: { gt: 0 } }, { scoreUpdatedAt: { not: null } }] } : {} }),
    prisma.contact.count({ where }),
    prisma.contact.findMany({
      where, orderBy: [SORTS[sort] ?? SORTS.score_desc, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize,
      select: {
        id: true, name: true, phone: true, city: true, score: true, tier: true, scoreUpdatedAt: true, totalSpent: true, rfvpCode: true, rfvpSegment: true, rfvpUpdatedAt: true,
        chatConversations: { orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } }, take: 1, select: { id: true, lastMessageAt: true } },

      },
    }),
  ]);
  const summary = TIERS.map((item) => {
    const group = groups.find((row) => row.tier === item);
    return { tier: item, count: group?._count._all ?? 0, avgScore: Math.round(group?._avg.score ?? 0), avgSpent: Math.round(Number(group?._avg.totalSpent ?? 0)) };
  });
  return Response.json({
    thresholds, summary, base: summary.reduce((sum, item) => sum + item.count, 0), total, page, pageSize,
    contacts: rows.map((row) => {
      const conversation = row.chatConversations[0] ?? null;
      const activity = [row.scoreUpdatedAt, conversation?.lastMessageAt].filter((value): value is Date => !!value).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
      return { id: row.id, name: row.name, phone: row.phone, city: row.city, score: row.score, tier: row.tier, totalSpent: row.totalSpent.toNumber(), rfvpCode: row.rfvpCode, rfvpSegment: row.rfvpSegment, lastActivity: activity, conversationId: conversation?.id ?? null };
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
