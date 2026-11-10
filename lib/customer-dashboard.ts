import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { cached } from "@/lib/cache";

/** Brasil sem horário de verão: dias contados em UTC-3. */
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type CustomerPeriodPreset = "30d" | "month" | "quarter" | "custom";
export type CompareMode = "prev" | "yoy";
export const INACTIVE_DAY_OPTIONS = [30, 60, 90] as const;

export type CustomerDashboardFilters = {
  preset: CustomerPeriodPreset;
  start?: string;
  end?: string;
  compare: CompareMode;
  store?: string;
  seller?: string;
  inactiveDays: number;
};

export type HealthSegment = "promotor" | "ativo" | "risco" | "critico" | "dormente";

const ymd = (date: Date) => date.toISOString().slice(0, 10);
const brtToday = () => ymd(new Date(Date.now() - BRT_OFFSET_MS));
const addDays = (day: string, days: number) => ymd(new Date(Date.parse(`${day}T00:00:00.000Z`) + days * DAY_MS));
const addYears = (day: string, years: number) => {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return ymd(date);
};
const isDay = (value: string | undefined): value is string => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
const brtMidnight = (day: string) => new Date(Date.parse(`${day}T00:00:00.000Z`) + BRT_OFFSET_MS);

/** Período base (dias BRT inclusivos) e o período de comparação. */
export function resolveCustomerPeriod(filters: CustomerDashboardFilters) {
  const today = brtToday();
  let startDay = addDays(today, -29);
  let endDay = today;
  if (filters.preset === "month") startDay = `${today.slice(0, 8)}01`;
  else if (filters.preset === "quarter") {
    const month = Math.floor((Number(today.slice(5, 7)) - 1) / 3) * 3 + 1;
    startDay = `${today.slice(0, 4)}-${String(month).padStart(2, "0")}-01`;
  } else if (filters.preset === "custom" && isDay(filters.start) && isDay(filters.end)) {
    [startDay, endDay] = filters.start <= filters.end ? [filters.start, filters.end] : [filters.end, filters.start];
    if (Date.parse(endDay) - Date.parse(startDay) > 731 * DAY_MS) startDay = addDays(endDay, -731);
  }
  const days = Math.round((Date.parse(endDay) - Date.parse(startDay)) / DAY_MS) + 1;
  const compareStart = filters.compare === "yoy" ? addYears(startDay, -1) : addDays(startDay, -days);
  const compareEnd = filters.compare === "yoy" ? addYears(endDay, -1) : addDays(startDay, -1);
  return { startDay, endDay, days, compareStart, compareEnd };
}

type JsonCount = { m: string; n: number };
type RiskRow = { id: string; name: string; phone: string | null; segment: HealthSegment; last: string; orders: number; ltv: number; score: number | null };
type CustomerJson = {
  buyersEver: number;
  inactive: { d30: number; d60: number; d90: number; d365: number; selected: number; selectedCmp: number };
  newBuyers: { current: number; compare: number };
  segments: Record<string, { total: number; ltv: number }> | null;
  churn: JsonCount[] | null;
  firstByMonth: JsonCount[] | null;
  risk: RiskRow[] | null;
};

const num = (value: unknown) => (value === null || value === undefined ? 0 : Number(value));

async function loadCustomerDashboard(filters: CustomerDashboardFilters) {
  const period = resolveCustomerPeriod(filters);
  const { startDay, endDay, compareStart, compareEnd } = period;
  const inactiveDays = filters.inactiveDays;
  const orderFilter = Prisma.sql`${filters.store ? Prisma.sql` AND o.store = ${filters.store}` : Prisma.empty}${filters.seller ? Prisma.sql` AND o.seller = ${filters.seller}` : Prisma.empty}`;
  const contactStore = filters.store ? Prisma.sql` AND c.store = ${filters.store}` : Prisma.empty;
  // 12 meses terminando no mês do fim do período.
  const firstMonth = (() => {
    const date = new Date(`${endDay.slice(0, 8)}01T00:00:00.000Z`);
    date.setUTCMonth(date.getUTCMonth() - 11);
    return ymd(date);
  })();

  const [periodRows, customerRows, monthlyRows, baseRows, npsRows] = await Promise.all([
    prisma.$queryRaw<{ buyers: bigint; revenue: string | null; orders: bigint; buyersCmp: bigint; revenueCmp: string | null; ordersCmp: bigint }[]>(Prisma.sql`
      SELECT
        COUNT(DISTINCT o."sourceKey") FILTER (WHERE o.day BETWEEN ${startDay}::date AND ${endDay}::date) AS buyers,
        SUM(o.total) FILTER (WHERE o.day BETWEEN ${startDay}::date AND ${endDay}::date)::text AS revenue,
        COUNT(*) FILTER (WHERE o.day BETWEEN ${startDay}::date AND ${endDay}::date) AS orders,
        COUNT(DISTINCT o."sourceKey") FILTER (WHERE o.day BETWEEN ${compareStart}::date AND ${compareEnd}::date) AS "buyersCmp",
        SUM(o.total) FILTER (WHERE o.day BETWEEN ${compareStart}::date AND ${compareEnd}::date)::text AS "revenueCmp",
        COUNT(*) FILTER (WHERE o.day BETWEEN ${compareStart}::date AND ${compareEnd}::date) AS "ordersCmp"
      FROM "VmsetInvoiceOrder" o
      WHERE ((o.day BETWEEN ${startDay}::date AND ${endDay}::date) OR (o.day BETWEEN ${compareStart}::date AND ${compareEnd}::date))${orderFilter}
    `),
    prisma.$queryRaw<{ result: CustomerJson }[]>(Prisma.sql`
      WITH cust AS MATERIALIZED (
        SELECT o."sourceKey" AS sk, min(o.day) AS first_day, max(o.day) AS last_p,
          max(o.day) FILTER (WHERE o.day <= ${compareEnd}::date) AS last_c,
          COUNT(*)::int AS orders, SUM(o.total) AS ltv
        FROM "VmsetInvoiceOrder" o
        WHERE o.day <= ${endDay}::date${orderFilter}
        GROUP BY o."sourceKey"
      ),
      nps AS MATERIALIZED (
        SELECT DISTINCT ON (c."sourceKey") c."sourceKey" AS sk, f.score
        FROM "NpsFeedback" f JOIN "Contact" c ON c.id = f."contactId"
        WHERE f.status = 'ANSWERED' AND f.score IS NOT NULL AND f."answeredAt" < ${brtMidnight(addDays(endDay, 1))}
        ORDER BY c."sourceKey", f."answeredAt" DESC
      ),
      seg AS MATERIALIZED (
        SELECT cust.*, nps.score,
          CASE
            WHEN nps.score <= 3 THEN 'critico'
            WHEN cust.last_p >= ${endDay}::date - ${inactiveDays}::int AND (nps.score >= 4 OR cust.orders >= 2) THEN 'promotor'
            WHEN cust.last_p >= ${endDay}::date - ${inactiveDays}::int THEN 'ativo'
            WHEN cust.orders >= 2 AND cust.last_p >= ${endDay}::date - 730 THEN 'risco'
            ELSE 'dormente'
          END AS segment
        FROM cust LEFT JOIN nps USING (sk)
      )
      SELECT json_build_object(
        'buyersEver', (SELECT COUNT(*) FROM cust),
        'inactive', (SELECT json_build_object(
          'd30', COUNT(*) FILTER (WHERE last_p < ${endDay}::date - 30),
          'd60', COUNT(*) FILTER (WHERE last_p < ${endDay}::date - 60),
          'd90', COUNT(*) FILTER (WHERE last_p < ${endDay}::date - 90),
          'd365', COUNT(*) FILTER (WHERE last_p < ${endDay}::date - 365),
          'selected', COUNT(*) FILTER (WHERE last_p < ${endDay}::date - ${inactiveDays}::int),
          'selectedCmp', COUNT(*) FILTER (WHERE last_c < ${compareEnd}::date - ${inactiveDays}::int)
        ) FROM cust),
        'newBuyers', (SELECT json_build_object(
          'current', COUNT(*) FILTER (WHERE first_day BETWEEN ${startDay}::date AND ${endDay}::date),
          'compare', COUNT(*) FILTER (WHERE first_day BETWEEN ${compareStart}::date AND ${compareEnd}::date)
        ) FROM cust),
        'segments', (SELECT json_object_agg(segment, json_build_object('total', n, 'ltv', ltv)) FROM (
          SELECT segment, COUNT(*) AS n, COALESCE(SUM(ltv), 0)::float8 AS ltv FROM seg GROUP BY segment
        ) s),
        'churn', (SELECT json_agg(json_build_object('m', m, 'n', n)) FROM (
          SELECT to_char(last_p + ${inactiveDays}::int, 'YYYY-MM') AS m, COUNT(*) AS n
          FROM cust WHERE last_p + ${inactiveDays}::int BETWEEN ${firstMonth}::date AND ${endDay}::date GROUP BY 1
        ) x),
        'firstByMonth', (SELECT json_agg(json_build_object('m', m, 'n', n)) FROM (
          SELECT to_char(first_day, 'YYYY-MM') AS m, COUNT(*) AS n FROM cust WHERE first_day >= ${firstMonth}::date GROUP BY 1
        ) x),
        'risk', (SELECT json_agg(r) FROM (
          SELECT c.id, c.name, c.phone, seg.segment, to_char(seg.last_p, 'YYYY-MM-DD') AS last, seg.orders,
            COALESCE(seg.ltv, 0)::float8 AS ltv, seg.score
          FROM seg JOIN "Contact" c ON c."sourceKey" = seg.sk
          WHERE seg.segment IN ('risco', 'critico')
          ORDER BY seg.ltv DESC NULLS LAST
          LIMIT 40
        ) r)
      ) AS result
    `),
    prisma.$queryRaw<{ m: string; buyers: bigint; base: bigint }[]>(Prisma.sql`
      WITH months AS (
        SELECT generate_series(${firstMonth}::date, date_trunc('month', ${endDay}::date)::date, interval '1 month')::date AS ms
      ),
      buyers AS (
        SELECT date_trunc('month', o.day)::date AS ms, COUNT(DISTINCT o."sourceKey") AS buyers
        FROM "VmsetInvoiceOrder" o
        WHERE o.day BETWEEN ${firstMonth}::date AND ${endDay}::date${orderFilter}
        GROUP BY 1
      )
      SELECT to_char(months.ms, 'YYYY-MM') AS m, COALESCE(buyers.buyers, 0) AS buyers,
        (SELECT COUNT(DISTINCT o."sourceKey") FROM "VmsetInvoiceOrder" o
          WHERE o.day >= months.ms - ${inactiveDays}::int AND o.day < months.ms${orderFilter}) AS base
      FROM months LEFT JOIN buyers USING (ms)
      ORDER BY months.ms
    `),
    prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`SELECT COUNT(*) AS total FROM "Contact" c WHERE TRUE${contactStore}`),
    prisma.$queryRaw<{ answered: bigint; detractors: bigint; answeredCmp: bigint; detractorsCmp: bigint }[]>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE f."answeredAt" >= ${brtMidnight(startDay)} AND f."answeredAt" < ${brtMidnight(addDays(endDay, 1))}) AS answered,
        COUNT(*) FILTER (WHERE f.score <= 3 AND f."answeredAt" >= ${brtMidnight(startDay)} AND f."answeredAt" < ${brtMidnight(addDays(endDay, 1))}) AS detractors,
        COUNT(*) FILTER (WHERE f."answeredAt" >= ${brtMidnight(compareStart)} AND f."answeredAt" < ${brtMidnight(addDays(compareEnd, 1))}) AS "answeredCmp",
        COUNT(*) FILTER (WHERE f.score <= 3 AND f."answeredAt" >= ${brtMidnight(compareStart)} AND f."answeredAt" < ${brtMidnight(addDays(compareEnd, 1))}) AS "detractorsCmp"
      FROM "NpsFeedback" f
      ${filters.store ? Prisma.sql`JOIN "Contact" c ON c.id = f."contactId"` : Prisma.empty}
      WHERE f.status = 'ANSWERED' AND f.score IS NOT NULL${contactStore}
    `),
  ]);

  const stats = periodRows[0];
  const customers = customerRows[0].result;
  const nps = npsRows[0];
  const buyers = num(stats?.buyers);
  const buyersCmp = num(stats?.buyersCmp);
  const revenue = num(stats?.revenue);
  const revenueCmp = num(stats?.revenueCmp);
  const ordersNow = num(stats?.orders);
  const ordersCmp = num(stats?.ordersCmp);
  const answered = num(nps?.answered);
  const answeredCmp = num(nps?.answeredCmp);

  const firstByMonth = new Map((customers.firstByMonth ?? []).map((item) => [item.m, num(item.n)]));
  const churnByMonth = new Map((customers.churn ?? []).map((item) => [item.m, num(item.n)]));
  const timeline = monthlyRows.map((row) => {
    const total = num(row.buyers);
    const newBuyers = Math.min(total, firstByMonth.get(row.m) ?? 0);
    const churned = churnByMonth.get(row.m) ?? 0;
    const base = num(row.base);
    return { month: row.m, newBuyers, recurring: total - newBuyers, churned, churnRate: base > 0 ? (churned / base) * 100 : null };
  });

  const segmentOrder: HealthSegment[] = ["promotor", "ativo", "risco", "critico", "dormente"];
  const segments = segmentOrder.map((key) => ({ key, total: num(customers.segments?.[key]?.total), ltv: num(customers.segments?.[key]?.ltv) }));

  return {
    period,
    filters: { compare: filters.compare, inactiveDays, store: filters.store ?? "", seller: filters.seller ?? "" },
    kpis: {
      base: { total: num(baseRows[0]?.total), buyersEver: num(customers.buyersEver) },
      buyers: { value: buyers, previous: buyersCmp, newBuyers: num(customers.newBuyers.current), newBuyersPrevious: num(customers.newBuyers.compare), orders: num(stats?.orders) },
      inactive: {
        value: num(customers.inactive.selected),
        previous: num(customers.inactive.selectedCmp),
        ranges: { d30: num(customers.inactive.d30), d60: num(customers.inactive.d60), d90: num(customers.inactive.d90), d365: num(customers.inactive.d365) },
      },
      dissatisfaction: {
        value: answered > 0 ? (num(nps?.detractors) / answered) * 100 : null,
        previous: answeredCmp > 0 ? (num(nps?.detractorsCmp) / answeredCmp) * 100 : null,
        answered,
        detractors: num(nps?.detractors),
      },
      ticket: { value: ordersNow > 0 ? revenue / ordersNow : null, previous: ordersCmp > 0 ? revenueCmp / ordersCmp : null, revenue, revenuePrevious: revenueCmp },
    },
    timeline,
    segments,
    risk: (customers.risk ?? []).map((row) => ({ ...row, orders: num(row.orders), ltv: num(row.ltv), score: row.score === null ? null : num(row.score) })),
  };
}

export type CustomerDashboard = Awaited<ReturnType<typeof loadCustomerDashboard>>;

export function getCustomerDashboard(filters: CustomerDashboardFilters) {
  const key = ["painel", filters.preset, filters.start ?? "", filters.end ?? "", filters.compare, filters.store ?? "", filters.seller ?? "", filters.inactiveDays, brtToday()].join(":");
  return cached(key, 60, () => loadCustomerDashboard(filters));
}

/** Lojas cadastradas e vendedores com vendas nos últimos 12 meses (para os filtros). */
export function getCustomerDashboardOptions() {
  return cached("painel:options", 1800, async () => {
    const [stores, sellers] = await Promise.all([
      prisma.store.findMany({ where: { active: true }, orderBy: { number: "asc" }, select: { number: true, name: true } }),
      prisma.$queryRaw<{ seller: string }[]>`
        SELECT seller FROM "VmsetInvoiceOrder"
        WHERE day >= CURRENT_DATE - 365 AND seller IS NOT NULL
        GROUP BY seller ORDER BY seller LIMIT 500
      `,
    ]);
    return {
      stores: stores.map((store) => ({ id: String(store.number), name: `${store.number} · ${store.name}` })),
      sellers: sellers.map((row) => row.seller),
    };
  });
}
