import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { brDay, brStartOfDay } from "@/lib/br-time";
import { cached } from "@/lib/cache";
import { DISPATCH_TAG } from "@/lib/chat/dispatch-history";

/** Brasil sem horário de verão: dias contados em UTC-3. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** Limites de SLA do tempo de resposta (segundos): acima de WARN fica amarelo, acima de BREACH vermelho. */
export const SLA_RESPONSE_WARN_S = 5 * 60;
export const SLA_RESPONSE_BREACH_S = 15 * 60;

export type PeriodPreset = "today" | "7d" | "30d" | "month" | "custom";

export type ServiceMetricsFilters = {
  preset: PeriodPreset;
  start?: string;
  end?: string;
  queueId?: string;
  assigneeId?: string;
};

const ymd = (date: Date) => date.toISOString().slice(0, 10);
// Dia e meia-noite de Brasília pelo fuso oficial (Intl), sem depender do TZ do servidor nem de offset fixo.
const brtToday = () => brDay();
const brtMidnight = (day: string) => brStartOfDay(day);
const addDays = (day: string, days: number) => ymd(new Date(Date.parse(`${day}T00:00:00.000Z`) + days * DAY_MS));
const isDay = (value: string | undefined): value is string => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));

/** Dias (BRT) inclusivos do período escolhido. */
export function resolvePeriod(filters: ServiceMetricsFilters) {
  const today = brtToday();
  let startDay = today;
  let endDay = today;
  if (filters.preset === "7d") startDay = addDays(today, -6);
  else if (filters.preset === "30d") startDay = addDays(today, -29);
  else if (filters.preset === "month") startDay = `${today.slice(0, 8)}01`;
  else if (filters.preset === "custom" && isDay(filters.start) && isDay(filters.end)) {
    [startDay, endDay] = filters.start <= filters.end ? [filters.start, filters.end] : [filters.end, filters.start];
    // Limite para manter as consultas leves.
    if (Date.parse(endDay) - Date.parse(startDay) > 366 * DAY_MS) startDay = addDays(endDay, -366);
  }
  const days = Math.round((Date.parse(endDay) - Date.parse(startDay)) / DAY_MS) + 1;
  return {
    startDay,
    endDay,
    days,
    from: brtMidnight(startDay),
    to: brtMidnight(addDays(endDay, 1)),
    prevFrom: brtMidnight(addDays(startDay, -days)),
    prevTo: brtMidnight(startDay),
  };
}

/** UF por DDD. */
const DDD_UF: Record<string, string> = {
  11: "SP", 12: "SP", 13: "SP", 14: "SP", 15: "SP", 16: "SP", 17: "SP", 18: "SP", 19: "SP",
  21: "RJ", 22: "RJ", 24: "RJ", 27: "ES", 28: "ES",
  31: "MG", 32: "MG", 33: "MG", 34: "MG", 35: "MG", 37: "MG", 38: "MG",
  41: "PR", 42: "PR", 43: "PR", 44: "PR", 45: "PR", 46: "PR", 47: "SC", 48: "SC", 49: "SC",
  51: "RS", 53: "RS", 54: "RS", 55: "RS",
  61: "DF", 62: "GO", 64: "GO", 63: "TO", 65: "MT", 66: "MT", 67: "MS", 68: "AC", 69: "RO",
  71: "BA", 73: "BA", 74: "BA", 75: "BA", 77: "BA", 79: "SE",
  81: "PE", 87: "PE", 82: "AL", 83: "PB", 84: "RN", 85: "CE", 88: "CE", 86: "PI", 89: "PI",
  91: "PA", 93: "PA", 94: "PA", 92: "AM", 97: "AM", 95: "RR", 96: "AP", 98: "MA", 99: "MA",
};
/** Cidade-polo de cada DDD (referência rápida na tela). */
const DDD_CITY: Record<string, string> = {
  11: "São Paulo", 12: "S. José dos Campos", 13: "Santos", 14: "Bauru", 15: "Sorocaba", 16: "Ribeirão Preto", 17: "S. José do Rio Preto", 18: "Presidente Prudente", 19: "Campinas",
  21: "Rio de Janeiro", 22: "Campos", 24: "Volta Redonda", 27: "Vitória", 28: "Cachoeiro",
  31: "Belo Horizonte", 32: "Juiz de Fora", 33: "Gov. Valadares", 34: "Uberlândia", 35: "Poços de Caldas", 37: "Divinópolis", 38: "Montes Claros",
  41: "Curitiba", 42: "Ponta Grossa", 43: "Londrina", 44: "Maringá", 45: "Cascavel", 46: "Pato Branco", 47: "Joinville", 48: "Florianópolis", 49: "Chapecó",
  51: "Porto Alegre", 53: "Pelotas", 54: "Caxias do Sul", 55: "Santa Maria",
  61: "Brasília", 62: "Goiânia", 63: "Palmas", 64: "Rio Verde", 65: "Cuiabá", 66: "Rondonópolis", 67: "Campo Grande", 68: "Rio Branco", 69: "Porto Velho",
  71: "Salvador", 73: "Ilhéus", 74: "Juazeiro", 75: "Feira de Santana", 77: "Vitória da Conquista", 79: "Aracaju",
  81: "Recife", 82: "Maceió", 83: "João Pessoa", 84: "Natal", 85: "Fortaleza", 86: "Teresina", 87: "Petrolina", 88: "Juazeiro do Norte", 89: "Picos",
  91: "Belém", 92: "Manaus", 93: "Santarém", 94: "Marabá", 95: "Boa Vista", 96: "Macapá", 97: "Coari", 98: "São Luís", 99: "Imperatriz",
};

/** Palavras sem significado para o assunto da conversa. */
const STOP_WORDS = [
  "que", "não", "nao", "com", "uma", "para", "pra", "por", "mais", "mas", "como", "dos", "das", "nos", "nas", "aos", "ele", "ela", "eles", "elas",
  "seu", "sua", "seus", "suas", "meu", "minha", "meus", "minhas", "esse", "essa", "este", "esta", "isso", "isto", "aquele", "aquela", "aqui", "ali", "lá",
  "também", "tambem", "já", "ainda", "sim", "tem", "ter", "tenho", "tinha", "vai", "vou", "foi", "ser", "sou", "são", "era", "está", "esta", "estou", "estava",
  "pode", "posso", "queria", "quero", "gostaria", "fazer", "sobre", "quando", "onde", "qual", "quais", "quem", "porque", "pois", "então", "entao", "até", "ate",
  "bom", "boa", "dia", "tarde", "noite", "olá", "ola", "oi", "obrigado", "obrigada", "ok", "okay", "blz", "beleza", "tudo", "bem", "vcs", "você", "voce", "vocês",
  "voces", "gente", "dele", "dela", "num", "numa", "pelo", "pela", "pelos", "pelas", "sem", "nem", "muito", "muita", "pouco", "só", "so", "agora", "hoje",
  "amanhã", "amanha", "ontem", "favor", "por favor", "td", "tbm", "kkk", "kkkk", "rsrs", "haha", "hahaha", "uns", "umas", "lhe", "mim", "comigo", "consigo",
  // Respostas da pesquisa de satisfação não dizem o assunto do atendimento.
  "satisfeito", "insatisfeito", "neutro",
  "deu", "der", "dar", "ver", "vem", "vez", "the", "ficou", "fica", "fico", "estão", "estao", "seria", "será", "sera", "teria", "tá", "ta", "tô", "to",
];

type Num = number | null;
const num = (value: unknown): Num => (value === null || value === undefined ? null : Number(value));

export type ServiceMetrics = Awaited<ReturnType<typeof loadServiceMetrics>>;

async function loadServiceMetrics(filters: ServiceMetricsFilters) {
  const period = resolvePeriod(filters);
  const { from, to, prevFrom, prevTo } = period;
  // Filtro comum das conversas: fila, atendente e fora as que só guardam envios sem resposta.
  const conv = (alias: string) => Prisma.sql`
    NOT (${DISPATCH_TAG} = ANY(${Prisma.raw(alias)}."tags"))
    ${filters.queueId ? Prisma.sql`AND ${Prisma.raw(alias)}."queueId" = ${filters.queueId}` : Prisma.empty}
    ${filters.assigneeId ? Prisma.sql`AND ${Prisma.raw(alias)}."assigneeId" = ${filters.assigneeId}` : Prisma.empty}`;

  const volumeQuery = (start: Date, end: Date) => prisma.$queryRaw<{ started: bigint; closed: bigint }[]>`
    SELECT
      (SELECT COUNT(*) FROM "ChatConversation" c WHERE c."createdAt" >= ${start} AND c."createdAt" < ${end} AND ${conv("c")}) AS started,
      (SELECT COUNT(*) FROM "ChatConversation" c WHERE c."closedAt" >= ${start} AND c."closedAt" < ${end} AND ${conv("c")}) AS closed`;

  // TME: primeira mensagem do cliente até a primeira resposta humana.
  const waitQuery = (start: Date, end: Date) => prisma.$queryRaw<{ avg: number | null; samples: bigint }[]>`
    WITH firsts AS (
      SELECT c.id,
        (SELECT MIN(m."createdAt") FROM "ChatMessage" m WHERE m."conversationId" = c.id AND m.author = 'customer') AS entered
      FROM "ChatConversation" c
      WHERE c."createdAt" >= ${start} AND c."createdAt" < ${end} AND ${conv("c")}
    ), answered AS (
      SELECT f.entered,
        (SELECT MIN(m."createdAt") FROM "ChatMessage" m
          WHERE m."conversationId" = f.id AND m.author = 'agent' AND m."authorUserId" IS NOT NULL AND m.internal = false AND m."createdAt" >= f.entered) AS first_human
      FROM firsts f WHERE f.entered IS NOT NULL
    )
    SELECT AVG(EXTRACT(EPOCH FROM (first_human - entered)))::float AS avg, COUNT(first_human) AS samples
    FROM answered WHERE first_human IS NOT NULL`;

  // TMA: primeira resposta humana até o encerramento, por atendente responsável.
  const handleQuery = (start: Date, end: Date) => prisma.$queryRaw<{ assigneeId: string | null; avg: number | null; closed: bigint; isTotal: boolean }[]>`
    WITH closed AS (
      SELECT c."assigneeId", c."closedAt",
        (SELECT MIN(m."createdAt") FROM "ChatMessage" m
          WHERE m."conversationId" = c.id AND m.author = 'agent' AND m."authorUserId" IS NOT NULL AND m.internal = false) AS first_human
      FROM "ChatConversation" c
      WHERE c."closedAt" >= ${start} AND c."closedAt" < ${end} AND ${conv("c")}
    )
    SELECT "assigneeId", AVG(EXTRACT(EPOCH FROM ("closedAt" - first_human))) FILTER (WHERE first_human IS NOT NULL AND first_human <= "closedAt")::float AS avg, COUNT(*) AS closed, GROUPING("assigneeId") = 1 AS "isTotal"
    FROM closed GROUP BY ROLLUP ("assigneeId")`;

  // TMR: cada mensagem do cliente (início de sequência) até a próxima resposta humana, por quem respondeu.
  const responseQuery = (start: Date, end: Date) => prisma.$queryRaw<{ userId: string | null; avg: number | null; samples: bigint; isTotal: boolean }[]>`
    WITH msgs AS (
      SELECT m."conversationId", m.author, m."createdAt",
        LAG(m.author) OVER (PARTITION BY m."conversationId" ORDER BY m."createdAt") AS prev
      FROM "ChatMessage" m
      JOIN "ChatConversation" c ON c.id = m."conversationId"
      WHERE m.internal = false AND m.author IN ('customer', 'agent')
        AND c."lastMessageAt" >= ${start} AND c."createdAt" < ${end} AND ${conv("c")}
        AND m."createdAt" >= ${new Date(start.getTime() - DAY_MS)} AND m."createdAt" < ${end}
    )
    SELECT r."authorUserId" AS "userId", AVG(EXTRACT(EPOCH FROM (r."createdAt" - msgs."createdAt")))::float AS avg, COUNT(*) AS samples, GROUPING(r."authorUserId") = 1 AS "isTotal"
    FROM msgs
    CROSS JOIN LATERAL (
      SELECT a."createdAt", a."authorUserId" FROM "ChatMessage" a
      WHERE a."conversationId" = msgs."conversationId" AND a.author = 'agent' AND a."authorUserId" IS NOT NULL AND a.internal = false AND a."createdAt" > msgs."createdAt"
      ORDER BY a."createdAt" LIMIT 1
    ) r
    WHERE msgs.author = 'customer' AND (msgs.prev IS NULL OR msgs.prev <> 'customer')
      AND msgs."createdAt" >= ${start} AND msgs."createdAt" < ${end}
    GROUP BY ROLLUP (r."authorUserId")`;

  const npsWhere = (start: Date, end: Date) => Prisma.sql`
    n.score IS NOT NULL AND n."answeredAt" >= ${start} AND n."answeredAt" < ${end}
    ${filters.queueId ? Prisma.sql`AND n."queueId" = ${filters.queueId}` : Prisma.empty}
    ${filters.assigneeId ? Prisma.sql`AND n."attendantId" = ${filters.assigneeId}` : Prisma.empty}`;

  const [
    volume, prevVolume, wait, prevWait, handle, prevHandle, response, prevResponse,
    npsDist, prevNps, npsByAttendant, timeline, words, regions, users,
  ] = await Promise.all([
    volumeQuery(from, to),
    volumeQuery(prevFrom, prevTo),
    waitQuery(from, to),
    waitQuery(prevFrom, prevTo),
    handleQuery(from, to),
    handleQuery(prevFrom, prevTo),
    responseQuery(from, to),
    responseQuery(prevFrom, prevTo),
    prisma.$queryRaw<{ score: number; total: bigint }[]>`SELECT n.score, COUNT(*) AS total FROM "NpsFeedback" n WHERE ${npsWhere(from, to)} GROUP BY n.score`,
    prisma.$queryRaw<{ avg: number | null }[]>`SELECT AVG(n.score)::float AS avg FROM "NpsFeedback" n WHERE ${npsWhere(prevFrom, prevTo)}`,
    prisma.$queryRaw<{ attendantId: string; avg: number; total: bigint }[]>`
      SELECT n."attendantId", AVG(n.score)::float AS avg, COUNT(*) AS total FROM "NpsFeedback" n
      WHERE ${npsWhere(from, to)} AND n."attendantId" IS NOT NULL GROUP BY n."attendantId"`,
    prisma.$queryRaw<{ day: string; started: bigint; closed: bigint }[]>`
      WITH events AS (
        SELECT to_char(c."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS day, 1 AS started, 0 AS closed
        FROM "ChatConversation" c WHERE c."createdAt" >= ${from} AND c."createdAt" < ${to} AND ${conv("c")}
        UNION ALL
        SELECT to_char(c."closedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD'), 0, 1
        FROM "ChatConversation" c WHERE c."closedAt" >= ${from} AND c."closedAt" < ${to} AND ${conv("c")}
      )
      SELECT day, SUM(started) AS started, SUM(closed) AS closed FROM events GROUP BY day`,
    prisma.$queryRaw<{ word: string; total: bigint }[]>`
      SELECT word, COUNT(*) AS total FROM (
        SELECT regexp_split_to_table(lower(m.text), '[^a-z0-9áàâãéêíóôõúüç]+') AS word
        FROM "ChatMessage" m JOIN "ChatConversation" c ON c.id = m."conversationId"
        WHERE m.author = 'customer' AND m.internal = false AND m."createdAt" >= ${from} AND m."createdAt" < ${to}
          AND c."lastMessageAt" >= ${from} AND ${conv("c")}
      ) w
      WHERE length(word) >= 3 AND word !~ '^[0-9]+$' AND NOT (word = ANY(${STOP_WORDS}))
      GROUP BY word ORDER BY total DESC, word LIMIT 40`,
    prisma.$queryRaw<{ ddd: string; total: bigint }[]>`
      SELECT substring(d.digits from 3 for 2) AS ddd, COUNT(*) AS total FROM (
        SELECT regexp_replace(c.phone, '[^0-9]', '', 'g') AS digits FROM "ChatConversation" c
        WHERE c."createdAt" >= ${from} AND c."createdAt" < ${to} AND ${conv("c")}
      ) d
      WHERE d.digits LIKE '55%' AND length(d.digits) >= 12
      GROUP BY 1`,
    prisma.user.findMany({ select: { id: true, name: true } }),
  ]);

  const total = <T extends { isTotal: boolean }>(rows: T[]) => rows.find((item) => item.isTotal);
  const names = new Map(users.map((user) => [user.id, user.name]));

  const npsTotal = npsDist.reduce((sum, row) => sum + Number(row.total), 0);
  const npsAvg = npsTotal ? npsDist.reduce((sum, row) => sum + row.score * Number(row.total), 0) / npsTotal : null;

  // Ranking: todo atendente com conversa encerrada, resposta ou nota no período.
  const ranking = new Map<string, { userId: string; name: string; closed: number; tma: Num; tmr: Num; responses: number; nps: Num; npsCount: number }>();
  const row = (userId: string) => {
    let entry = ranking.get(userId);
    if (!entry) {
      entry = { userId, name: names.get(userId) ?? "Usuário removido", closed: 0, tma: null, tmr: null, responses: 0, nps: null, npsCount: 0 };
      ranking.set(userId, entry);
    }
    return entry;
  };
  // ROLLUP traz também a linha geral (isTotal), que alimenta os cards.
  for (const item of handle) if (!item.isTotal && item.assigneeId) Object.assign(row(item.assigneeId), { closed: Number(item.closed), tma: num(item.avg) });
  for (const item of response) if (!item.isTotal && item.userId) Object.assign(row(item.userId), { tmr: num(item.avg), responses: Number(item.samples) });
  for (const item of npsByAttendant) Object.assign(row(item.attendantId), { nps: num(item.avg), npsCount: Number(item.total) });

  const timelineMap = new Map(timeline.map((item) => [item.day, item]));
  const timelineDays = Array.from({ length: period.days }, (_, index) => {
    const day = addDays(period.startDay, index);
    const item = timelineMap.get(day);
    return { day, started: Number(item?.started ?? 0), closed: Number(item?.closed ?? 0) };
  });

  const byState = new Map<string, number>();
  const dddRows = regions
    .filter((item) => DDD_UF[item.ddd])
    .map((item) => ({ ddd: item.ddd, uf: DDD_UF[item.ddd], city: DDD_CITY[item.ddd] ?? "", total: Number(item.total) }))
    .sort((a, b) => b.total - a.total);
  for (const item of dddRows) byState.set(item.uf, (byState.get(item.uf) ?? 0) + item.total);

  return {
    period: { preset: filters.preset, startDay: period.startDay, endDay: period.endDay, days: period.days },
    sla: { warn: SLA_RESPONSE_WARN_S, breach: SLA_RESPONSE_BREACH_S },
    kpis: {
      tme: { value: num(wait[0]?.avg), previous: num(prevWait[0]?.avg), samples: Number(wait[0]?.samples ?? 0) },
      tma: { value: num(total(handle)?.avg), previous: num(total(prevHandle)?.avg) },
      tmr: { value: num(total(response)?.avg), previous: num(total(prevResponse)?.avg), samples: Number(total(response)?.samples ?? 0) },
      volume: {
        started: Number(volume[0]?.started ?? 0),
        closed: Number(volume[0]?.closed ?? 0),
        prevStarted: Number(prevVolume[0]?.started ?? 0),
        prevClosed: Number(prevVolume[0]?.closed ?? 0),
      },
      nps: {
        value: npsAvg,
        previous: num(prevNps[0]?.avg),
        total: npsTotal,
        distribution: [1, 2, 3, 4, 5].map((score) => ({ score, total: Number(npsDist.find((item) => item.score === score)?.total ?? 0) })),
      },
    },
    timeline: timelineDays,
    ranking: [...ranking.values()].sort((a, b) => b.closed - a.closed || a.name.localeCompare(b.name)),
    words: words.map((item) => ({ word: item.word, total: Number(item.total) })),
    regions: {
      states: [...byState.entries()].map(([uf, count]) => ({ uf, total: count })).sort((a, b) => b.total - a.total),
      ddds: dddRows,
    },
  };
}

/** Métricas com cache curto (1 min) por combinação de filtros. */
export function getServiceMetrics(filters: ServiceMetricsFilters) {
  const key = `service-metrics:${filters.preset}:${filters.start ?? ""}:${filters.end ?? ""}:${filters.queueId ?? ""}:${filters.assigneeId ?? ""}:${brtToday()}`;
  return cached(key, 60, () => loadServiceMetrics(filters));
}

/** Opções dos filtros: filas ativas e quem já atendeu. */
export async function getServiceMetricsOptions() {
  return cached("service-metrics:options", 300, async () => {
    const [queues, operators] = await Promise.all([
      prisma.chatQueue.findMany({ where: { archivedAt: null }, orderBy: [{ order: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
      prisma.$queryRaw<{ id: string; name: string }[]>`
        SELECT u.id, u.name FROM "user" u
        WHERE EXISTS (SELECT 1 FROM "ChatConversation" c WHERE c."assigneeId" = u.id)
           OR EXISTS (SELECT 1 FROM "ChatQueueMember" q WHERE q."userId" = u.id)
        ORDER BY u.name`,
    ]);
    return { queues, operators };
  });
}
