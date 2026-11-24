/**
 * Loja mais próxima (puro): distância real (Haversine) entre o cliente e as lojas ativas.
 * Origem: pin de localização do WhatsApp (link do Maps com coordenadas) ou bairro/região citado no texto (centro
 * aproximado do bairro). Loja sem pin cadastrado usa o centro do bairro dela. Sem origem conhecida, não há "loja mais
 * próxima": a IA pede o bairro ou a localização.
 */
import { parseMapsCoordinates, type Coordinates } from "@/lib/ai/store-geolocation";
import type { StoreInfo } from "@/lib/ai/stock";

export function haversineKm(a: Coordinates, b: Coordinates) {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const plainText = (value: string | null | undefined) => (value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
const PREFIX = /^(SETOR|ST|BAIRRO|JARDIM|JD|VILA|VL|RESIDENCIAL|RES|PARQUE|PQ|CONJUNTO|CJ|CIDADE)\s+/;
const core = (value: string | null | undefined) => plainText(value).replace(PREFIX, "");

type Place = { names: string[]; city: "GOIANIA" | "APARECIDA DE GOIANIA"; lat: number; lng: number };

/**
 * Centro aproximado de bairros/regiões de Goiânia e Aparecida de Goiânia (referência para ordenar lojas por distância;
 * o pin exato da loja, quando cadastrado, sempre vale mais). Nomes sem acento, com e sem o prefixo do bairro.
 */
export const PLACES: Place[] = [
  // Goiânia
  { names: ["SETOR CENTRAL", "CENTRO DE GOIANIA", "CENTRO"], city: "GOIANIA", lat: -16.6799, lng: -49.255 },
  { names: ["SETOR OESTE"], city: "GOIANIA", lat: -16.68, lng: -49.27 },
  { names: ["SETOR SUL"], city: "GOIANIA", lat: -16.693, lng: -49.256 },
  { names: ["SETOR MARISTA", "MARISTA"], city: "GOIANIA", lat: -16.699, lng: -49.262 },
  { names: ["SETOR BUENO", "BUENO"], city: "GOIANIA", lat: -16.705, lng: -49.273 },
  { names: ["JARDIM GOIAS", "FLAMBOYANT"], city: "GOIANIA", lat: -16.706, lng: -49.2385 },
  { names: ["SETOR LESTE VILA NOVA", "VILA NOVA"], city: "GOIANIA", lat: -16.672, lng: -49.239 },
  { names: ["SETOR LESTE UNIVERSITARIO", "SETOR UNIVERSITARIO", "UNIVERSITARIO"], city: "GOIANIA", lat: -16.681, lng: -49.241 },
  { names: ["SETOR CAMPINAS", "CAMPINAS"], city: "GOIANIA", lat: -16.671, lng: -49.286 },
  { names: ["SETOR AEROPORTO"], city: "GOIANIA", lat: -16.672, lng: -49.268 },
  { names: ["SETOR DOS FUNCIONARIOS", "FUNCIONARIOS"], city: "GOIANIA", lat: -16.662, lng: -49.273 },
  { names: ["SETOR NORTE FERROVIARIO", "NORTE FERROVIARIO", "RUA 44", "REGIAO DA 44"], city: "GOIANIA", lat: -16.659, lng: -49.26 },
  { names: ["AEROVIARIO", "SETOR AEROVIARIO"], city: "GOIANIA", lat: -16.663, lng: -49.299 },
  { names: ["CAPUAVA", "SETOR CAPUAVA"], city: "GOIANIA", lat: -16.656, lng: -49.32 },
  { names: ["FAZENDA CAVEIRAS", "PERIMETRAL NORTE"], city: "GOIANIA", lat: -16.646, lng: -49.31 },
  { names: ["CIDADE JARDIM"], city: "GOIANIA", lat: -16.687, lng: -49.302 },
  { names: ["SETOR COIMBRA", "COIMBRA"], city: "GOIANIA", lat: -16.68, lng: -49.287 },
  { names: ["NOVA SUICA"], city: "GOIANIA", lat: -16.7, lng: -49.283 },
  { names: ["JARDIM AMERICA"], city: "GOIANIA", lat: -16.715, lng: -49.29 },
  { names: ["PARQUE AMAZONIA", "AMAZONIA"], city: "GOIANIA", lat: -16.727, lng: -49.281 },
  { names: ["SETOR PEDRO LUDOVICO", "PEDRO LUDOVICO"], city: "GOIANIA", lat: -16.714, lng: -49.253 },
  { names: ["ALTO DA GLORIA"], city: "GOIANIA", lat: -16.706, lng: -49.244 },
  { names: ["VILA REDENCAO", "REDENCAO"], city: "GOIANIA", lat: -16.718, lng: -49.246 },
  { names: ["PARQUE ATHENEU", "ATHENEU"], city: "GOIANIA", lat: -16.702, lng: -49.222 },
  { names: ["JARDIM NOVO MUNDO", "NOVO MUNDO"], city: "GOIANIA", lat: -16.68, lng: -49.213 },
  { names: ["JARDIM EUROPA"], city: "GOIANIA", lat: -16.718, lng: -49.307 },
  { names: ["NOVO HORIZONTE"], city: "GOIANIA", lat: -16.715, lng: -49.305 },
  { names: ["JARDIM ATLANTICO", "ATLANTICO"], city: "GOIANIA", lat: -16.74, lng: -49.292 },
  { names: ["FAICALVILLE", "FAISALVILLE"], city: "GOIANIA", lat: -16.747, lng: -49.311 },
  { names: ["VERA CRUZ"], city: "GOIANIA", lat: -16.66, lng: -49.35 },
  { names: ["JARDIM CURITIBA", "CURITIBA"], city: "GOIANIA", lat: -16.61, lng: -49.33 },
  { names: ["GOIANIA 2", "GOIANIA II"], city: "GOIANIA", lat: -16.64, lng: -49.23 },
  { names: ["JARDIM GUANABARA", "GUANABARA"], city: "GOIANIA", lat: -16.626, lng: -49.255 },
  { names: ["JARDIM LISBOA", "AVENIDA DOS IPES"], city: "GOIANIA", lat: -16.7, lng: -49.335 },
  // Regiões de Goiânia
  { names: ["REGIAO NOROESTE"], city: "GOIANIA", lat: -16.62, lng: -49.34 },
  { names: ["REGIAO NORTE"], city: "GOIANIA", lat: -16.64, lng: -49.29 },
  { names: ["REGIAO LESTE"], city: "GOIANIA", lat: -16.68, lng: -49.22 },
  { names: ["REGIAO OESTE"], city: "GOIANIA", lat: -16.69, lng: -49.32 },
  { names: ["REGIAO SUDOESTE"], city: "GOIANIA", lat: -16.735, lng: -49.305 },
  // Aparecida de Goiânia
  { names: ["GARAVELO", "SETOR GARAVELO", "JARDIM GARAVELO", "RESIDENCIAL GARAVELO", "GARAVELO PARK", "GARAVELLO"], city: "APARECIDA DE GOIANIA", lat: -16.776, lng: -49.323 },
  { names: ["PAPILLON PARK", "PAPILLON"], city: "APARECIDA DE GOIANIA", lat: -16.79, lng: -49.317 },
  { names: ["JARDIM NOVA ERA", "NOVA ERA"], city: "APARECIDA DE GOIANIA", lat: -16.765, lng: -49.3 },
  { names: ["VILA BRASILIA"], city: "APARECIDA DE GOIANIA", lat: -16.76, lng: -49.27 },
  { names: ["BURITI SHOPPING", "VILA SAO TOMAZ", "SAO TOMAZ"], city: "APARECIDA DE GOIANIA", lat: -16.751, lng: -49.287 },
  { names: ["BURITI SERENO"], city: "APARECIDA DE GOIANIA", lat: -16.795, lng: -49.295 },
  { names: ["JARDIM TIRADENTES", "TIRADENTES"], city: "APARECIDA DE GOIANIA", lat: -16.81, lng: -49.285 },
  { names: ["SETOR SERRA DOURADA", "SERRA DOURADA", "APARECIDA SHOPPING"], city: "APARECIDA DE GOIANIA", lat: -16.8234, lng: -49.2618 },
  { names: ["CENTRO DE APARECIDA", "SETOR CENTRAL APARECIDA", "SETOR CENTRAL"], city: "APARECIDA DE GOIANIA", lat: -16.823, lng: -49.244 },
];

const PLACE_INDEX = PLACES.flatMap((place) => place.names.map((name) => ({ name: plainText(name), place }))).sort((a, b) => b.name.length - a.name.length);

const containsWords = (hay: string, needle: string) => needle.length > 0 && ` ${hay} `.includes(` ${needle} `);

/** Bairro/região citado no texto ("região do Garavelo", "moro no Jd. Nova Era"). "Centro" sozinho só com a palavra inteira. */
export function placeFromText(text: string, cityHint?: string | null): Place | null {
  const hay = plainText(text).replace(/\bJD\b/g, "JARDIM").replace(/\bST\b/g, "SETOR").replace(/\bPQ\b/g, "PARQUE").replace(/\bRES\b/g, "RESIDENCIAL");
  const hint = plainText(cityHint);
  const hits = PLACE_INDEX.filter((entry) => containsWords(hay, entry.name));
  if (!hits.length) return null;
  // "Setor Central" existe em Goiânia e Aparecida: a cidade citada (ou conhecida) decide.
  const aparecida = /\bAPARECIDA\b/.test(hay) || hint.includes("APARECIDA");
  const best = hits.find((entry) => (aparecida ? entry.place.city === "APARECIDA DE GOIANIA" : true)) ?? hits[0];
  if (best.name === "CENTRO" && aparecida) return PLACES.find((place) => place.names.includes("CENTRO DE APARECIDA")) ?? best.place;
  return best.place;
}

/** Pin enviado pelo WhatsApp (o texto da mensagem traz o link do Maps com as coordenadas). */
export function coordinatesFromText(text: string): Coordinates | null {
  return parseMapsCoordinates(text);
}

const validCoords = (store: StoreInfo) => typeof store.lat === "number" && typeof store.lng === "number" && Number.isFinite(store.lat) && Number.isFinite(store.lng) && !(store.lat === 0 && store.lng === 0);

/** Coordenada da loja: pin cadastrado ou, sem ele, o centro aproximado do bairro dela. */
export function storeCoordinates(store: StoreInfo): (Coordinates & { approximate: boolean }) | null {
  if (validCoords(store)) return { lat: store.lat!, lng: store.lng!, approximate: false };
  const city = plainText(store.city);
  const neighborhood = core(store.neighborhood);
  if (!neighborhood) return null;
  const place = PLACES.find((item) => plainText(item.city) === city && item.names.some((name) => core(name) === neighborhood));
  return place ? { lat: place.lat, lng: place.lng, approximate: true } : null;
}

export type NearbyStore = { code: string; store: StoreInfo; km: number };
export type NearbyResult =
  | { kind: "pin" | "bairro" | "regiao"; origin: string; stores: NearbyStore[] }
  | { kind: "sem_local" };

/** Mesma loja cadastrada duas vezes (mesmo endereço): fica a primeira. */
const sameAddress = (a: StoreInfo, b: StoreInfo) => plainText(`${a.address} ${a.addressNumber} ${a.city}`) === plainText(`${b.address} ${b.addressNumber} ${b.city}`);

/** Lojas ordenadas pela distância; a 2ª opção só entra se estiver quase tão perto (até +3 km ou 1,5x). */
export function nearestStores(origin: Coordinates, directory: Map<string, StoreInfo>, max = 2): NearbyStore[] {
  const ranked: NearbyStore[] = [];
  for (const [code, store] of directory) {
    const coords = storeCoordinates(store);
    if (!coords) continue;
    ranked.push({ code, store, km: Math.round(haversineKm(origin, coords) * 10) / 10 });
  }
  ranked.sort((a, b) => a.km - b.km || Number(a.code) - Number(b.code));
  const picked: NearbyStore[] = [];
  for (const item of ranked) {
    if (picked.some((other) => sameAddress(other.store, item.store))) continue;
    if (picked.length && item.km > Math.max(picked[0].km + 3, picked[0].km * 1.5)) break;
    picked.push(item);
    if (picked.length >= max) break;
  }
  return picked;
}

/**
 * Resolve a loja mais próxima: pin do cliente → distância real; bairro com loja → as lojas do bairro; bairro/região
 * sem loja → distância do centro do bairro. Sem pin nem bairro conhecido → "sem_local" (a IA pergunta).
 */
export function findNearbyStores(input: { texts: string[]; cityHint?: string | null }, directory: Map<string, StoreInfo>): NearbyResult {
  for (const text of input.texts) {
    const coords = coordinatesFromText(text);
    if (coords) return { kind: "pin", origin: "localização enviada pelo cliente", stores: nearestStores(coords, directory) };
  }
  for (const text of input.texts) {
    const place = placeFromText(text, input.cityHint);
    if (!place) continue;
    const names = new Set(place.names.map(core));
    const inPlace = [...directory].filter(([, store]) => plainText(store.city) === plainText(place.city) && names.has(core(store.neighborhood)));
    const origin = place.names[0].toLowerCase();
    if (inPlace.length) {
      const stores = nearestStores(place, new Map(inPlace));
      if (stores.length) return { kind: "bairro", origin, stores };
    }
    return { kind: "regiao", origin, stores: nearestStores(place, directory) };
  }
  return { kind: "sem_local" };
}

/** "Tem loja perto de mim?", "qual a unidade mais próxima", "loja aqui perto". */
export function asksNearestStore(text: string) {
  const plain = plainText(text);
  return /\b(PERTO DE MIM|AQUI PERTO|MAIS PERTO|MAIS PROXIMA|MAIS PROXIMO|PROXIMA DE MIM|PROXIMO DE MIM|PERTO DA MINHA CASA|PERTO DE CASA|PERTO DO MEU TRABALHO)\b/.test(plain)
    || /\b(LOJA|LOJAS|UNIDADE|UNIDADES|OTICA|OTICAS|FILIAL)\b.*\b(PERTO|PROXIM\w*|NA REGIAO|NO MEU BAIRRO|POR AQUI)\b/.test(plain)
    || /\b(PERTO|PROXIM\w*)\b.*\b(LOJA|UNIDADE|OTICA|FILIAL)\b/.test(plain);
}

/** "Quero na região do Garavelo", "moro no Setor Bueno", "fico perto do Buriti": a origem chegando no texto. */
export function mentionsPlace(text: string, cityHint?: string | null) {
  return !!coordinatesFromText(text) || (!!placeFromText(text, cityHint) && /\b(REGIAO|BAIRRO|SETOR|JARDIM|MORO|FICO|ESTOU|TO NO|TO NA|PERTO|PROXIM\w*|NO|NA|DO|DA)\b/.test(plainText(text)));
}

const storeLine = (item: NearbyStore) => {
  const address = [item.store.address, item.store.addressNumber && !/^S\/?N$/i.test(item.store.addressNumber) ? item.store.addressNumber : "", item.store.neighborhood, item.store.city].filter(Boolean).join(", ");
  return `• ${item.store.name.replace(/^LJ\s*\d+\S*\s*/i, `Loja ${item.code} `).trim()} — ${address} (cerca de ${item.km.toLocaleString("pt-BR")} km)`;
};

/** Bloco do prompt: lojas calculadas (usar exatamente) ou pedido de bairro/localização (nunca chutar loja). */
export function nearbyStoreBlock(result: NearbyResult, options: { knownPlace?: string | null } = {}) {
  if (result.kind === "sem_local" || !result.stores.length) {
    return [
      "LOJA MAIS PRÓXIMA (regra fixa): o cliente ainda NÃO informou onde está (nem bairro, nem setor, nem localização) nesta conversa.",
      "NÃO afirme qual é a loja mais próxima e não cite nenhuma unidade como \"a mais perto\". Peça, com naturalidade e numa frase curta, o bairro/setor onde ele está ou que envie a localização pelo WhatsApp (clipe > Localização).",
      options.knownPlace ? `No cadastro consta ${options.knownPlace}: você pode perguntar se ele ainda está por essa região, sem cravar a unidade antes da confirmação.` : "",
    ].filter(Boolean).join("\n");
  }
  if (result.stores[0].km > 60) {
    return `LOJA MAIS PRÓXIMA: não há loja da rede a menos de 60 km de ${result.kind === "pin" ? "onde o cliente está" : result.origin} (a mais perto fica a cerca de ${Math.round(result.stores[0].km)} km). Diga isso com transparência e pergunte a cidade; não afirme uma loja como "perto".`;
  }
  const how = result.kind === "pin" ? "pela localização enviada" : result.kind === "bairro" ? `no bairro ${result.origin}` : `mais perto de ${result.origin} (não há loja nesse bairro)`;
  return [
    `LOJA MAIS PRÓXIMA (calculada pelo sistema pela distância real, ${how}). Indique exatamente esta(s), nesta ordem, sem trocar por outra unidade:`,
    ...result.stores.map(storeLine),
    "Não cite lojas de outros bairros como mais próximas. A distância é aproximada: pode dizer \"fica a cerca de X km\".",
  ].join("\n");
}

/**
 * Turno da IA: pedido de loja perto (ou bairro/pin chegando logo depois desse pedido) → bloco do prompt com a loja
 * calculada ou a ordem de pedir o bairro/localização. Fora desse assunto, nada.
 */
export function nearbyStorePrompt(input: { customerText: string; earlierCustomerTexts: string[]; cityHint?: string | null; knownPlace?: string | null; directory: Map<string, StoreInfo> }) {
  const recentAsk = input.earlierCustomerTexts.slice(0, 4).some(asksNearestStore);
  const asked = asksNearestStore(input.customerText) || !!coordinatesFromText(input.customerText) || (recentAsk && mentionsPlace(input.customerText, input.cityHint));
  if (!asked) return "";
  const result = findNearbyStores({ texts: [input.customerText, ...input.earlierCustomerTexts.slice(0, 6)], cityHint: input.cityHint }, input.directory);
  return nearbyStoreBlock(result, { knownPlace: input.knownPlace });
}
