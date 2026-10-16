import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { cached, invalidateCache } from "@/lib/cache";
import { CONTACT_PLACE_KEY } from "@/lib/geocode";
import { MAX_RULES, ruleSchema, validateRule, type SegmentRule } from "@/lib/segment-rules";

const criterionSchema = z.object({
  id: z.string().max(200),
  nome: z.string().max(300),
  tipo: z.enum(["geral", "loja"]),
  regras: z.array(ruleSchema).max(MAX_RULES).optional(),
});

const bodySchema = z.object({
  groups: z.record(z.string().max(100), z.array(criterionSchema).max(30)).refine((groups) => Object.keys(groups).length <= 200),
  contactGroups: z.record(z.string().max(100), z.array(z.string().max(200)).max(100_000))
    .refine((groups) => Object.keys(groups).length <= 200).optional(),
  includeRecipients: z.boolean().optional(),
});

const LAST_PURCHASE_DATE = Prisma.sql`(CASE
  WHEN c."lastPurchaseDate" ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$' THEN to_date(c."lastPurchaseDate", 'DD/MM/YYYY')
  WHEN c."lastPurchaseDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN to_date(left(c."lastPurchaseDate", 10), 'YYYY-MM-DD')
END)`;

type StoreRecord = { number: number; neighborhoods: string[]; city: string | null; radiusKm: number; lat: number | null; lng: number | null };

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
        WHERE o.active AND o.lat IS NOT NULL AND o.lng IS NOT NULL AND o.number <> ${store.number}
          AND (${other} < ${own} OR (${other} = ${own} AND o.number < ${store.number}))
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

function ruleCondition(rule: SegmentRule): Prisma.Sql {
  if (validateRule(rule)) return Prisma.sql`FALSE`;
  const value = rule.valor ?? "";
  const column = (name: string) => Prisma.raw(`c."${name}"`);

  switch (rule.campo) {
    case "purchases": return numberComparison(Prisma.sql`c.purchases`, rule);
    case "totalSpent": return numberComparison(Prisma.sql`c."totalSpent"`, rule);
    case "lastPurchase": {
      const hasPurchase = Prisma.sql`c.purchases > 0 AND ${LAST_PURCHASE_DATE} IS NOT NULL`;
      switch (rule.operador) {
        case "within_days": return Prisma.sql`${hasPurchase} AND ${LAST_PURCHASE_DATE} <= CURRENT_DATE AND ${LAST_PURCHASE_DATE} >= CURRENT_DATE - ${Math.floor(Number(value))}::int`;
        case "older_days": return Prisma.sql`${hasPurchase} AND ${LAST_PURCHASE_DATE} < CURRENT_DATE - ${Math.floor(Number(value))}::int`;
        case "before": return Prisma.sql`${hasPurchase} AND ${LAST_PURCHASE_DATE} < ${value}::date`;
        case "after": return Prisma.sql`${hasPurchase} AND ${LAST_PURCHASE_DATE} > ${value}::date`;
        case "between": {
          const [start, end] = [value, rule.valor2 ?? ""].sort();
          return Prisma.sql`${hasPurchase} AND ${LAST_PURCHASE_DATE} BETWEEN ${start}::date AND ${end}::date`;
        }
        case "empty": return Prisma.sql`(c.purchases = 0 OR ${LAST_PURCHASE_DATE} IS NULL)`;
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
        case "filled": return Prisma.sql`${normalized} <> ''`;
        case "empty": return Prisma.sql`${normalized} = ''`;
        default: return Prisma.sql`FALSE`;
      }
    }
    default: return Prisma.sql`FALSE`;
  }
}

function criterionCondition(criterion: z.infer<typeof criterionSchema>, stores: Map<number, StoreRecord>): Prisma.Sql {
  if (criterion.regras && criterion.regras.length > 0) {
    return Prisma.sql`(${Prisma.join(criterion.regras.map(ruleCondition), " AND ")})`;
  }
  if (criterion.tipo === "loja") {
    const store = stores.get(Number(criterion.id.replace(/^store-/, "")));
    if (!store) return Prisma.sql`FALSE`;
    // Direct link: the store of the contact's latest sale. The store neighborhood and the service radius add nearby customers.
    const bySale = Prisma.sql`btrim(c.store) = ${String(store.number)}`;
    const alternatives = [bySale];
    if (store.neighborhoods.length > 0) {
      const sameNeighborhood = Prisma.sql`${NORMALIZED_NEIGHBORHOOD} = ANY(${store.neighborhoods}::text[])`;
      alternatives.push(store.city ? Prisma.sql`${sameNeighborhood} AND ${NORMALIZED_CITY} = ${store.city}` : sameNeighborhood);
    }
    if (store.radiusKm > 0 && store.lat !== null && store.lng !== null) alternatives.push(withinRadius(store));
    return Prisma.sql`(${Prisma.join(alternatives.map((item) => Prisma.sql`(${item})`), " OR ")})`;
  }

  const withinDays = (days: number) =>
    Prisma.sql`c.purchases > 0 AND ${LAST_PURCHASE_DATE} <= CURRENT_DATE AND ${LAST_PURCHASE_DATE} >= CURRENT_DATE - ${days}::int`;
  switch (criterion.id) {
    case "criteria-30d": return withinDays(30);
    case "criteria-90d": return withinDays(90);
    case "criteria-180d": return withinDays(180);
    case "criteria-inactive-180d":
      return Prisma.sql`c.purchases > 0 AND ${LAST_PURCHASE_DATE} < CURRENT_DATE - 180`;
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
  const stores = await prisma.store.findMany({ orderBy: { number: "asc" }, select: { number: true, active: true } });
  return Response.json({ data: stores });
}

async function computeGroupCount(key: string, criteria: z.infer<typeof criterionSchema>[], stores: Map<number, StoreRecord>, includeRecipients: boolean): Promise<{ count: number; recipients?: { id: string; nome: string; telefone: string; email: string; dataNascimento: string; segmento: string }[] }> {
  if (criteria.length === 0) return { count: 0, recipients: includeRecipients ? [] : undefined };
  const conditions = criteria.map((criterion) => criterionCondition(criterion, stores));
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
      FROM "Contact" c
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
  const rows = await prisma.$queryRaw<Array<{ n: bigint }>>(
    Prisma.sql`SELECT count(*) AS n FROM "Contact" c WHERE ${Prisma.join(conditions, " AND ")}`
  );
  return { count: Number(rows[0]?.n ?? 0) };
}

export async function POST(request: Request) {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Critérios inválidos." }, { status: 400 });

  const stores = new Map((await prisma.store.findMany()).map((store) => [store.number, store]));
  const counts: Record<string, number> = {};
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
      const result = await computeGroupCount(key, criteria, stores, !!parsed.data.includeRecipients);
      counts[key] = result.count;
      if (parsed.data.includeRecipients && result.recipients) recipients[key] = result.recipients;
    }
  }
  for (const [key, contactIds] of Object.entries(parsed.data.contactGroups ?? {})) {
    if (!parsed.data.includeRecipients) continue;
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
  return Response.json(parsed.data.includeRecipients ? { counts, recipients } : { counts });
}
