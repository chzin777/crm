import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizePlace } from "@/lib/store-places";

const ACCENTS = Prisma.sql`'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC'`;

export function placeKey(neighborhood: string, city: string, state: string) {
  return [neighborhood, city, state].map(normalizePlace).join("|");
}

const normalizedSql = (column: string) =>
  Prisma.sql`regexp_replace(translate(upper(btrim(coalesce(${Prisma.raw(column)}, ''))), ${ACCENTS}), '\\s+', ' ', 'g')`;

// Same key as placeKey(), computed in SQL from the contact columns.
export const CONTACT_PLACE_KEY = Prisma.sql`(${normalizedSql("c.neighborhood")} || '|' || ${normalizedSql("c.city")} || '|' || ${normalizedSql("c.state")})`;

export async function geocodePlace(neighborhood: string, city: string, state: string): Promise<{ lat: number; lng: number } | null> {
  const query = [neighborhood, city, state, "Brasil"].filter(Boolean).join(", ");
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({ format: "json", limit: "1", countrycodes: "br", q: query })}`, {
    headers: { "User-Agent": "oticas-brasil-crm/1.0", "Accept-Language": "pt-BR" },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Geocoding failed (${response.status})`);
  const results = await response.json() as Array<{ lat: string; lon: string }>;
  const first = results[0];
  if (!first) return null;
  const lat = Number(first.lat);
  const lng = Number(first.lon);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

export async function pendingPlaces(state: string, limit: number) {
  const rows = await prisma.$queryRaw<Array<{ neighborhood: string; city: string; state: string; key: string; total: bigint }>>(Prisma.sql`
    SELECT n AS neighborhood, ci AS city, st AS state, key, total FROM (
      SELECT ${normalizedSql("c.neighborhood")} AS n, ${normalizedSql("c.city")} AS ci, ${normalizedSql("c.state")} AS st,
             ${CONTACT_PLACE_KEY} AS key, count(*) AS total
      FROM "Contact" c
      WHERE btrim(coalesce(c.neighborhood, '')) <> '' AND btrim(coalesce(c.city, '')) <> ''
        AND ${normalizedSql("c.state")} = ${normalizePlace(state)}
      GROUP BY 1, 2, 3, 4
    ) places
    WHERE NOT EXISTS (SELECT 1 FROM "PlaceGeo" g WHERE g.key = places.key)
    ORDER BY total DESC
  `);
  return { total: rows.length, items: rows.slice(0, limit) };
}

export async function cachePlace(key: string, coords: { lat: number; lng: number } | null) {
  await prisma.placeGeo.upsert({
    where: { key },
    create: { key, lat: coords?.lat ?? null, lng: coords?.lng ?? null },
    update: { lat: coords?.lat ?? null, lng: coords?.lng ?? null },
  });
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
