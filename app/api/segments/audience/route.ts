import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { CONTACT_PLACE_KEY } from "@/lib/geocode";

const criterionSchema = z.object({
  id: z.string().max(200),
  nome: z.string().max(300),
  tipo: z.enum(["geral", "loja"]),
});

const bodySchema = z.object({
  groups: z.record(z.string().max(100), z.array(criterionSchema).max(30)).refine((groups) => Object.keys(groups).length <= 200),
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

function criterionCondition(criterion: z.infer<typeof criterionSchema>, stores: Map<number, StoreRecord>): Prisma.Sql {
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
  const stores = await prisma.store.findMany({ where: { active: true }, orderBy: { number: "asc" }, select: { number: true, name: true } });
  return Response.json({ data: stores });
}

export async function POST(request: Request) {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Critérios inválidos." }, { status: 400 });

  const stores = new Map((await prisma.store.findMany()).map((store) => [store.number, store]));
  const counts: Record<string, number> = {};
  for (const [key, criteria] of Object.entries(parsed.data.groups)) {
    if (criteria.length === 0) {
      counts[key] = 0;
      continue;
    }
    const conditions = criteria.map((criterion) => criterionCondition(criterion, stores));
    const rows = await prisma.$queryRaw<Array<{ n: bigint }>>(
      Prisma.sql`SELECT count(*) AS n FROM "Contact" c WHERE ${Prisma.join(conditions, " AND ")}`
    );
    counts[key] = Number(rows[0]?.n ?? 0);
  }
  return Response.json({ counts });
}
