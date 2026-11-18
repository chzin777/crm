import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { firstDispatch } from "@/lib/chat/conversation";
import { brDay, brHour } from "@/lib/automations/erp-triggers";
import { DEFAULT_RFVP, readRfvpSettings, rfvpVars, segmentCaseSql, type RfvpSettings } from "@/lib/rfvp";

/**
 * RFV-P no banco: faixas em ChatSettings "rfvp", pontualidade do VMSet em VmsetPunctuality (API do host, só leitura)
 * e recálculo idempotente de todos os contatos num único UPDATE (só grava quem mudou de código ou segmento).
 */

const SETTINGS_ID = "rfvp";
const API_URL = () => process.env.VMSET_STOCK_URL?.trim() || "http://host.docker.internal:9005";
const API_TOKEN = () => process.env.VMSET_STOCK_TOKEN?.trim() ?? "";
const MAX_EVENTS_PER_RUN = 3000;

export type RfvpRun = { at: string; finishedAt: string | null; changed: number; events: number; punctuality: number | null; warning: string | null; error: string | null; trigger: "agendado" | "manual" };
type Stored = { settings: RfvpSettings; lastRun: RfvpRun | null };

async function readStored(): Promise<Stored> {
  const row = await prisma.chatSettings.findUnique({ where: { id: SETTINGS_ID } });
  const value = (row?.menu ?? {}) as { settings?: unknown; lastRun?: RfvpRun | null };
  return { settings: readRfvpSettings(value.settings ?? DEFAULT_RFVP), lastRun: value.lastRun ?? null };
}

async function writeStored(patch: Partial<Stored>) {
  const current = await readStored();
  const menu = { ...current, ...patch } as unknown as Prisma.InputJsonValue;
  await prisma.chatSettings.upsert({ where: { id: SETTINGS_ID }, create: { id: SETTINGS_ID, menu }, update: { menu } });
}

export const readRfvpConfig = readStored;
export const saveRfvpSettings = (settings: RfvpSettings) => writeStored({ settings });

/** Pontualidade de todos os CPFs (carnê/boleto/crédito interno) na janela configurada → cache local. */
async function syncPunctuality(settings: RfvpSettings): Promise<number> {
  const { months, graceDays } = settings.punctuality;
  const response = await fetch(`${API_URL()}/punctuality?months=${months}&grace=${graceDays}`, { headers: { "x-api-key": API_TOKEN() }, signal: AbortSignal.timeout(150_000), cache: "no-store" });
  if (!response.ok) throw new Error(`API do VMSet respondeu HTTP ${response.status}`);
  const data = (await response.json()) as { items?: { cpf: string; due: number; onTime: number; avgDelay: number; maxOverdueDays: number }[] };
  const items = (Array.isArray(data.items) ? data.items : []).filter((item) => /^\d{9,14}$/.test(item.cpf));
  const started = new Date();
  for (let index = 0; index < items.length; index += 5000) {
    const chunk = items.slice(index, index + 5000);
    await prisma.$executeRaw`
      INSERT INTO "VmsetPunctuality" ("cpf", "due", "onTime", "avgDelay", "maxOverdueDays", "syncedAt")
      SELECT * FROM unnest(${chunk.map((item) => item.cpf)}::text[], ${chunk.map((item) => Math.round(item.due))}::int[], ${chunk.map((item) => Math.round(item.onTime))}::int[],
        ${chunk.map((item) => Number(item.avgDelay) || 0)}::float8[], ${chunk.map((item) => Math.round(item.maxOverdueDays))}::int[], ${chunk.map(() => started)}::timestamp[])
      ON CONFLICT ("cpf") DO UPDATE SET "due" = EXCLUDED."due", "onTime" = EXCLUDED."onTime", "avgDelay" = EXCLUDED."avgDelay", "maxOverdueDays" = EXCLUDED."maxOverdueDays", "syncedAt" = EXCLUDED."syncedAt"`;
  }
  // CPF que saiu da janela (sem parcela vencida nela): volta a ser "sem crediário".
  if (items.length) await prisma.vmsetPunctuality.deleteMany({ where: { syncedAt: { lt: started } } });
  return items.length;
}

type Change = { id: string; beforeCode: string | null; beforeSegment: string | null; code: string; segment: string };

/** Notas, código e segmento de todos os contatos com as faixas vigentes; devolve só quem mudou. */
async function recalculate(s: RfvpSettings): Promise<Change[]> {
  const [r5, r4, r3, r2] = s.recency.cuts;
  const [f5, f4, f3, f2] = s.frequency.cuts;
  const [v5, v4, v3, v2] = s.value.cuts;
  const p = s.punctuality;
  const segment = Prisma.raw(segmentCaseSql({ r: "sc.r", f: "sc.f", v: "sc.v", p: "sc.p" }));
  return prisma.$queryRaw<Change[]>`
    WITH sales AS (
      SELECT v."sourceKey", max(v."orderDate") AS last_order,
        count(DISTINCT v.store || '-' || v."orderNumber") FILTER (WHERE v."orderDate" >= current_date - make_interval(months => ${s.frequency.months}::int)) AS freq,
        COALESCE(sum(v.amount) FILTER (WHERE v."orderDate" >= current_date - make_interval(months => ${s.value.months}::int)), 0)::float8 AS total_v,
        count(DISTINCT v.store || '-' || v."orderNumber") FILTER (WHERE v."orderDate" >= current_date - make_interval(months => ${s.value.months}::int)) AS orders_v
      FROM "VmsetSale" v
      WHERE v.type = 'Venda' AND v."sourceKey" IS NOT NULL AND v."orderNumber" IS NOT NULL
      GROUP BY v."sourceKey"
    ),
    m AS (
      SELECT c.id, (current_date - s.last_order::date) AS days, COALESCE(s.freq, 0) AS freq,
        CASE WHEN ${s.value.metric}::text = 'avg' THEN (CASE WHEN COALESCE(s.orders_v, 0) > 0 THEN s.total_v / s.orders_v ELSE 0 END) ELSE COALESCE(s.total_v, 0) END AS val,
        pt.due, pt."onTime", pt."avgDelay", pt."maxOverdueDays"
      FROM "Contact" c
      LEFT JOIN sales s ON s."sourceKey" = c."sourceKey"
      LEFT JOIN "VmsetPunctuality" pt ON pt.cpf = NULLIF(ltrim(regexp_replace(COALESCE(c.cpf, CASE WHEN c."sourceKey" LIKE 'cpf:%' THEN substr(c."sourceKey", 5) END, ''), '[^0-9]', '', 'g'), '0'), '')
    ),
    sc AS (
      SELECT id,
        CASE WHEN days IS NULL THEN 1 WHEN days <= ${r5}::int THEN 5 WHEN days <= ${r4}::int THEN 4 WHEN days <= ${r3}::int THEN 3 WHEN days <= ${r2}::int THEN 2 ELSE 1 END AS r,
        CASE WHEN freq >= ${f5}::int THEN 5 WHEN freq >= ${f4}::int THEN 4 WHEN freq >= ${f3}::int THEN 3 WHEN freq >= ${f2}::int THEN 2 ELSE 1 END AS f,
        CASE WHEN val >= ${v5}::float8 THEN 5 WHEN val >= ${v4}::float8 THEN 4 WHEN val >= ${v3}::float8 THEN 3 WHEN val >= ${v2}::float8 THEN 2 ELSE 1 END AS v,
        CASE WHEN COALESCE("maxOverdueDays", 0) > ${p.severeOverdueDays}::int THEN 1
          WHEN due IS NULL OR due = 0 THEN ${p.noCredit}::int
          WHEN "onTime" * 100.0 / due >= ${p.onTime[0]}::float8 OR "avgDelay" <= ${p.delay[0]}::float8 THEN 5
          WHEN "onTime" * 100.0 / due >= ${p.onTime[1]}::float8 OR "avgDelay" <= ${p.delay[1]}::float8 THEN 4
          WHEN "onTime" * 100.0 / due >= ${p.onTime[2]}::float8 OR "avgDelay" <= ${p.delay[2]}::float8 THEN 3
          WHEN "onTime" * 100.0 / due >= ${p.onTime[3]}::float8 OR "avgDelay" <= ${p.delay[3]}::float8 THEN 2
          ELSE 1 END AS p
      FROM m
    ),
    fin AS (SELECT sc.id, sc.r, sc.f, sc.v, sc.p, sc.r::text || sc.f::text || sc.v::text || '-' || sc.p::text AS code, ${segment} AS segment FROM sc)
    UPDATE "Contact" c SET "rfvpR" = fin.r, "rfvpF" = fin.f, "rfvpV" = fin.v, "rfvpP" = fin.p, "rfvpCode" = fin.code, "rfvpSegment" = fin.segment, "rfvpUpdatedAt" = now()
    FROM fin JOIN "Contact" o ON o.id = fin.id
    WHERE c.id = fin.id AND (c."rfvpCode" IS DISTINCT FROM fin.code OR c."rfvpSegment" IS DISTINCT FROM fin.segment)
    RETURNING c.id, o."rfvpCode" AS "beforeCode", o."rfvpSegment" AS "beforeSegment", fin.code, fin.segment`;
}

/**
 * Gatilho "Mudança na matriz RFV-P": só quem já tinha cálculo (o primeiro cálculo não dispara) e só quando algum
 * gatilho ativo casa com a mudança (evita milhares de chamadas quando a Recência cai com o tempo).
 */
async function emitChanges(changes: Change[]): Promise<number> {
  const relevant = changes.filter((item) => item.beforeCode);
  if (!relevant.length) return 0;
  const [{ triggerAutomations }, { triggerMatches }, { sanitizeGraph, triggerNodes }] = await Promise.all([import("@/lib/automations/engine-db"), import("@/lib/automations/engine"), import("@/lib/automations/nodes")]);
  const flows = await prisma.automationFlow.findMany({ where: { status: "active", triggerType: { contains: "trigger_rfvp" } }, select: { nodes: true, edges: true } });
  const nodes = flows.flatMap((flow) => triggerNodes(sanitizeGraph(flow)).filter((node) => node.type === "trigger_rfvp"));
  if (!nodes.length) return 0;
  let emitted = 0;
  for (const change of relevant) {
    if (emitted >= MAX_EVENTS_PER_RUN) break;
    const event = { type: "trigger_rfvp" as const, before: { code: change.beforeCode ?? "", segment: change.beforeSegment ?? "" }, after: { code: change.code, segment: change.segment } };
    if (!nodes.some((node) => triggerMatches(node, event))) continue;
    const vars = { ...rfvpVars({ code: change.code, segment: change.segment }), ...rfvpVars({ code: change.beforeCode, segment: change.beforeSegment }, "rfvp.anterior") };
    await triggerAutomations(event, { contactId: change.id, vars }).catch((error: unknown) => console.error(`[rfvp] gatilho ${change.id}:`, error));
    emitted += 1;
  }
  return emitted;
}

let running: Promise<RfvpRun> | null = null;

/** Sincroniza a pontualidade, recalcula todos os contatos e dispara os gatilhos. Uma execução por vez. */
export function runRfvp(trigger: RfvpRun["trigger"]): Promise<RfvpRun> {
  if (running) return running;
  running = (async () => {
    const run: RfvpRun = { at: new Date().toISOString(), finishedAt: null, changed: 0, events: 0, punctuality: null, warning: null, error: null, trigger };
    await writeStored({ lastRun: run });
    try {
      const { settings } = await readStored();
      try {
        run.punctuality = await syncPunctuality(settings);
      } catch (error) {
        // VMSet fora: recalcula com a última pontualidade conhecida.
        run.warning = `Pontualidade não atualizada (${error instanceof Error ? error.message : "VMSet indisponível"}); usada a última sincronização.`;
      }
      const changes = await recalculate(settings);
      run.changed = changes.length;
      run.events = await emitChanges(changes);
    } catch (error) {
      run.error = error instanceof Error ? error.message.slice(0, 300) : "Falha no cálculo.";
      console.error("[rfvp] recálculo:", error);
    }
    run.finishedAt = new Date().toISOString();
    await writeStored({ lastRun: run });
    return run;
  })().finally(() => { running = null; });
  return running;
}

export const rfvpRunning = () => !!running;

/** Relógio: uma vez por dia, a partir das 6h (Brasília), numa única réplica. Não bloqueia o relógio. */
export async function scheduleDailyRfvp(now = new Date()) {
  if (brHour(now) < 6 || running) return false;
  // Já concluiu hoje, ou outra réplica está calculando agora: nada a fazer. Se uma execução foi interrompida
  // (troca blue/green no meio), tenta de novo na hora seguinte.
  const { lastRun } = await readStored();
  if (lastRun?.finishedAt && brDay(new Date(lastRun.finishedAt)) === brDay(now)) return false;
  if (lastRun && !lastRun.finishedAt && now.getTime() - new Date(lastRun.at).getTime() < 20 * 60_000) return false;
  if (!(await firstDispatch(`rfvp-daily:${brDay(now)}:${brHour(now)}`))) return false;
  void runRfvp("agendado");
  return true;
}

export type ContactRfvp = {
  code: string | null; segment: string | null; updatedAt: Date | null;
  scores: { r: number; f: number; v: number; p: number } | null;
  metrics: { daysSinceLastPurchase: number | null; purchases: number; value: number; valueMetric: "total" | "avg"; months: { f: number; v: number; p: number }; punctuality: { due: number; onTime: number; avgDelay: number; maxOverdueDays: number } | null };
};

/** RFV-P salvo do contato + os números por trás das notas (calculados agora, com os critérios vigentes). */
export async function contactRfvp(contactId: string): Promise<ContactRfvp | null> {
  const contact = await prisma.contact.findUnique({ where: { id: contactId }, select: { sourceKey: true, cpf: true, rfvpR: true, rfvpF: true, rfvpV: true, rfvpP: true, rfvpCode: true, rfvpSegment: true, rfvpUpdatedAt: true } });
  if (!contact) return null;
  const { settings } = await readStored();
  const [sales] = await prisma.$queryRaw<{ last_order: Date | null; freq: number; total_v: number; orders_v: number }[]>`
    SELECT max(v."orderDate") AS last_order,
      count(DISTINCT v.store || '-' || v."orderNumber") FILTER (WHERE v."orderDate" >= current_date - make_interval(months => ${settings.frequency.months}::int))::int AS freq,
      COALESCE(sum(v.amount) FILTER (WHERE v."orderDate" >= current_date - make_interval(months => ${settings.value.months}::int)), 0)::float8 AS total_v,
      count(DISTINCT v.store || '-' || v."orderNumber") FILTER (WHERE v."orderDate" >= current_date - make_interval(months => ${settings.value.months}::int))::int AS orders_v
    FROM "VmsetSale" v WHERE v.type = 'Venda' AND v."sourceKey" = ${contact.sourceKey} AND v."orderNumber" IS NOT NULL`;
  const cpf = (contact.cpf ?? (contact.sourceKey.startsWith("cpf:") ? contact.sourceKey.slice(4) : "")).replace(/\D/g, "").replace(/^0+/, "");
  const punctuality = cpf ? await prisma.vmsetPunctuality.findUnique({ where: { cpf } }) : null;
  const last = sales?.last_order ? new Date(sales.last_order) : null;
  const days = last ? Math.max(0, Math.floor((Date.now() - last.getTime()) / 86_400_000)) : null;
  const total = Number(sales?.total_v ?? 0);
  const orders = Number(sales?.orders_v ?? 0);
  return {
    code: contact.rfvpCode, segment: contact.rfvpSegment, updatedAt: contact.rfvpUpdatedAt,
    scores: contact.rfvpCode ? { r: contact.rfvpR ?? 1, f: contact.rfvpF ?? 1, v: contact.rfvpV ?? 1, p: contact.rfvpP ?? 1 } : null,
    metrics: {
      daysSinceLastPurchase: days, purchases: Number(sales?.freq ?? 0),
      value: Math.round((settings.value.metric === "avg" ? (orders ? total / orders : 0) : total) * 100) / 100, valueMetric: settings.value.metric,
      months: { f: settings.frequency.months, v: settings.value.months, p: settings.punctuality.months },
      punctuality: punctuality ? { due: punctuality.due, onTime: punctuality.onTime, avgDelay: punctuality.avgDelay, maxOverdueDays: punctuality.maxOverdueDays } : null,
    },
  };
}
