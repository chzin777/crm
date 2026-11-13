import { pinMapsUrl } from "@/lib/ai/store-geolocation";
import { matchesRegion, storeLabel, titleCase, type StoreInfo } from "@/lib/ai/stock";

/**
 * Localização da loja (tool enviarLocalizacaoLoja): pin nativo do WhatsApp quando a loja tem latitude/longitude
 * no cadastro; senão, link direto do Google Maps pelo endereço. Sem banco nem rede.
 */

export type StoreLocation = {
  code: string;
  nome: string;
  endereco: string;
  latitude: number | null;
  longitude: number | null;
  mapsUrl: string;
  /** true = sai como mensagem de localização (pin) no WhatsApp; false = link do Google Maps no texto. */
  pinNativo: boolean;
};

const hasCoords = (store: StoreInfo) => typeof store.lat === "number" && typeof store.lng === "number" && Number.isFinite(store.lat) && Number.isFinite(store.lng) && !(store.lat === 0 && store.lng === 0);

/** Endereço completo para o mapa: rua, número, bairro, cidade. */
export function fullAddress(store: StoreInfo) {
  const number = store.addressNumber && !/^s\/?n$/i.test(store.addressNumber.trim()) ? store.addressNumber.trim() : "";
  return [[store.address?.trim(), number].filter(Boolean).join(", "), store.neighborhood?.trim(), store.city?.trim()].filter(Boolean).join(" - ");
}

/** Link do Google Maps: pelas coordenadas quando houver; senão pelo endereço (busca). */
export function googleMapsUrl(store: StoreInfo) {
  // Com pin: ?query=lat,lng crava o pin vermelho; sem pin: busca pelo endereço completo com cidade e UF.
  const number = store.addressNumber && !/^s\/?n$/i.test(store.addressNumber.trim()) ? store.addressNumber.trim() : "";
  const address = [[store.address?.trim(), number].filter(Boolean).join(", "), store.neighborhood?.trim()].filter(Boolean).join(" - ");
  return pinMapsUrl(hasCoords(store) ? { lat: store.lat!, lng: store.lng! } : null, { address, city: store.city, state: store.state || "GO" });
}

export function storeLocation(code: string, store: StoreInfo): StoreLocation {
  const label = storeLabel(code, store);
  const [nome, endereco] = label.split(" — ");
  const pin = hasCoords(store);
  return {
    code,
    nome: `Óticas Brasil - ${nome}`,
    endereco: endereco ?? fullAddress(store),
    latitude: pin ? store.lat! : null,
    longitude: pin ? store.lng! : null,
    mapsUrl: googleMapsUrl(store),
    pinNativo: pin,
  };
}

/** Loja pedida pelo cliente ("Setor Bueno", "loja 17", "Marista"): todas as que casam (a IA pede para escolher se houver mais de uma). */
export function findStores(stores: Map<string, StoreInfo>, wanted: string) {
  const found: { code: string; store: StoreInfo }[] = [];
  for (const [code, store] of stores) if (matchesRegion(code, store, wanted)) found.push({ code, store });
  return found;
}

/** Corpo da mensagem nativa de localização da WhatsApp Cloud API. */
export function locationPayload(to: string, location: StoreLocation) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "location",
    location: { latitude: location.latitude, longitude: location.longitude, name: location.nome, address: location.endereco },
  };
}

/** Texto da localização (registro no chat e fallback sem coordenadas): nome, endereço e link do Maps. */
export function locationText(location: StoreLocation) {
  return `📍 *${location.nome}*\n${location.endereco}\n${location.mapsUrl}`;
}

/**
 * Envio da localização: pin nativo quando há coordenadas; sem coordenadas (ou se o pin falhar), o link clicável
 * do Google Maps com o endereço. Nunca só o endereço em texto seco.
 */
export async function deliverLocation(location: StoreLocation, deps: { sendPin: () => Promise<unknown>; sendText: (text: string) => Promise<unknown> }) {
  if (location.pinNativo) {
    try {
      await deps.sendPin();
      return "pin" as const;
    } catch {
      // Pin recusado pela Meta: segue com o link.
    }
  }
  await deps.sendText(locationText(location));
  return "link" as const;
}

export const LOCATION_TOOL = {
  type: "function" as const,
  function: {
    name: "enviarLocalizacaoLoja",
    description: "Envia ao cliente a localização da loja no mapa (pin do WhatsApp ou link do Google Maps), logo depois da sua resposta. Use quando o cliente pedir localização, mapa, como chegar ou onde fica uma loja.",
    parameters: {
      type: "object",
      properties: {
        nomeLoja: { type: "string", description: "Loja citada na conversa: bairro, nome ou número, ex.: \"Setor Bueno\", \"LJ 17\"." },
      },
      required: ["nomeLoja"],
      additionalProperties: false,
    },
  },
};

/** Regra fixa do prompt: pedido de localização vira pin/link de verdade. */
export const LOCATION_RULES = [
  "LOCALIZAÇÃO (regra fixa): quando o cliente pedir a localização, o mapa, como chegar ou onde fica a loja, chame enviarLocalizacaoLoja com a loja da conversa. A localização (pin no mapa ou link do Google Maps) é enviada automaticamente logo depois da sua resposta.",
  "Nesse caso responda curto, sem repetir o endereço inteiro (ex.: \"Claro! Te mandei a localização da *Loja Setor Bueno* aqui embaixo 👇\"). Se a ferramenta devolver mais de uma loja possível, pergunte qual delas listando cada opção com o endereço completo exatamente como veio em lojasPossiveis (ex.: \"• *Loja Setor Sul* — Rua 95\" e \"• *Loja Setor Sul* — Rua 90, 118\"). Nunca diga que não consegue mandar a localização.",
  "NUNCA pergunte \"Qual dessas unidades você quer?\" listando nomes iguais sem endereço. Se o cliente disser \"essa loja\" (ou \"dessa loja do setor X\") referindo-se à unidade que você acabou de informar, chame enviarLocalizacaoLoja com o nome e o endereço dessa unidade (ex.: \"Setor Sul Rua 95\") e envie direto, sem pedir confirmação.",
].join("\n");

/** Endereço comparável: sem acento/caixa, "Avenida"→"AV", "Rua"→"R", sem "nº"/"número" e sem pontuação. */
export function addressKey(store: StoreInfo) {
  // Sem rua no cadastro não há como comparar (só a cidade não identifica a unidade).
  if (!store.address?.trim()) return "";
  const number = store.addressNumber && !/^s\/?n$/i.test(store.addressNumber.trim()) ? store.addressNumber : "";
  return [store.address, number, store.city]
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\bAVENIDA\b|\bAV\b\.?/g, " AV ")
    .replace(/\bRUA\b|\bR\b\.?/g, " R ")
    .replace(/\b(N[º°O]?|NUMERO|NRO)\b\.?/g, " ")
    .replace(/[º°]/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

/** Distância em metros entre duas lojas com coordenadas (Infinity se faltar alguma). */
export function distanceMeters(a: StoreInfo, b: StoreInfo) {
  if (!hasCoords(a) || !hasCoords(b)) return Infinity;
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat! - a.lat!);
  const dLng = rad(b.lng! - a.lng!);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat!)) * Math.cos(rad(b.lat!)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/** Mesma unidade física: mesmo endereço normalizado ou coordenadas a menos de 50 m. */
export function sameStorePlace(a: StoreInfo, b: StoreInfo) {
  const keyA = addressKey(a);
  return (!!keyA && keyA === addressKey(b)) || distanceMeters(a, b) < 50;
}

/** Filiais do ERP no mesmo endereço físico viram uma unidade só (fica a primeira). */
export function dedupeStores<T extends { code: string; store: StoreInfo }>(matches: T[]) {
  const unique: T[] = [];
  for (const match of matches) if (!unique.some((kept) => sameStorePlace(kept.store, match.store))) unique.push(match);
  return unique;
}

/** Palavras comparáveis: sem acento/caixa, "Avenida"/"Av." → AV, "Rua"/"R." → R, sem "nº". */
const tokens = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().split(" ")
  .map((word) => (word === "AVENIDA" ? "AV" : word === "RUA" ? "R" : word)).filter((word) => word && !["N", "NO", "NUMERO", "NRO"].includes(word));

/** A rua da loja (com o número da via, ex.: "Rua 95") aparece em sequência no texto. */
export function citesStreet(text: string, store: StoreInfo) {
  const street = tokens(titleCase(store.address ?? ""));
  if (street.length < 2) return false;
  const hay = tokens(text);
  for (let index = 0; index + street.length <= hay.length; index += 1) if (street.every((word, offset) => hay[index + offset] === word)) return true;
  return false;
}

/** Palavras de ruído no pedido de loja: prefixos, artigos, pronomes e o resto da frase do cliente. */
const STORE_NOISE = new Set([
  "loja", "lojas", "lj", "unidade", "unidades", "filial", "filiais", "oticas", "otica", "essa", "esse", "dessa", "desse", "nessa", "nesse", "esta", "este", "desta", "deste",
  "nesta", "aquela", "daquela", "da", "do", "de", "das", "dos", "a", "o", "as", "os", "na", "no", "em", "ai", "pra", "para", "eu", "me", "manda", "mandar", "envia", "enviar", "localizacao",
  "endereco", "mapa", "onde", "fica", "por", "favor", "pf", "pfv", "qual", "que", "e", "comprar", "ele", "ela", "la", "aqui", "voce", "vc", "poderia", "pode", "the",
]);

/**
 * Pedido de loja comparável: sem acento, minúsculo, sem pontuação e sem ruído ("Óticas Brasil", "loja", "dessa", "do").
 * "essa loja do jardim goias" → "jardim goias" (bate com "Loja Jardim Goiás", "Jardim Goias", "Filial Jardim Goiás").
 */
export function normalizeStoreQuery(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\boticas\s+brasil\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim()
    .split(" ").filter((word) => word && !STORE_NOISE.has(word)).join(" ");
}

/** Sequência de palavras contida em outra (palavras inteiras). */
function containsWords(hay: string, needle: string) {
  if (!needle) return false;
  return ` ${hay} `.includes(` ${needle} `);
}

/** O pedido cita a loja: o nome (bairro) aparece inteiro no pedido, ou o pedido inteiro aparece no nome/endereço da loja. */
export function storeQueryMatches(query: string, name: string, extra = "") {
  const wanted = normalizeStoreQuery(query);
  const own = normalizeStoreQuery(name);
  if (!wanted || !own) return false;
  return containsWords(wanted, own) || containsWords(`${own} ${normalizeStoreQuery(extra)}`, wanted);
}

/** Pedido casa só pelo nome da unidade ou bairro (sem olhar endereço nem cidade). */
export function storeNameMatches(query: string, store: StoreInfo) {
  const wanted = normalizeStoreQuery(query);
  if (!wanted) return false;
  return [store.neighborhood ?? "", erpUnitPlace(store.name)].some((name) => {
    const own = normalizeStoreQuery(name);
    return !!own && (containsWords(wanted, own) || (wanted.length >= 4 && containsWords(own, wanted)));
  });
}

/** Nome da filial no ERP sem código, razão social nem sufixos ("LJ 39-ZVC FLAMBOYANT SAULO ... LTDA" → "Flamboyant Saulo ..."). */
export function erpUnitPlace(name: string) {
  return titleCase(name.replace(/\bLJ\s*\d+\b(-\w+)?/gi, " ").replace(/\b(LTDA|EIRELI|ME|EPP|S\/?A|IND|COM|DE|LENTES|UNILENTES|OPTICA|OTICA|ÓTICA|BRASIL)\b\.?/gi, " ").replace(/[()]/g, " ").replace(/\s+/g, " ").trim());
}

/** Loja citada pela IA nesta sessão (ficha do estoque, texto livre ou localização), com o endereço exato que foi exibido. */
export type SessionStore = { nome: string; cidade: string | null; enderecoCompleto: string };
export type StoreSource = "session" | "crm" | "erp";
export type StoreRequestResult =
  | { type: "found"; source: StoreSource; code: string; store: StoreInfo }
  | { type: "ambiguous"; options: string[] }
  | { type: "none" };

/** Loja só com o endereço exibido na conversa (sem cadastro no CRM): vira StoreInfo para o pin/link do Maps. */
export function sessionStoreInfo(store: SessionStore): StoreInfo {
  return { name: store.nome, address: store.enderecoCompleto, addressNumber: null, neighborhood: store.nome.replace(/^Loja\s+/i, ""), city: store.cidade, state: "GO" };
}

/** Resposta da IA dizendo que não achou a loja ou pedindo para escolher: trocada pelo envio da localização resolvida. */
export const STORE_MISS_REPLY = /n[aã]o\s+(identifiquei|encontrei|localizei|achei)|n[aã]o\s+consegui\s+(identificar|encontrar|localizar)|qual\s+(delas|dessas|unidade|loja)/i;

const STREET_IN_TEXT = /\b(Rua|R\.|Avenida|Av\.?|Alameda|Al\.|Rodovia|Pra[cç]a|Quadra|Qd\.?)\s+[^\n()]*\d[^\n()]*/i;

/**
 * Loja pedida para localização, em cascata: (1) lojas citadas na sessão atual (endereço exato já exibido),
 * (2) cadastro de lojas do CRM (nome, bairro e endereço sem acento), (3) filiais do ERP vistas no estoque.
 * Com endereço conhecido nunca devolve "none". queries: o que a IA pediu e a mensagem do cliente.
 */
export function resolveStoreRequest(input: { queries: string[]; sessionStores: SessionStore[]; directory: Map<string, StoreInfo>; erpUnits?: Map<string, string>; recentAiTexts?: string[] }): StoreRequestResult {
  const queries = input.queries.map((query) => query.slice(0, 200)).filter((query) => normalizeStoreQuery(query));
  const entries = [...input.directory].map(([code, store]) => ({ code, store }));
  const inCrm = (text: string) => {
    const exact = dedupeStores(entries.filter((item) => citesAddress(text, item.store)));
    return exact.length === 1 ? exact[0] : null;
  };

  // 1) Sessão atual: a loja que a IA acabou de listar, com o endereço que ela mostrou.
  for (const query of queries) {
    const distinct = input.sessionStores.filter((store, index, list) => list.findIndex((other) => normalizeStoreQuery(other.enderecoCompleto) === normalizeStoreQuery(store.enderecoCompleto)) === index);
    // Nome/bairro da loja primeiro; o endereço só entra se nenhum nome casar ("jardim goias" nunca casa a Nova Era pelo endereço).
    const byName = distinct.filter((store) => storeQueryMatches(query, store.nome));
    const hits = byName.length ? byName : distinct.filter((store) => storeQueryMatches(query, store.nome, store.enderecoCompleto));
    const numbered = hits.length > 1 ? hits.filter((store) => containsWords(normalizeStoreQuery(query), normalizeStoreQuery(store.enderecoCompleto))) : hits;
    if (numbered.length === 1) {
      const crm = inCrm(`${numbered[0].nome} ${numbered[0].enderecoCompleto}`);
      return crm ? { type: "found", source: "crm", code: crm.code, store: crm.store } : { type: "found", source: "session", code: "", store: sessionStoreInfo(numbered[0]) };
    }
    if (hits.length > 1) return { type: "ambiguous", options: hits.slice(0, 5).map((store) => `${store.nome} — ${store.enderecoCompleto}`) };
  }

  // 2) Cadastro do CRM: bairro, cidade, rua, nome da loja/filial ou "LJ 36", sem acento nem prefixo.
  for (const query of queries) {
    const normalized = normalizeStoreQuery(query);
    const number = query.match(/\b(?:lj|loja)\s*0*(\d{1,3})\b/i)?.[1];
    const named = entries.filter(({ code, store }) => (number ? code === number : false) || storeNameMatches(query, store));
    const matches = named.length ? named : entries.filter(({ code, store }) => (number ? code === number : false)
      || storeQueryMatches(query, store.neighborhood ?? "", [store.city, store.address, erpUnitPlace(store.name)].filter(Boolean).join(" "))
      || (normalized.length >= 4 && containsWords(normalizeStoreQuery(erpUnitPlace(store.name)), normalized)));
    if (!matches.length) continue;
    const resolved = resolveStoreMatch(matches, { wanted: number ? `LJ ${number}` : query, recentAiTexts: [query, ...(input.recentAiTexts ?? [])] });
    if (resolved.type === "found") return { type: "found", source: "crm", code: resolved.match.code, store: resolved.match.store };
    if (resolved.type === "ambiguous") return resolved;
  }

  // 3) Filiais do ERP (VMSet) sem cadastro no CRM: pelo nome da filial ou "LJ 36".
  for (const query of queries) {
    const normalized = normalizeStoreQuery(query);
    const number = query.match(/\b(?:lj|loja)\s*0*(\d{1,3})\b/i)?.[1];
    const hits = [...(input.erpUnits ?? new Map<string, string>())].filter(([code, name]) => !input.directory.has(code)
      && ((number && code.replace(/^0+/, "") === number) || (normalized.length >= 4 && (storeQueryMatches(query, erpUnitPlace(name)) || containsWords(normalizeStoreQuery(erpUnitPlace(name)), normalized)))));
    if (hits.length === 1) {
      const [code, name] = hits[0];
      return { type: "found", source: "erp", code, store: { name, address: null, addressNumber: null, neighborhood: erpUnitPlace(name) || `Loja ${code}`, city: null, state: "GO" } };
    }
  }

  // Endereço escrito no próprio pedido ("Av. Deputado Jamel Cecilio, 3300"): com endereço conhecido, sempre localiza.
  for (const query of queries) {
    const street = query.match(STREET_IN_TEXT)?.[0];
    if (!street) continue;
    const crm = inCrm(street);
    if (crm) return { type: "found", source: "crm", code: crm.code, store: crm.store };
    const name = query.match(/\bLoja\s+([^\n*()–—,-]+)/i)?.[1]?.trim();
    return { type: "found", source: "session", code: "", store: sessionStoreInfo({ nome: `Loja ${name || "Óticas Brasil"}`, cidade: null, enderecoCompleto: street.replace(/[.!?]+$/, "").trim() }) };
  }
  return { type: "none" };
}

/** Rua e número da loja em sequência no texto ("Rua 9, 2106", "Rua 9 nº 2106"); sem número no cadastro vale só a rua. */
export function citesAddress(text: string, store: StoreInfo) {
  const street = tokens(titleCase(store.address ?? ""));
  if (street.length < 2) return false;
  const number = store.addressNumber && !/^s\/?n$/i.test(store.addressNumber.trim()) ? tokens(store.addressNumber) : [];
  const hay = tokens(text);
  for (let index = 0; index + street.length <= hay.length; index += 1) {
    if (!street.every((word, offset) => hay[index + offset] === word)) continue;
    if (!number.length) return true;
    const next = hay.slice(index + street.length, index + street.length + number.length);
    if (number.every((word, offset) => next[offset] === word)) return true;
  }
  return false;
}

/**
 * Loja fixada na sessão (activeStore) dentro do cadastro: unidade cujo endereço (rua + número) é o informado.
 * Com wantedMatches (lojas que o pedido nomeou) sem essa unidade, o cliente quer outra loja: null.
 */
export function anchoredStoreMatch<T extends { code: string; store: StoreInfo }>(directory: T[], anchorText: string, wantedMatches: T[] = []): T | null {
  const exact = dedupeStores(directory.filter((item) => citesAddress(anchorText, item.store)));
  const unique = exact.length ? exact : dedupeStores(directory.filter((item) => citesStreet(anchorText, item.store)));
  if (unique.length !== 1) return null;
  if (wantedMatches.length && !wantedMatches.some((item) => sameStorePlace(item.store, unique[0].store))) return null;
  return unique[0];
}

/**
 * Loja pedida pelo cliente, já resolvida: filiais no mesmo endereço mescladas; com mais de uma unidade real, vale a
 * que acabou de ser citada (endereço presente na última mensagem da IA, ex.: "essa loja do setor sul" depois da ficha);
 * senão, desambiguação com o endereço completo de cada uma (nunca dois rótulos iguais).
 */
export function resolveStoreMatch<T extends { code: string; store: StoreInfo }>(matches: T[], options: { wanted: string; recentAiTexts?: string[] }):
  | { type: "found"; match: T }
  | { type: "ambiguous"; options: string[] }
  | { type: "none" } {
  const unique = dedupeStores(matches);
  if (!unique.length) return { type: "none" };
  if (unique.length === 1 || /^\s*(lj|loja)?\s*\d+\s*$/i.test(options.wanted)) return { type: "found", match: unique[0] };
  // Uma só unidade casa pelo nome/bairro: é ela (o endereço das outras não entra na disputa).
  const byName = unique.filter((item) => storeNameMatches(options.wanted, item.store));
  if (byName.length === 1) return { type: "found", match: byName[0] };
  for (const text of options.recentAiTexts ?? []) {
    const cited = unique.filter((item) => citesStreet(text, item.store));
    if (cited.length === 1) return { type: "found", match: cited[0] };
    if (cited.length > 1) {
      // Mesma rua com números diferentes (Rua 9, 2106 x Rua 9, 1855): o número citado decide.
      const exact = cited.filter((item) => citesAddress(text, item.store));
      if (exact.length === 1) return { type: "found", match: exact[0] };
      break;
    }
  }
  const labels = unique.slice(0, 5).map((item) => {
    const label = storeLabel(item.code, item.store);
    return label.includes(" — ") ? label : `${label} — ${fullAddress(item.store) || `LJ ${item.code}`}`;
  });
  // Rótulos ainda iguais: acrescenta o número da loja para diferenciar.
  const distinct = labels.map((label, index) => (labels.indexOf(label) !== index || labels.lastIndexOf(label) !== index ? `${label} (LJ ${unique[index].code})` : label));
  return { type: "ambiguous", options: distinct };
}
