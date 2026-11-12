import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { addDays, brDay, brStartOfDay } from "@/lib/br-time";
import { AI_SETTINGS_KEY, sanitizeAiSettings, usageCostUsd, type AiSettings } from "@/lib/ai/settings";

const STATUS_KEY = "ai-status";
const CACHE_MS = 30_000;
let cache: { at: number; value: AiSettings } | null = null;

export async function readAiSettings(): Promise<AiSettings> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const row = await prisma.crmWorkspaceData.findUnique({ where: { key: AI_SETTINGS_KEY }, select: { value: true } });
  const value = sanitizeAiSettings(row?.value ?? {});
  cache = { at: Date.now(), value };
  return value;
}

export async function saveAiSettings(input: unknown) {
  const value = sanitizeAiSettings(input);
  const json = value as unknown as Prisma.InputJsonValue;
  await prisma.crmWorkspaceData.upsert({ where: { key: AI_SETTINGS_KEY }, create: { key: AI_SETTINGS_KEY, value: json }, update: { value: json } });
  cache = { at: Date.now(), value };
  return value;
}

export type AiStatus = { lastOkAt: string | null; lastErrorAt: string | null; lastError: string | null; creditExhausted: boolean };

async function writeStatus(patch: Partial<AiStatus>) {
  const row = await prisma.crmWorkspaceData.findUnique({ where: { key: STATUS_KEY }, select: { value: true } });
  const value = { ...((row?.value ?? {}) as Partial<AiStatus>), ...patch } as Prisma.InputJsonValue;
  await prisma.crmWorkspaceData.upsert({ where: { key: STATUS_KEY }, create: { key: STATUS_KEY, value }, update: { value } });
}

export async function readAiStatus(): Promise<AiStatus> {
  const row = await prisma.crmWorkspaceData.findUnique({ where: { key: STATUS_KEY }, select: { value: true } });
  const value = (row?.value ?? {}) as Partial<AiStatus>;
  return { lastOkAt: value.lastOkAt ?? null, lastErrorAt: value.lastErrorAt ?? null, lastError: value.lastError ?? null, creditExhausted: value.creditExhausted === true };
}

/** O registro de consumo nunca derruba a resposta da IA. */
export async function recordAiUsage(entry: { feature: string; model: string; inputTokens: number; outputTokens: number; conversationId?: string | null; userId?: string | null; ok: boolean; error?: string; creditExhausted?: boolean }) {
  try {
    const settings = await readAiSettings();
    await prisma.aiUsage.create({
      data: {
        feature: entry.feature,
        model: entry.model,
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        costUsd: usageCostUsd(settings, entry.inputTokens, entry.outputTokens),
        conversationId: entry.conversationId ?? null,
        userId: entry.userId ?? null,
        ok: entry.ok,
      },
    });
    const now = new Date().toISOString();
    await writeStatus(entry.ok ? { lastOkAt: now, creditExhausted: false } : { lastErrorAt: now, lastError: entry.error ?? null, creditExhausted: entry.creditExhausted === true });
  } catch (error) {
    console.error("[ai] registro de consumo:", error);
  }
}

export const AI_FEATURE_LABELS: Record<string, string> = {
  reply: "Sugerir resposta",
  summary: "Resumo do atendimento",
  products: "Sugestões de venda",
  agent: "Atendimento autônomo",
};

type Totals = { calls: number; inputTokens: number; outputTokens: number; costUsd: number };
type UsageRow = { bucket: string; calls: number; input: number; output: number; cost: number };

/** Painel de gastos: hoje, mês, 30 dias, por função e por dia (dias de Brasília), mais o saldo estimado. */
export async function aiUsageReport() {
  const settings = await readAiSettings();
  const today = brDay();
  const monthStart = `${today.slice(0, 8)}01`;
  const since30 = addDays(today, -29);
  const from30 = brStartOfDay(since30);
  const fromMonth = brStartOfDay(monthStart);
  const fromToday = brStartOfDay(today);
  const day = Prisma.sql`to_char("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')`;

  const [daily, byFeature, monthTotals, todayTotals, allTotals, sinceCredit, status] = await Promise.all([
    prisma.$queryRaw<UsageRow[]>`SELECT ${day} AS bucket, COUNT(*)::int AS calls, COALESCE(SUM("inputTokens"),0)::int AS input, COALESCE(SUM("outputTokens"),0)::int AS output, COALESCE(SUM("costUsd"),0)::float8 AS cost FROM "AiUsage" WHERE "createdAt" >= ${from30} GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<UsageRow[]>`SELECT "feature" AS bucket, COUNT(*)::int AS calls, COALESCE(SUM("inputTokens"),0)::int AS input, COALESCE(SUM("outputTokens"),0)::int AS output, COALESCE(SUM("costUsd"),0)::float8 AS cost FROM "AiUsage" WHERE "createdAt" >= ${fromMonth} GROUP BY 1 ORDER BY cost DESC`,
    prisma.aiUsage.aggregate({ where: { createdAt: { gte: fromMonth } }, _count: true, _sum: { inputTokens: true, outputTokens: true, costUsd: true } }),
    prisma.aiUsage.aggregate({ where: { createdAt: { gte: fromToday } }, _count: true, _sum: { inputTokens: true, outputTokens: true, costUsd: true } }),
    prisma.aiUsage.aggregate({ _count: true, _sum: { inputTokens: true, outputTokens: true, costUsd: true } }),
    settings.creditLoadedAt ? prisma.aiUsage.aggregate({ where: { createdAt: { gte: brStartOfDay(settings.creditLoadedAt) } }, _sum: { costUsd: true } }) : null,
    readAiStatus(),
  ]);

  const totals = (agg: { _count: number; _sum: { inputTokens: number | null; outputTokens: number | null; costUsd: Prisma.Decimal | null } }): Totals => ({
    calls: agg._count,
    inputTokens: agg._sum.inputTokens ?? 0,
    outputTokens: agg._sum.outputTokens ?? 0,
    costUsd: Number(agg._sum.costUsd ?? 0),
  });
  const toBrl = (usd: number) => Math.round(usd * settings.usdToBrl * 100) / 100;
  const withBrl = (value: Totals) => ({ ...value, costBrl: toBrl(value.costUsd) });

  const spentSinceCredit = Number(sinceCredit?._sum.costUsd ?? 0);
  const creditRemainingUsd = settings.creditLoadedUsd > 0 ? Math.max(0, settings.creditLoadedUsd - spentSinceCredit) : null;

  return {
    configured: !!process.env.OPENAI_API_KEY?.trim(),
    model: settings.model,
    usdToBrl: settings.usdToBrl,
    today: withBrl(totals(todayTotals)),
    month: withBrl(totals(monthTotals)),
    allTime: withBrl(totals(allTotals)),
    monthlyBudgetBrl: settings.monthlyBudgetBrl,
    credit: {
      loadedUsd: settings.creditLoadedUsd,
      loadedAt: settings.creditLoadedAt || null,
      spentUsd: spentSinceCredit,
      remainingUsd: creditRemainingUsd,
      remainingBrl: creditRemainingUsd === null ? null : toBrl(creditRemainingUsd),
    },
    status,
    byFeature: byFeature.map((row) => ({ feature: row.bucket, label: AI_FEATURE_LABELS[row.bucket] ?? row.bucket, calls: row.calls, inputTokens: row.input, outputTokens: row.output, costBrl: toBrl(row.cost) })),
    daily: daily.map((row) => ({ day: row.bucket, calls: row.calls, tokens: row.input + row.output, costBrl: toBrl(row.cost) })),
  };
}

export type AiUsageReport = Awaited<ReturnType<typeof aiUsageReport>>;
