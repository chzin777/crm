import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { cached } from "@/lib/cache";
import { CONTACT_PLACE_KEY } from "@/lib/geocode";
import { campaignAudienceSets } from "@/lib/campaign-metrics";
import { matchesBirthday, type BirthdayOperator, type BirthParts } from "@/lib/birthday";
import { storeErpCode } from "@/lib/stores";
import { brDay, purchaseWindow } from "@/lib/br-time";
import { MAX_RULES, normalizeRuleText, ruleSchema, splitRuleList, validateRule, type SegmentRule } from "@/lib/segment-rules";

const criterionSchema = z.object({
  id: z.string().max(200),
  nome: z.string().max(300),
  tipo: z.enum(["geral", "loja"]),
  regras: z.array(ruleSchema).max(MAX_RULES).optional(),
  /** "any" = basta uma regra (OU); padrão "all" = todas (E). */
  combinar: z.enum(["all", "any"]).optional(),
});

/** Destinatários e convertidos de cada campanha citada nas regras, resolvidos antes de montar o SQL. */
type CampaignSets = Map<string, { delivered: string[]; converted: string[] }>;
/** Dados resolvidos antes de montar o SQL das regras que dependem de cálculo fora do banco. */
type RuleContext = { campaigns: CampaignSets; birthDates: string[] };

const BR_TODAY = Prisma.sql`(now() AT TIME ZONE 'America/Sao_Paulo')::date`;

/** Pedido de venda no ERP na janela pedida, com filtros opcionais aplicados ao próprio pedido. */
function purchaseCondition(rule: SegmentRule): Prisma.Sql {
  // Dias de Brasília calculados em TS (lib/br-time, com testes de virada de dia em servidor UTC).
  const range = purchaseWindow(rule.operador, rule.valor, rule.valor2);
  if (!range) return Prisma.sql`FALSE`;
  const window = Prisma.sql`v."orderDate" BETWEEN ${range.start}::date AND ${range.end}::date`;
  const where = [window, Prisma.sql`v."type" = 'Venda'`, Prisma.sql`v."sourceKey" IS NOT NULL`];
  const store = rule.filtros?.loja?.trim();
  if (store) where.push(Prisma.sql`${normalizeText(Prisma.sql`COALESCE(v."store", '')`)} = ${normalizeRuleText(store)}`);
  const having: Prisma.Sql[] = [];
  const minValue = Number((rule.filtros?.valorMin ?? "").replace(",", "."));
  if (rule.filtros?.valorMin && Number.isFinite(minValue) && minValue > 0) having.push(Prisma.sql`COALESCE(SUM(v."amount"), 0) >= ${minValue}`);
  const product = rule.filtros?.produto?.trim();
  if (product) {
    const needle = normalizeRuleText(product);
    const columns = [Prisma.sql`v."description"`, Prisma.sql`v."category"`, Prisma.sql`v."subcategory"`, Prisma.sql`v."brand"`]
      .map((column) => Prisma.sql`position(${needle} in ${normalizeText(Prisma.sql`COALESCE(${column}, '')`)}) > 0`);
    having.push(Prisma.sql`bool_or(${Prisma.join(columns, " OR ")})`);
  }
  return Prisma.sql`c."sourceKey" IN (
    SELECT v."sourceKey" FROM "VmsetSale" v
    WHERE ${Prisma.join(where, " AND ")}
    GROUP BY v."sourceKey", v."orderNumber", v."orderDate"
    ${having.length ? Prisma.sql`HAVING ${Prisma.join(having, " AND ")}` : Prisma.empty}
  )`;
}

/** Hoje no fuso de Brasília, em partes (ano, mês, dia). */
function brTodayParts(): BirthParts {
  const [year, month, day] = brDay().split("-").map(Number);
  return { year, month, day };
}

/**
 * Textos distintos de Contact.birthDate (~28 mil para 320 mil contatos), com cache curto.
 * Interpretar a data dentro do SQL custava de 1 a 15 s por consulta; aqui a regra (lib/birthday.ts, com testes)
 * roda sobre os textos distintos e o banco só compara igualdade.
 */
const loadBirthDates = () => cached("audience:birthdates", 300, async () =>
  (await prisma.$queryRaw<{ b: string }[]>`SELECT DISTINCT "birthDate" AS b FROM "Contact" WHERE "birthDate" <> ''`).map((row) => row.b));

/** Aniversário/idade: contatos cuja data de nascimento atende à regra hoje; sem data (ou inválida) nunca entram. */
function birthdayCondition(rule: SegmentRule, birthDates: string[]): Prisma.Sql {
  const today = brTodayParts();
  const matching = birthDates.filter((value) => matchesBirthday(value, rule.operador as BirthdayOperator, today, rule.valor, rule.valor2));
  return matching.length === 0 ? Prisma.sql`FALSE` : Prisma.sql`c."birthDate" = ANY(${matching}::text[])`;
}

function campaignCondition(rule: SegmentRule, campaigns: CampaignSets): Prisma.Sql {
  const sets = campaigns.get(rule.valor ?? "");
  if (!sets) return Prisma.sql`FALSE`;
  if (rule.operador === "converted") return Prisma.sql`c.id = ANY(${sets.converted}::text[])`;
  if (rule.operador === "not_converted") {
    const converted = new Set(sets.converted);
    return Prisma.sql`c.id = ANY(${sets.delivered.filter((id) => !converted.has(id))}::text[])`;
  }
  return Prisma.sql`FALSE`;
}

/** Busca (com cache curto) os contatos de cada campanha usada em regras de conversão. */
async function loadCampaignSets(criteria: z.infer<typeof criterionSchema>[]): Promise<CampaignSets> {
  const ids = new Set(criteria.flatMap((criterion) => (criterion.regras ?? [])
    .filter((rule) => rule.campo === "campaignConversion" && rule.valor)
    .map((rule) => rule.valor as string)));
  const sets: CampaignSets = new Map();
  await Promise.all([...ids].map(async (id) => {
    sets.set(id, await cached(`audience:campaign:${id}`, 120, () => campaignAudienceSets(id)));
  }));
  return sets;
}

const bodySchema = z.object({
  groups: z.record(z.string().max(100), z.array(criterionSchema).max(30)).refine((groups) => Object.keys(groups).length <= 200),
  contactGroups: z.record(z.string().max(100), z.array(z.string().max(200)).max(100_000))
    .refine((groups) => Object.keys(groups).length <= 200).optional(),
  // Critérios aplicados só sobre os contatos do grupo de mesma chave em contactGroups (refino da planilha).
  contactCriteria: z.record(z.string().max(100), z.array(criterionSchema).max(30))
    .refine((groups) => Object.keys(groups).length <= 200).optional(),
  includeRecipients: z.boolean().optional(),
  /** Quantos contatos de amostra devolver por grupo (prévia ao vivo do construtor). */
  sample: z.number().int().min(0).max(50).optional(),
});

// Compras do ERP por cliente (espelho do VMSet, só vendas e sem serviços): ver prisma/vmset-sale.sql.
const FROM_CONTACTS = Prisma.sql`FROM "Contact" c LEFT JOIN "VmsetCustomerStats" s ON s."sourceKey" = c."sourceKey"`;
const LAST_PURCHASE_DATE = Prisma.sql`s."lastDay"`;
const ERP_ORDERS = Prisma.sql`COALESCE(s.orders, 0)`;
const ERP_TOTAL = Prisma.sql`COALESCE(s.total, 0)`;
const ERP_TICKET = Prisma.sql`(s.total / NULLIF(s.orders, 0))`;
const PHONE_DIGITS = Prisma.sql`regexp_replace(regexp_replace(COALESCE(c.phone, ''), '[^0-9]', '', 'g'), '^55(?=[0-9]{10,11}$)', '')`;
const PIPELINE_CARDS = Prisma.sql`SELECT card->>'contactId' AS contact_id, card->>'coluna' AS stage
  FROM "CrmWorkspaceData" w
  CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(w.value) = 'array' THEN w.value ELSE '[]'::jsonb END) card
  WHERE w.key = 'pipeline' AND card->>'contactId' IS NOT NULL`;

type StoreRecord = { id: string; number: number; name: string; neighborhoods: string[]; city: string | null; radiusKm: number; lat: number | null; lng: number | null };

const NORMALIZED_NEIGHBORHOOD = Prisma.sql`translate(upper(btrim(c.neighborhood)), 'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC')`;
const NORMALIZED_CITY = Prisma.sql`translate(upper(btrim(c.city)), 'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC')`;

const haversineKm = (lat1: Prisma.Sql, lng1: Prisma.Sql, lat2: Prisma.Sql, lng2: Prisma.Sql) =>
  Prisma.sql`12742 * asin(sqrt(LEAST(1, power(sin(radians((${lat2} - ${lat1}) / 2)), 2)
    + cos(radians(${lat1})) * cos(radians(${lat2})) * power(sin(radians((${lng2} - ${lng1}) / 2)), 2))))`;

// A contact is reached by the radius only when this store is the nearest active store to the contact's neighborhood.
function withinRadius(store: StoreRecord): Prisma.Sql {
  const storeLat = Prisma.sql`${store.lat}::float8`;
  const storeLng = Prisma.sql`${store.lng}::float8`;
  const own = haversineKm(storeLat, storeLng, Prisma.sql`g.lat`, Prisma.sql`g.lng`);
  const other = haversineKm(Prisma.sql`o.lat`, Prisma.sql`o.lng`, Prisma.sql`g.lat`, Prisma.sql`g.lng`);
  return Prisma.sql`EXISTS (
    SELECT 1 FROM "PlaceGeo" g
    WHERE g.key = ${CONTACT_PLACE_KEY} AND g.lat IS NOT NULL
      AND ${own} <= ${store.radiusKm}
      AND NOT EXISTS (
        SELECT 1 FROM "Store" o
        WHERE o.active AND o.lat IS NOT NULL AND o.lng IS NOT NULL AND o.id <> ${store.id}
          AND (${other} < ${own} OR (${other} = ${own} AND o.name < ${store.name}))
      )
  )`;
}

const normalizeText = (value: Prisma.Sql) =>
  Prisma.sql`translate(upper(btrim(${value})), 'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC')`;

const numberComparison = (column: Prisma.Sql, rule: SegmentRule): Prisma.Sql => {
  const a = Number((rule.valor ?? "").replace(",", "."));
  const b = Number((rule.valor2 ?? "").replace(",", "."));
  switch (rule.operador) {
    case "eq": return Prisma.sql`${column} = ${a}`;
    case "gt": return Prisma.sql`${column} > ${a}`;
    case "gte": return Prisma.sql`${column} >= ${a}`;
    case "lt": return Prisma.sql`${column} < ${a}`;
    case "lte": return Prisma.sql`${column} <= ${a}`;
    case "between": return Prisma.sql`${column} BETWEEN ${Math.min(a, b)} AND ${Math.max(a, b)}`;
    default: return Prisma.sql`FALSE`;
  }
};

function ruleCondition(rule: SegmentRule, context: RuleContext): Prisma.Sql {
  if (validateRule(rule)) return Prisma.sql`FALSE`;
  const value = rule.valor ?? "";
  const column = (name: string) => Prisma.raw(`c."${name}"`);

  switch (rule.campo) {
    case "birthday": return birthdayCondition(rule, context.birthDates);
    case "erpPurchase": return purchaseCondition(rule);
    case "campaignConversion": return campaignCondition(rule, context.campaigns);
    case "purchases": return numberComparison(ERP_ORDERS, rule);
    case "totalSpent": return numberComparison(ERP_TOTAL, rule);
    case "avgTicket": return Prisma.sql`s.orders > 0 AND ${numberComparison(ERP_TICKET, rule)}`;
    case "ddd": {
      const ddd = Prisma.sql`left(${PHONE_DIGITS}, 2)`;
      const digits = value.replace(/\D/g, "");
      switch (rule.operador) {
        case "eq": return Prisma.sql`length(${PHONE_DIGITS}) >= 10 AND ${ddd} = ${digits}`;
        case "neq": return Prisma.sql`length(${PHONE_DIGITS}) >= 10 AND ${ddd} <> ${digits}`;
        case "contains": return Prisma.sql`length(${PHONE_DIGITS}) >= 10 AND position(${digits} in ${ddd}) > 0`;
        case "in": return Prisma.sql`length(${PHONE_DIGITS}) >= 10 AND ${ddd} = ANY(${splitRuleList(value)}::text[])`;
        case "not_in": return Prisma.sql`length(${PHONE_DIGITS}) >= 10 AND NOT (${ddd} = ANY(${splitRuleList(value)}::text[]))`;
        case "filled": return Prisma.sql`length(${PHONE_DIGITS}) >= 10`;
        case "empty": return Prisma.sql`length(${PHONE_DIGITS}) < 10`;
        default: return Prisma.sql`FALSE`;
      }
    }
    case "tag": {
      const anyTag = (match: Prisma.Sql) => Prisma.sql`EXISTS (
        SELECT 1 FROM "ChatConversation" cc CROSS JOIN LATERAL unnest(cc.tags) AS t(tag)
        WHERE cc."contactId" = c.id AND ${match})`;
      const tag = normalizeText(Prisma.sql`t.tag`);
      const needle = normalizeText(Prisma.sql`${value}`);
      switch (rule.operador) {
        case "eq": return anyTag(Prisma.sql`${tag} = ${needle}`);
        case "neq": return Prisma.sql`NOT ${anyTag(Prisma.sql`${tag} = ${needle}`)}`;
        case "contains": return anyTag(Prisma.sql`position(${needle} in ${tag}) > 0`);
        case "in": return anyTag(Prisma.sql`${tag} = ANY(${splitRuleList(value).map(normalizeRuleText)}::text[])`);
        case "not_in": return Prisma.sql`NOT ${anyTag(Prisma.sql`${tag} = ANY(${splitRuleList(value).map(normalizeRuleText)}::text[])`)}`;
        case "filled": return anyTag(Prisma.sql`TRUE`);
        case "empty": return Prisma.sql`NOT ${anyTag(Prisma.sql`TRUE`)}`;
        default: return Prisma.sql`FALSE`;
      }
    }
    case "pipelineStage":
      return rule.operador === "neq"
        ? Prisma.sql`c.id NOT IN (SELECT contact_id FROM (${PIPELINE_CARDS}) p WHERE p.stage = ${value})`
        : Prisma.sql`c.id IN (SELECT contact_id FROM (${PIPELINE_CARDS}) p WHERE p.stage = ${value})`;
    case "lastPurchase": {
      const hasPurchase = Prisma.sql`${LAST_PURCHASE_DATE} IS NOT NULL`;
      switch (rule.operador) {
        // Postgres em UTC: CURRENT_DATE vira o dia seguinte às 21h de Brasília, por isso o dia de Brasília explícito.
        case "within_days": return Prisma.sql`${hasPurchase} AND ${LAST_PURCHASE_DATE} <= ${BR_TODAY} AND ${LAST_PURCHASE_DATE} >= ${BR_TODAY} - ${Math.floor(Number(value))}::int`;
        case "older_days": return Prisma.sql`${hasPurchase} AND ${LAST_PURCHASE_DATE} < ${BR_TODAY} - ${Math.floor(Number(value))}::int`;
        case "before": return Prisma.sql`${hasPurchase} AND ${LAST_PURCHASE_DATE} < ${value}::date`;
        case "after": return Prisma.sql`${hasPurchase} AND ${LAST_PURCHASE_DATE} > ${value}::date`;
        case "between": {
          const [start, end] = [value, rule.valor2 ?? ""].sort();
          return Prisma.sql`${hasPurchase} AND ${LAST_PURCHASE_DATE} BETWEEN ${start}::date AND ${end}::date`;
        }
        case "empty": return Prisma.sql`${LAST_PURCHASE_DATE} IS NULL`;
        default: return Prisma.sql`FALSE`;
      }
    }
    case "category":
      return rule.operador === "neq" ? Prisma.sql`c.category <> ${value}` : Prisma.sql`c.category = ${value}`;
    case "npsRating":
      return Prisma.sql`EXISTS (SELECT 1 FROM "NpsResponse" n WHERE n."contactId" = c.id AND ${numberComparison(Prisma.sql`n.rating`, rule)})`;
    case "npsAnswered": {
      const answered = Prisma.sql`EXISTS (SELECT 1 FROM "NpsResponse" n WHERE n."contactId" = c.id)`;
      return value === "yes" ? answered : Prisma.sql`NOT ${answered}`;
    }
    case "gender":
      return rule.operador === "neq"
        ? Prisma.sql`COALESCE(upper(left(btrim(c.gender), 1)), '') <> ${value}`
        : Prisma.sql`upper(left(btrim(c.gender), 1)) = ${value}`;
    case "phone":
    case "email": {
      const name = rule.campo === "phone" ? "phone" : "email";
      return rule.operador === "filled"
        ? Prisma.sql`COALESCE(btrim(${column(name)}), '') <> ''`
        : Prisma.sql`COALESCE(btrim(${column(name)}), '') = ''`;
    }
    case "city":
    case "neighborhood":
    case "state":
    case "occupation":
    case "segment": {
      const target = column(rule.campo);
      const normalized = normalizeText(Prisma.sql`COALESCE(${target}, '')`);
      const needle = normalizeText(Prisma.sql`${value}`);
      switch (rule.operador) {
        case "eq": return Prisma.sql`${normalized} = ${needle}`;
        case "neq": return Prisma.sql`${normalized} <> ${needle}`;
        case "contains": return Prisma.sql`position(${needle} in ${normalized}) > 0`;
        case "in": return Prisma.sql`${normalized} = ANY(${splitRuleList(value).map(normalizeRuleText)}::text[])`;
        case "not_in": return Prisma.sql`NOT (${normalized} = ANY(${splitRuleList(value).map(normalizeRuleText)}::text[]))`;
        case "filled": return Prisma.sql`${normalized} <> ''`;
        case "empty": return Prisma.sql`${normalized} = ''`;
        default: return Prisma.sql`FALSE`;
      }
    }
    default: return Prisma.sql`FALSE`;
  }
}

function criterionCondition(criterion: z.infer<typeof criterionSchema>, stores: Map<string, StoreRecord>, context: RuleContext): Prisma.Sql {
  if (criterion.regras && criterion.regras.length > 0) {
    const conditions = criterion.regras.map((rule) => Prisma.sql`(${ruleCondition(rule, context)})`);
    return Prisma.sql`(${Prisma.join(conditions, criterion.combinar === "any" ? " OR " : " AND ")})`;
  }
  if (criterion.tipo === "loja") {
    const store = stores.get(criterion.id.replace(/^store-/, ""));
    if (!store) return Prisma.sql`FALSE`;
    // Direct link: the store of the contact's latest sale. The store neighborhood and the service radius add nearby customers.
    // Contact.store guarda o código ERP da loja da última venda ("13"), que vem no nome da loja ("LJ 13 ..."),
    // e não o sequencial interno Store.number.
    const erpCode = storeErpCode(store.name);
    const alternatives: Prisma.Sql[] = erpCode ? [Prisma.sql`btrim(c.store) = ${erpCode}`] : [];
    if (store.neighborhoods.length > 0) {
      const sameNeighborhood = Prisma.sql`${NORMALIZED_NEIGHBORHOOD} = ANY(${store.neighborhoods}::text[])`;
      alternatives.push(store.city ? Prisma.sql`${sameNeighborhood} AND ${NORMALIZED_CITY} = ${store.city}` : sameNeighborhood);
    }
    if (store.radiusKm > 0 && store.lat !== null && store.lng !== null) alternatives.push(withinRadius(store));
    if (alternatives.length === 0) return Prisma.sql`FALSE`;
    return Prisma.sql`(${Prisma.join(alternatives.map((item) => Prisma.sql`(${item})`), " OR ")})`;
  }

  const withinDays = (days: number) =>
    Prisma.sql`${LAST_PURCHASE_DATE} <= ${BR_TODAY} AND ${LAST_PURCHASE_DATE} >= ${BR_TODAY} - ${days}::int`;
  switch (criterion.id) {
    case "criteria-30d": return withinDays(30);
    case "criteria-90d": return withinDays(90);
    case "criteria-180d": return withinDays(180);
    case "criteria-inactive-180d":
      return Prisma.sql`${LAST_PURCHASE_DATE} < ${BR_TODAY} - 180`;
    case "criteria-no-nps":
      return Prisma.sql`NOT EXISTS (SELECT 1 FROM "NpsResponse" n WHERE n."contactId" = c.id)`;
    case "criteria-low-nps":
      return Prisma.sql`EXISTS (SELECT 1 FROM "NpsResponse" n WHERE n."contactId" = c.id AND n.rating < 7)`;
    case "criteria-valid-phone":
      return Prisma.sql`regexp_replace(regexp_replace(COALESCE(c.phone, ''), '[^0-9]', '', 'g'), '^55(?=[0-9]{10,11}$)', '') ~ '^[0-9]{10,11}$'`;
    default:
      return Prisma.sql`FALSE`;
  }
}

export async function GET() {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const stores = await prisma.store.findMany({ orderBy: { number: "asc" }, select: { number: true, name: true, active: true } });
  return Response.json({ data: stores });
}

type AudienceSampleRow = { id: string; nome: string; telefone: string; ultimaCompra: string | null; valorUltimaCompra: number | null };

/** Primeiros contatos do público (compra mais recente primeiro) para conferência na prévia. */
async function sampleContacts(conditions: Prisma.Sql[], limit: number): Promise<AudienceSampleRow[]> {
  const rows = await prisma.$queryRaw<{ id: string; name: string; phone: string | null; last_day: string | null; last_total: number | null }[]>(Prisma.sql`
    SELECT t.id, t.name, t.phone, to_char(t."lastDay", 'YYYY-MM-DD') AS last_day, lo.total AS last_total
    FROM (
      SELECT c.id, c.name, c.phone, c."sourceKey", s."lastDay"
      ${FROM_CONTACTS}
      WHERE ${Prisma.join(conditions, " AND ")}
      -- Sem ORDER BY aqui: ordenar o público inteiro custa segundos em janelas longas; a amostra é ordenada abaixo.
      LIMIT ${limit}
    ) t
    -- Valor do último dia de compra só para as linhas da amostra (não para o público inteiro).
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(v."amount"), 0)::float8 AS total FROM "VmsetSale" v
      WHERE v."sourceKey" = t."sourceKey" AND v."type" = 'Venda' AND v."orderDate" = t."lastDay"
    ) lo ON t."lastDay" IS NOT NULL
    ORDER BY t."lastDay" DESC NULLS LAST, t.name
  `);
  return rows.map((row) => ({ id: row.id, nome: row.name, telefone: row.phone ?? "", ultimaCompra: row.last_day, valorUltimaCompra: row.last_total === null ? null : Number(row.last_total) }));
}

async function computeGroupCount(key: string, criteria: z.infer<typeof criterionSchema>[], stores: Map<string, StoreRecord>, includeRecipients: boolean, restrictToIds?: string[], context: RuleContext = { campaigns: new Map(), birthDates: [] }, sample = 0): Promise<{ count: number; sample?: AudienceSampleRow[]; recipients?: { id: string; nome: string; telefone: string; email: string; dataNascimento: string; segmento: string }[] }> {
  if (criteria.length === 0 || (restrictToIds && restrictToIds.length === 0)) return { count: 0, recipients: includeRecipients ? [] : undefined, sample: sample > 0 ? [] : undefined };
  const conditions = criteria.map((criterion) => criterionCondition(criterion, stores, context));
  // Interseção: os critérios filtram apenas dentro da lista importada.
  if (restrictToIds) conditions.unshift(Prisma.sql`c.id = ANY(${restrictToIds}::text[])`);
  if (includeRecipients) {
    const rows = await prisma.$queryRaw<Array<{
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
      birthDate: string | null;
      segment: string | null;
    }>>(Prisma.sql`
      SELECT c.id, c.name, c.phone, c.email, c."birthDate", c.segment
      ${FROM_CONTACTS}
      WHERE ${Prisma.join(conditions, " AND ")}
      ORDER BY c.name
    `);
    return {
      count: rows.length,
      recipients: rows.map((contact) => ({
        id: contact.id,
        nome: contact.name,
        telefone: contact.phone ?? "",
        email: contact.email ?? "",
        dataNascimento: contact.birthDate ?? "",
        segmento: contact.segment ?? "",
      })),
    };
  }
  const [rows, preview] = await Promise.all([
    prisma.$queryRaw<Array<{ n: bigint }>>(
      Prisma.sql`SELECT count(*) AS n ${FROM_CONTACTS} WHERE ${Prisma.join(conditions, " AND ")}`
    ),
    sample > 0 ? sampleContacts(conditions, sample) : Promise.resolve(undefined),
  ]);
  return { count: Number(rows[0]?.n ?? 0), sample: preview };
}

export async function POST(request: Request) {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Critérios inválidos." }, { status: 400 });

  const allCriteria = [...Object.values(parsed.data.groups), ...Object.values(parsed.data.contactCriteria ?? {})].flat();
  const usesBirthday = allCriteria.some((criterion) => criterion.regras?.some((rule) => rule.campo === "birthday"));
  const [storeRows, campaigns, birthDates] = await Promise.all([
    prisma.store.findMany(),
    loadCampaignSets(allCriteria),
    usesBirthday ? loadBirthDates() : Promise.resolve([] as string[]),
  ]);
  const context: RuleContext = { campaigns, birthDates };
  // Critério de loja tem id "store-<número>".
  const stores = new Map(storeRows.map((store) => [String(store.number), store]));
  const sampleSize = parsed.data.includeRecipients ? 0 : parsed.data.sample ?? 0;
  const counts: Record<string, number> = {};
  const samples: Record<string, AudienceSampleRow[]> = {};
  const recipients: Record<string, { id: string; nome: string; telefone: string; email: string; dataNascimento: string; segmento: string }[]> = {};

  // Cache individual store counts so repeated page loads hit Redis instead of recomputing haversine.
  const isStoreOnlyGroup = (criteria: z.infer<typeof criterionSchema>[]) =>
    criteria.length === 1 && criteria[0].tipo === "loja" && (!criteria[0].regras || criteria[0].regras.length === 0);

  for (const [key, criteria] of Object.entries(parsed.data.groups)) {
    const cacheKey = !parsed.data.includeRecipients && isStoreOnlyGroup(criteria) ? `audience:store:${criteria[0].id}` : null;
    if (cacheKey) {
      const hit = await cached(cacheKey, 300, () => computeGroupCount(key, criteria, stores, false));
      counts[key] = hit.count;
    } else {
      const result = await computeGroupCount(key, criteria, stores, !!parsed.data.includeRecipients, undefined, context, sampleSize);
      counts[key] = result.count;
      if (result.sample) samples[key] = result.sample;
      if (parsed.data.includeRecipients && result.recipients) recipients[key] = result.recipients;
    }
  }
  for (const [key, contactIds] of Object.entries(parsed.data.contactGroups ?? {})) {
    const refine = parsed.data.contactCriteria?.[key] ?? [];
    if (refine.length > 0) {
      const result = await computeGroupCount(key, refine, stores, !!parsed.data.includeRecipients, contactIds, context);
      counts[key] = result.count;
      if (parsed.data.includeRecipients && result.recipients) recipients[key] = result.recipients;
      continue;
    }
    if (!parsed.data.includeRecipients) {
      counts[key] = contactIds.length === 0 ? 0 : await prisma.contact.count({ where: { id: { in: contactIds } } });
      continue;
    }
    const contacts = contactIds.length === 0 ? [] : await prisma.contact.findMany({
      where: { id: { in: contactIds } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, phone: true, email: true, birthDate: true, segment: true },
    });
    counts[key] = contacts.length;
    recipients[key] = contacts.map((contact) => ({
      id: contact.id,
      nome: contact.name,
      telefone: contact.phone ?? "",
      email: contact.email ?? "",
      dataNascimento: contact.birthDate ?? "",
      segmento: contact.segment ?? "",
    }));
  }
  if (parsed.data.includeRecipients) return Response.json({ counts, recipients });
  return Response.json(sampleSize > 0 ? { counts, samples } : { counts });
}
