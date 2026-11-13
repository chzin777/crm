/**
 * Pin exato da loja para a localização enviada pela IA: link do Google Maps colado no cadastro (manual) ou
 * geocodificação do endereço em nível de rua/estabelecimento (Google Geocoding, se houver chave; senão Nominatim
 * estruturado). Centro de cidade/bairro nunca vira pin. A rede entra por parâmetro (testável).
 */

export type Coordinates = { lat: number; lng: number };
export type PinSource = "manual" | "google" | "nominatim";

const valid = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

/**
 * Coordenadas de um link do Google Maps ou de "lat, lng" digitado. Prioriza o ponto do lugar (!3d…!4d…) sobre o
 * centro da tela (@lat,lng), que pode estar deslocado.
 */
export function parseMapsCoordinates(text: string | null | undefined): Coordinates | null {
  const value = decodeURIComponent((text ?? "").trim()).replace(/\s+/g, " ");
  if (!value) return null;
  const patterns = [
    /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/,
    /[?&](?:q|query|ll|destination|daddr|center)=(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/,
    /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/,
    /^(-?\d{1,2}\.\d+)\s*[,;]\s*(-?\d{1,3}\.\d+)$/,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (!match) continue;
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (valid(lat, lng)) return { lat, lng };
  }
  return null;
}

/** Link curto do app ("maps.app.goo.gl/…", "goo.gl/maps/…"): precisa seguir o redirecionamento para achar as coordenadas. */
export function isShortMapsLink(text: string) {
  return /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(text.trim());
}

/** Link com o pin vermelho cravado nas coordenadas; sem coordenadas, busca pelo endereço completo. */
export function pinMapsUrl(coords: Coordinates | null, fallback: { address: string; city?: string | null; state?: string | null }) {
  if (coords) return `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`;
  const query = ["Óticas Brasil", fallback.address, fallback.city, fallback.state].filter(Boolean).join(" ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

const ABBREVIATIONS: [RegExp, string][] = [
  [/\bAv\.?(?=\s)/gi, "Avenida"],
  [/\bR\.(?=\s)/gi, "Rua"],
  [/\bAl\.?(?=\s)/gi, "Alameda"],
  [/\bQd\.?(?=\s)/gi, "Quadra"],
  [/\bLt\.?(?=\s)/gi, "Lote"],
  [/\bPç\.?(?=\s)|\bPca\.?(?=\s)/gi, "Praça"],
  [/\bRod\.?(?=\s)/gi, "Rodovia"],
  [/\bSt\.?(?=\s)/gi, "Setor"],
];

/**
 * Endereço brasileiro limpo para o geocoder: abreviações por extenso ("Av." → "Avenida", "Qd." → "Quadra"),
 * sem "nº"/"N°" e sem complemento interno de loja ("Lj 08", "Sala 3", "Goiânia Shopping", "Box 12").
 */
export function normalizeBrAddress(address: string | null | undefined) {
  let text = (address ?? "").replace(/\s+/g, " ").trim();
  for (const [pattern, full] of ABBREVIATIONS) text = text.replace(pattern, full);
  return text
    .replace(/\b(n[º°o]\.?|n\.)\s*/gi, "")
    .replace(/[,\s-]*\b(lj|loja|sala|sl|box|bloco|piso|pavimento|quiosque|andar)\b\.?\s*[\w-]*\d[\w-]*/gi, "")
    .replace(/[,\s-]*[\p{L}\d]*\s*shopping(?![\p{L}])[\p{L}\d\s]*/giu, "")
    .replace(/\s*,\s*,/g, ",")
    .replace(/[,\s-]+$/g, "")
    .trim();
}

/** Coordenadas iguais (até ~5 m). */
export const sameCoordinates = (a: Coordinates, b: Coordinates) => Math.abs(a.lat - b.lat) < 0.00005 && Math.abs(a.lng - b.lng) < 0.00005;

/**
 * Coordenada genérica: centro de cidade/bairro conhecido (ex.: -16.6998893, -49.2625052, que o Nominatim devolve
 * para Goiânia e cai no Setor Bueno/Sul) ou o mesmo ponto já usado por outra loja de endereço diferente.
 */
export const KNOWN_CENTROIDS: Coordinates[] = [
  { lat: -16.6998893, lng: -49.2625052 },
  { lat: -16.6748672, lng: -49.2581783 },
];
export function isGenericCoordinate(coords: Coordinates, others: { coords: Coordinates; addressKey: string }[] = [], ownAddressKey = "") {
  if (KNOWN_CENTROIDS.some((centroid) => sameCoordinates(centroid, coords))) return true;
  return others.some((other) => sameCoordinates(other.coords, coords) && other.addressKey !== ownAddressKey);
}

export type NominatimResult = { lat: string; lon: string; category?: string; class?: string; type?: string; addresstype?: string; place_rank?: number; address?: Record<string, string | undefined> };

const plain = (value: string | null | undefined) => (value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
/** Bairro sem o prefixo "Setor"/"Jardim"... só para comparar ("SETOR SERRA DOURADA" ~ "Serra Dourada"). */
const placeCore = (value: string | null | undefined) => plain(value).replace(/^(SETOR|ST|BAIRRO|JARDIM|JD|VILA|VL|RESIDENCIAL|RES|PARQUE|PQ|CONJUNTO|CJ)\s+/, "");

/**
 * O resultado é da cidade da loja e, quando o OSM informa o bairro, do mesmo bairro (a mesma "Rua 95" existe em
 * vários setores; "Rua Iracema" existe em outras cidades).
 */
export function matchesStorePlace(result: NominatimResult, store: { city: string | null; neighborhood: string | null }) {
  const address = result.address;
  if (!address) return false;
  const city = plain(address.city ?? address.town ?? address.municipality ?? address.village);
  if (!city || city !== plain(store.city)) return false;
  const wanted = placeCore(store.neighborhood);
  const areas = [address.suburb, address.neighbourhood, address.quarter, address.city_district, address.residential].filter(Boolean).map(placeCore);
  if (!wanted || !areas.length) return true;
  return areas.some((area) => area === wanted || area.includes(wanted) || wanted.includes(area));
}

/**
 * Resultado aceito só em nível de rua ou estabelecimento: rejeita fronteira/área administrativa e lugares amplos
 * (cidade, bairro, setor), que devolvem apenas o centro da região.
 */
export function isPreciseNominatim(result: NominatimResult) {
  const kind = result.category ?? result.class ?? "";
  const type = result.type ?? "";
  const addressType = result.addresstype ?? "";
  if (kind === "boundary" || type === "administrative") return false;
  if (kind === "place" && /^(city|town|village|municipality|suburb|neighbourhood|quarter|city_block|hamlet|locality|county|state|region|island)$/.test(type)) return false;
  if (/^(city|town|village|municipality|suburb|neighbourhood|quarter|county|state|region|postcode)$/.test(addressType)) return false;
  // place_rank: 26+ é rua/endereço/estabelecimento; abaixo disso é bairro, cidade ou maior.
  return typeof result.place_rank !== "number" || result.place_rank >= 26;
}

export type GoogleGeocodeResult = { geometry?: { location?: { lat?: number; lng?: number }; location_type?: string }; partial_match?: boolean; types?: string[] };

/** Google Geocoding: só ROOFTOP/RANGE_INTERPOLATED (endereço) ou estabelecimento; centro geométrico/aproximado não. */
export function isPreciseGoogle(result: GoogleGeocodeResult) {
  const type = result.geometry?.location_type ?? "";
  if (type === "ROOFTOP" || type === "RANGE_INTERPOLATED") return true;
  return type === "GEOMETRIC_CENTER" && (result.types ?? []).some((item) => ["route", "establishment", "point_of_interest", "premise"].includes(item));
}

export type GeocodeStoreInput = { address: string | null; addressNumber: string | null; neighborhood: string | null; city: string | null; state: string | null };
type FetchJson = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

/**
 * Pin da loja pelo endereço: Google Geocoding com chave; senão Nominatim estruturado (street/city/state/country).
 * Devolve null quando só acha o centro da cidade/bairro (nada é salvo nesse caso).
 */
export async function geocodeStoreAddress(store: GeocodeStoreInput, deps: { fetch: FetchJson; googleKey?: string | null; timeoutMs?: number }): Promise<(Coordinates & { source: PinSource }) | null> {
  const street = normalizeBrAddress(store.address);
  if (!street || !store.city) return null;
  const number = store.addressNumber && !/^s\/?n$/i.test(store.addressNumber.trim()) ? normalizeBrAddress(store.addressNumber) : "";
  const city = titleCity(store.city);
  const state = store.state?.trim().toUpperCase() || "GO";
  const signal = () => AbortSignal.timeout(deps.timeoutMs ?? 6000);
  if (deps.googleKey) {
    const address = [[street, number].filter(Boolean).join(", "), store.neighborhood, `${city} - ${state}`, "Brasil"].filter(Boolean).join(", ");
    const response = await deps.fetch(`https://maps.googleapis.com/maps/api/geocode/json?${new URLSearchParams({ address, region: "br", language: "pt-BR", key: deps.googleKey })}`, { headers: {}, signal: signal() });
    if (response.ok) {
      const body = (await response.json()) as { results?: GoogleGeocodeResult[] };
      const best = (body.results ?? []).find(isPreciseGoogle);
      const lat = best?.geometry?.location?.lat;
      const lng = best?.geometry?.location?.lng;
      if (typeof lat === "number" && typeof lng === "number" && valid(lat, lng)) return { lat, lng, source: "google" };
    }
  }
  // Estruturada (rua/cidade/UF) e, se preciso, texto livre com o bairro; só vale resultado de rua na cidade/bairro da loja.
  const queries = [
    new URLSearchParams({ format: "jsonv2", addressdetails: "1", limit: "5", countrycodes: "br", country: "Brazil", city, state: STATE_NAMES[state] ?? state, street: [number, street].filter(Boolean).join(" ") }),
    new URLSearchParams({ format: "jsonv2", addressdetails: "1", limit: "5", countrycodes: "br", q: [[street, number].filter(Boolean).join(", "), store.neighborhood, city, STATE_NAMES[state] ?? state, "Brasil"].filter(Boolean).join(", ") }),
  ];
  let best: NominatimResult | undefined;
  for (const params of queries) {
    const response = await deps.fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { "User-Agent": "oticas-brasil-crm/1.0", "Accept-Language": "pt-BR" }, signal: signal() });
    if (!response.ok) continue;
    const results = (await response.json()) as NominatimResult[];
    best = (Array.isArray(results) ? results : []).find((result) => isPreciseNominatim(result) && matchesStorePlace(result, { city: store.city, neighborhood: store.neighborhood }));
    if (best) break;
  }
  if (!best) return null;
  const lat = Number(best.lat);
  const lng = Number(best.lon);
  return valid(lat, lng) ? { lat, lng, source: "nominatim" } : null;
}

const STATE_NAMES: Record<string, string> = { GO: "Goiás", DF: "Distrito Federal", TO: "Tocantins", MT: "Mato Grosso", MG: "Minas Gerais", SP: "São Paulo", BA: "Bahia", PA: "Pará", MA: "Maranhão" };
const titleCity = (city: string) => city.trim().toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, space: string, letter: string) => space + letter.toUpperCase()).replace(/\bGoiania\b/, "Goiânia").replace(/\bBrasilia\b/, "Brasília").replace(/\bDe\b/g, "de");
