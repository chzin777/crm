/**
 * Script de geocodificação em background para lojas e bairros de contatos.
 * Roda continuamente, respeitando o limite de 1 req/s da API Nominatim.
 * Não ocupa tokens nem interfere no backend.
 */
import pg from "pg";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "CRM-OticasBrasil/1.0 (geocode-background)";
const DELAY_MS = 1100; // 1.1s entre requisições (Nominatim exige >= 1s)
const BATCH_SIZE = 50; // lugares por ciclo
const STORE_BATCH = 5; // lojas por ciclo (prioridade)

const pgUrl = new URL("postgresql://localhost");
pgUrl.hostname = process.env.DB_HOST || "localhost";
pgUrl.port = process.env.DB_PORT || "5432";
pgUrl.username = process.env.DB_USER || "crm_user";
pgUrl.password = process.env.DB_PASSWORD || "";
pgUrl.pathname = `/${process.env.DB_NAME || "crm"}`;
pgUrl.searchParams.set("schema", "public");

const client = new pg.Client({ connectionString: pgUrl.toString() });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function geocodePlace(neighborhood, city, state) {
  const query = [neighborhood, city, state, "Brasil"].filter(Boolean).join(", ");
  if (!query) return null;

  const url = `${NOMINATIM_URL}?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=1`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.error(`[GEO] HTTP ${res.status} for "${query}"`);
      return null;
    }
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    if (isNaN(lat) || isNaN(lng)) return null;
    return { lat, lng };
  } catch (err) {
    console.error(`[GEO] Error for "${query}": ${err.message}`);
    return null;
  }
}

function placeKey(neighborhood, city, state) {
  return `${(neighborhood || "").trim().toLowerCase()}|${(city || "").trim().toLowerCase()}|${(state || "").trim().toLowerCase()}`;
}

async function geocodeStores() {
  const result = await client.query(
    `SELECT id, name, neighborhoods, city, state
     FROM "Store"
     WHERE lat IS NULL AND lng IS NULL
       AND city IS NOT NULL AND state IS NOT NULL
     LIMIT $1`,
    [STORE_BATCH]
  );
  if (result.rows.length === 0) return 0;

  let processed = 0;
  for (const store of result.rows) {
    const neighborhood = store.neighborhoods?.[0] || "";
    const coords = await geocodePlace(neighborhood, store.city, store.state);
    if (coords) {
      await client.query(
        `UPDATE "Store" SET lat = $1, lng = $2, "updatedAt" = NOW() WHERE id = $3`,
        [coords.lat, coords.lng, store.id]
      );
      // Também salvar no PlaceGeo para reuso
      const key = placeKey(neighborhood, store.city, store.state);
      await client.query(
        `INSERT INTO "PlaceGeo" (key, lat, lng, "updatedAt")
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (key) DO UPDATE SET lat = $2, lng = $3, "updatedAt" = NOW()`,
        [key, coords.lat, coords.lng]
      );
      console.log(`[STORE] ✓ ${store.name} (${store.city}/${store.state}) → ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`);
    } else {
      console.log(`[STORE] ✗ ${store.name} (${store.city}/${store.state}) — não encontrado`);
    }
    processed++;
    await sleep(DELAY_MS);
  }
  return processed;
}

async function geocodeContactPlaces() {
  // Buscar bairros/cidades únicos dos contatos que ainda não foram geocodificados
  const result = await client.query(
    `SELECT DISTINCT
       c.neighborhood, c.city, c.state
     FROM "Contact" c
     LEFT JOIN "PlaceGeo" pg
       ON pg.key = lower(btrim(c.neighborhood)) || '|' || lower(btrim(c.city)) || '|' || lower(btrim(c.state))
     WHERE c.neighborhood IS NOT NULL
       AND c.city IS NOT NULL
       AND c.state IS NOT NULL
       AND pg.key IS NULL
     LIMIT $1`,
    [BATCH_SIZE]
  );
  if (result.rows.length === 0) return 0;

  let processed = 0;
  for (const row of result.rows) {
    const coords = await geocodePlace(row.neighborhood, row.city, row.state);
    const key = placeKey(row.neighborhood, row.city, row.state);
    if (coords) {
      await client.query(
        `INSERT INTO "PlaceGeo" (key, lat, lng, "updatedAt")
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (key) DO UPDATE SET lat = $2, lng = $3, "updatedAt" = NOW()`,
        [key, coords.lat, coords.lng]
      );
      console.log(`[PLACE] ✓ ${row.neighborhood}, ${row.city}/${row.state} → ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`);
    } else {
      // Marcar como tentado mesmo sem resultado para não ficar em loop
      await client.query(
        `INSERT INTO "PlaceGeo" (key, lat, lng, "updatedAt")
         VALUES ($1, NULL, NULL, NOW())
         ON CONFLICT (key) DO UPDATE SET "updatedAt" = NOW()`,
        [key]
      );
      console.log(`[PLACE] ✗ ${row.neighborhood}, ${row.city}/${row.state} — não encontrado`);
    }
    processed++;
    await sleep(DELAY_MS);
  }
  return processed;
}

async function getStats() {
  const stores = await client.query(
    `SELECT count(*) as total, count(lat) as geocoded FROM "Store"`
  );
  const places = await client.query(
    `SELECT count(*) as total, count(lat) as geocoded FROM "PlaceGeo"`
  );
  const pending = await client.query(
    `SELECT count(DISTINCT lower(btrim(c.neighborhood)) || '|' || lower(btrim(c.city)) || '|' || lower(btrim(c.state))) as pending
     FROM "Contact" c
     LEFT JOIN "PlaceGeo" pg
       ON pg.key = lower(btrim(c.neighborhood)) || '|' || lower(btrim(c.city)) || '|' || lower(btrim(c.state))
     WHERE c.neighborhood IS NOT NULL AND c.city IS NOT NULL AND c.state IS NOT NULL AND pg.key IS NULL`
  );
  return {
    stores: { total: Number(stores.rows[0].total), geocoded: Number(stores.rows[0].geocoded) },
    places: { total: Number(places.rows[0].total), geocoded: Number(places.rows[0].geocoded) },
    pendingPlaces: Number(pending.rows[0].pending),
  };
}

async function main() {
  await client.connect();
  console.log("[GEO] Geocodificador em background iniciado");
  console.log("[GEO] Conectado ao Postgres");

  const stats = await getStats();
  console.log(`[GEO] Status inicial: ${stats.stores.geocoded}/${stats.stores.total} lojas, ${stats.places.geocoded}/${stats.places.total} lugares, ${stats.pendingPlaces} pendentes`);

  let idleCycles = 0;
  const MAX_IDLE_BEFORE_PAUSE = 60; // após 60 ciclos sem trabalho, pausa 5 min
  const PAUSE_MS = 300000; // 5 minutos

  while (true) {
    try {
      // Prioridade: lojas primeiro
      const storesProcessed = await geocodeStores();
      const placesProcessed = await geocodeContactPlaces();
      const totalProcessed = storesProcessed + placesProcessed;

      if (totalProcessed > 0) {
        idleCycles = 0;
        if (totalProcessed % 10 === 0 || storesProcessed > 0) {
          const s = await getStats();
          console.log(`[GEO] Progresso: ${s.stores.geocoded}/${s.stores.total} lojas, ${s.places.geocoded}/${s.places.total} lugares, ${s.pendingPlaces} pendentes`);
        }
      } else {
        idleCycles++;
        if (idleCycles === 1) {
          const s = await getStats();
          console.log(`[GEO] Sem itens pendentes. ${s.stores.geocoded}/${s.stores.total} lojas, ${s.places.geocoded}/${s.places.total} lugares geocodificados.`);
        }
        if (idleCycles >= MAX_IDLE_BEFORE_PAUSE) {
          console.log(`[GEO] Pausando ${PAUSE_MS / 60000} min (sem trabalho há ${idleCycles} ciclos)...`);
          await sleep(PAUSE_MS);
          idleCycles = 0;
          console.log("[GEO] Retomando...");
        } else {
          // Verificar a cada 30s se há novos dados
          await sleep(30000);
        }
      }
    } catch (err) {
      console.error(`[GEO] Erro no ciclo: ${err.message}`);
      await sleep(5000);
    }
  }
}

main().catch((err) => {
  console.error("[GEO] Fatal:", err.message);
  process.exit(1);
});