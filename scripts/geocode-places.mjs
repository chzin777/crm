import { PrismaPg } from "@prisma/adapter-pg";
import Redis from "ioredis";
import { PrismaClient } from "../generated/prisma/client.ts";
import { createDatabaseUrl } from "../lib/database-url.ts";
import { normalizePlace } from "../lib/store-places.ts";

// Usage: npm run db:geocode [-- <max neighborhoods>]
// Finds coordinates (OpenStreetMap/Nominatim, 1 request per second) for the store neighborhoods and for the
// neighborhoods of the contacts. Results are cached in "PlaceGeo", so the script can be interrupted and resumed.
const limit = Number(process.argv[2]) || Infinity;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: createDatabaseUrl(process.env) }) });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const key = (neighborhood, city, state) => [neighborhood, city, state].map(normalizePlace).join("|");

async function geocode(neighborhood, city, state) {
  const query = [neighborhood, city, state, "Brasil"].filter(Boolean).join(", ");
  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ format: "json", limit: "1", countrycodes: "br", q: query })}`;
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": "oticas-brasil-crm/1.0", "Accept-Language": "pt-BR" }, signal: AbortSignal.timeout(15000) });
      if (response.status === 429 || response.status >= 500) throw new Error(`HTTP ${response.status}`);
      if (!response.ok) return null;
      const first = (await response.json())[0];
      const lat = Number(first?.lat);
      const lng = Number(first?.lon);
      return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    } catch (error) {
      if (attempt >= 5) throw error;
      console.warn(`Tentativa ${attempt} falhou (${error.message}); aguardando...`);
      await sleep(attempt * 15000);
    }
  }
}

const saveCache = (cacheKey, coords) => prisma.placeGeo.upsert({
  where: { key: cacheKey },
  create: { key: cacheKey, lat: coords?.lat ?? null, lng: coords?.lng ?? null },
  update: { lat: coords?.lat ?? null, lng: coords?.lng ?? null },
});

// Stores first, so the radius already works for them while the contact neighborhoods are processed.
const stores = await prisma.store.findMany({ where: { lat: null, city: { not: null }, state: { not: null }, neighborhoods: { isEmpty: false } }, orderBy: { number: "asc" } });
let located = 0;
for (const store of stores) {
  const cacheKey = key(store.neighborhoods[0], store.city, store.state);
  let coords = await prisma.placeGeo.findUnique({ where: { key: cacheKey } });
  if (!coords) {
    const found = await geocode(store.neighborhoods[0], store.city, store.state);
    await saveCache(cacheKey, found);
    coords = found;
    await sleep(1100);
  }
  if (!coords || coords.lat == null) {
    // Neighborhood unknown to OSM: fall back to the city center.
    const cityKey = key("", store.city, store.state);
    let cityCoords = await prisma.placeGeo.findUnique({ where: { key: cityKey } });
    if (!cityCoords) {
      cityCoords = await geocode("", store.city, store.state);
      await saveCache(cityKey, cityCoords);
      await sleep(1100);
    }
    if (cityCoords?.lat != null) coords = cityCoords;
  }
  if (coords?.lat != null) {
    await prisma.store.update({ where: { id: store.id }, data: { lat: coords.lat, lng: coords.lng } });
    located += 1;
  } else {
    console.warn(`Loja ${store.number}: bairro ${store.neighborhoods[0]} não localizado.`);
  }
}
console.log(`Lojas localizadas agora: ${located} de ${stores.length}`);

const states = (await prisma.store.findMany({ where: { active: true, state: { not: null } }, select: { state: true }, distinct: ["state"] })).map((store) => store.state);
const accents = "'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC'";
const norm = (column) => `regexp_replace(translate(upper(btrim(coalesce(${column}, ''))), ${accents}), '\\s+', ' ', 'g')`;
const places = await prisma.$queryRawUnsafe(`
  SELECT n AS neighborhood, ci AS city, st AS state, key, total FROM (
    SELECT ${norm("c.neighborhood")} AS n, ${norm("c.city")} AS ci, ${norm("c.state")} AS st,
           (${norm("c.neighborhood")} || '|' || ${norm("c.city")} || '|' || ${norm("c.state")}) AS key, count(*) AS total
    FROM "Contact" c
    WHERE btrim(coalesce(c.neighborhood, '')) <> '' AND btrim(coalesce(c.city, '')) <> '' AND ${norm("c.state")} = ANY($1)
    GROUP BY 1, 2, 3, 4
  ) places
  WHERE NOT EXISTS (SELECT 1 FROM "PlaceGeo" g WHERE g.key = places.key)
  ORDER BY total DESC
`, states);

const queue = places.slice(0, limit);
console.log(`Bairros de contatos a localizar: ${queue.length} de ${places.length} pendentes (UF: ${states.join(", ")})`);
let done = 0;
let notFound = 0;
for (const place of queue) {
  const coords = await geocode(place.neighborhood, place.city, place.state);
  await saveCache(place.key, coords);
  if (!coords) notFound += 1;
  done += 1;
  if (done % 25 === 0 || done === queue.length) console.log(`${done}/${queue.length} (sem resultado: ${notFound})`);
  await sleep(1100);
}

if (process.env.REDIS_URL) {
  const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, retryStrategy: () => null, lazyConnect: true });
  redis.on("error", () => {});
  try {
    await redis.connect();
    const keys = await redis.keys("crm:cache:stores*");
    if (keys.length) await redis.del(...keys);
    await redis.quit();
  } catch {
    console.warn("Redis indisponível; cache de lojas expira sozinho.");
  }
}
await prisma.$disconnect();
console.log("Concluído.");
