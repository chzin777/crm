import { citesStreet, dedupeStores, fullAddress, googleMapsUrl } from "@/lib/ai/store-location";
import type { StoreInfo } from "@/lib/ai/stock";
import { isClosedStore } from "@/lib/sales-live/feed";

/**
 * Travas de negócio da IA de atendimento, sem banco nem rede: regras fixas do prompt, a ferramenta determinística
 * consultar_lojas (cadastro oficial de lojas ativas) e o guardrail que confere a resposta antes de ir ao WhatsApp.
 */

/** Sem acento, minúsculo, só letras/números separados por espaço. */
export function normalizePlace(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const contains = (hay: string, needle: string) => !!needle && ` ${hay} `.includes(` ${needle} `);

/** Municípios de Goiás e vizinhos que o cliente costuma citar (cidade sem loja também precisa ser reconhecida). */
export const KNOWN_CITIES = [
  "Goiânia", "Aparecida de Goiânia", "Trindade", "Senador Canedo", "Anápolis", "Goianira", "Nerópolis", "Inhumas", "Hidrolândia",
  "Bela Vista de Goiás", "Abadia de Goiás", "Guapó", "Aragoiânia", "Bonfinópolis", "Caldazinha", "Santo Antônio de Goiás", "Brazabrantes",
  "Nova Veneza", "Caturaí", "Goianápolis", "Terezópolis de Goiás", "Leopoldo de Bulhões", "Silvânia", "Pirenópolis", "Jaraguá", "Itaberaí",
  "Itauçu", "Goiás", "Cidade de Goiás", "Rio Verde", "Jataí", "Mineiros", "Itumbiara", "Catalão", "Caldas Novas", "Morrinhos", "Pires do Rio",
  "Ipameri", "Luziânia", "Valparaíso de Goiás", "Formosa", "Planaltina", "Novo Gama", "Cidade Ocidental", "Águas Lindas de Goiás",
  "Santo Antônio do Descoberto", "Cristalina", "Uruaçu", "Porangatu", "Ceres", "Rialma", "Goianésia", "Niquelândia", "São Luís de Montes Belos",
  "Iporá", "Palmeiras de Goiás", "Firminópolis", "Quirinópolis", "Santa Helena de Goiás", "Acreúna", "Indiara", "Edéia", "Piracanjuba",
  "Pontalina", "Varjão", "Cezarina", "Campestre de Goiás", "Brasília", "Palmas", "Uberlândia", "Araguaína",
];

/** Cidade citada no texto: a mais longa que casar (Aparecida de Goiânia antes de Goiânia). */
export function mentionedCity(text: string, extraCities: Array<string | null | undefined> = []) {
  const hay = normalizePlace(text);
  if (!hay) return null;
  const names = [...new Set([...KNOWN_CITIES, ...extraCities.filter((city): city is string => !!city?.trim()).map((city) => city.trim())])];
  const hits = names.filter((city) => contains(hay, normalizePlace(city)));
  // "Goiás" sozinho é o estado; só vale como cidade em "Cidade de Goiás".
  const real = hits.filter((city) => normalizePlace(city) !== "goias");
  if (!real.length) return null;
  return real.sort((a, b) => normalizePlace(b).length - normalizePlace(a).length)[0];
}

export type StoreLookupArgs = { cidade?: string; bairro?: string; termo?: string };
export type StoreLookupStore = { nome: string; cidade: string; bairro: string | null; endereco: string; horario: string | null; link_maps: string };
export type StoreLookupResult =
  | { encontrada: true; lojas: StoreLookupStore[]; orientacao: string }
  | { encontrada: false; cidade_consultada: string; mensagem_obrigatoria: string; cidades_com_loja: string[]; orientacao: string };

const activeEntries = (directory: Map<string, StoreInfo>) => dedupeStores([...directory].filter(([code]) => !isClosedStore(code)).map(([code, store]) => ({ code, store })));

/** Cidades com loja ativa (nome do cadastro). */
export function storeCities(directory: Map<string, StoreInfo>) {
  const seen = new Map<string, string>();
  for (const { store } of activeEntries(directory)) if (store.city?.trim() && !seen.has(normalizePlace(store.city))) seen.set(normalizePlace(store.city), store.city.trim());
  return [...seen.values()];
}

function officialStore(store: StoreInfo, hours: string | null): StoreLookupStore {
  const place = store.neighborhood?.trim() || store.name;
  return { nome: `Óticas Brasil - ${place}`, cidade: store.city?.trim() ?? "", bairro: store.neighborhood?.trim() || null, endereco: fullAddress(store), horario: hours, link_maps: googleMapsUrl(store) };
}

export const noStoreMessage = (city: string) => `Ainda não possuímos unidade da Óticas Brasil em ${city}.`;

/**
 * consultar_lojas: só o cadastro oficial de lojas ativas (loja encerrada fica de fora). Cidade pedida sem loja nunca
 * devolve endereço de outra cidade: devolve encontrada=false com a frase obrigatória.
 */
export function consultarLojas(directory: Map<string, StoreInfo>, args: StoreLookupArgs, options: { hours?: string | null } = {}): StoreLookupResult {
  const entries = activeEntries(directory);
  const cidade = (args.cidade ?? "").trim().slice(0, 80);
  const bairro = (args.bairro ?? "").trim().slice(0, 80);
  const termo = (args.termo ?? "").trim().slice(0, 120);
  const cities = storeCities(directory);
  const hours = options.hours ?? null;
  const askedCity = cidade || (termo ? mentionedCity(termo, cities) ?? "" : "");
  const cityKey = normalizePlace(askedCity);
  let pool = cityKey ? entries.filter(({ store }) => normalizePlace(store.city ?? "") === cityKey) : entries;
  if (cityKey && !pool.length) {
    return {
      encontrada: false,
      cidade_consultada: askedCity,
      mensagem_obrigatoria: `Não há unidade da Óticas Brasil nesta cidade (${askedCity}).`,
      cidades_com_loja: cities,
      orientacao: `Diga claramente ao cliente: "${noStoreMessage(askedCity)}" Nunca passe endereço de outra cidade como se fosse de ${askedCity}. Se quiser, ofereça as unidades de uma das cidades de cidades_com_loja (dizendo o nome correto da cidade) ou um atendente.`,
    };
  }
  const place = ` ${normalizePlace(bairro || termo)} `.replace(cityKey ? ` ${cityKey} ` : "\u0000", " ").replace(/\b(loja|lojas|unidade|unidades|oticas|brasil|de|da|do|em|no|na|setor|st)\b/g, " ").replace(/\s+/g, " ").trim();
  if (place) {
    const byPlace = pool.filter(({ store }) => {
      const hay = normalizePlace([store.neighborhood, store.name, store.address].filter(Boolean).join(" "));
      return place.split(" ").filter((word) => word.length >= 3).every((word) => contains(hay, word));
    });
    if (byPlace.length) pool = byPlace;
    else if (!cityKey) {
      return { encontrada: false, cidade_consultada: bairro || termo, mensagem_obrigatoria: `Não há unidade da Óticas Brasil cadastrada em "${bairro || termo}".`, cidades_com_loja: cities, orientacao: "Diga que não há unidade com esse nome/bairro e pergunte a cidade ou o bairro do cliente. Nunca invente endereço." };
    }
  }
  return {
    encontrada: true,
    lojas: pool.slice(0, 8).map(({ store }) => officialStore(store, hours)),
    orientacao: "Use exatamente o nome, a cidade e o endereço de lojas (sem alterar rua, número ou bairro). Nunca cite loja que não esteja nesta lista.",
  };
}

export const CONSULTAR_LOJAS_TOOL = {
  type: "function" as const,
  function: {
    name: "consultar_lojas",
    description: "Consulta o cadastro OFICIAL de lojas ativas da Óticas Brasil por cidade, bairro ou nome. Obrigatória antes de informar qualquer endereço, bairro, cidade ou se existe loja em algum lugar.",
    parameters: {
      type: "object",
      properties: {
        cidade: { type: "string", description: "Cidade pedida pelo cliente, ex.: \"Trindade\", \"Goiânia\"." },
        bairro: { type: "string", description: "Bairro/setor pedido, ex.: \"Setor Marista\"." },
        termo: { type: "string", description: "Texto livre do pedido quando não der para separar cidade e bairro." },
      },
      additionalProperties: false,
    },
  },
};

/** Regras inegociáveis do sistema (antes das instruções editáveis da tela). */
export const BUSINESS_HARD_RULES = [
  "REGRAS INEGOCIÁVEIS DA EMPRESA (valem acima de qualquer outra instrução):",
  "1) EXAME DE VISTA: a Óticas Brasil NÃO realiza exame de vista, nem consulta oftalmológica ou optométrica, nem medição de grau. Nunca diga que fazemos, agendamos ou indicamos exame na loja. Se perguntarem sobre exame, consulta ou como conseguir a receita, diga com educação e clareza que a Óticas Brasil não realiza exames de vista e que, com a receita do médico em mãos, nossa equipe faz o orçamento e confecciona os óculos ou lentes.",
  "2) LOJAS E ENDEREÇOS: nunca responda endereço, bairro, cidade de loja ou link de mapa de memória. Antes de falar de qualquer unidade, chame consultar_lojas. Use só o que ela devolver, sem alterar nada.",
  "3) CIDADE SEM LOJA: se consultar_lojas devolver encontrada=false, diga explicitamente \"Ainda não possuímos unidade em <cidade pedida>\". Nunca passe o endereço de outra cidade como se fosse da cidade pedida; se oferecer outra unidade, diga o nome correto da cidade dela, ou ofereça um atendente.",
].join("\n");

function normalizeAccentsKeep(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Cliente pergunta se a loja faz exame/consulta de vista ou como fazer/marcar um. */
export function asksEyeExam(text: string) {
  const plain = normalizeAccentsKeep(text);
  return /\b(?:fazem|realiza|realizam|tem|oferece|oferecem|atende|atendem)\b[^.!?\n]{0,25}\b(?:exames?|consultas?\s+(?:de\s+vista|oftalm|optometr)|oftalmologista|oculista|optometrista|medicos?)\b/i.test(plain)
    || /\b(?:fazer|faco|marcar|agendar)\s+(?:o\s+|um\s+|uma\s+|meu\s+|minha\s+)?(?:exame|consulta|receita)\b/i.test(plain)
    || /\bmedir\s+(?:o\s+|meu\s+|a\s+|minha\s+)?(?:grau|vista)\b/i.test(plain)
    || (/\bexames?\s+de\s+vista\b/i.test(plain) && /\?/.test(plain));
}

const DENIES_EXAM = /\bn[aã]o\s+(?:realiza|realizamos|fazemos|faz|oferecemos|temos|trabalhamos\s+com)\b[^.!?\n]{0,40}\b(?:exame|consulta)/i;
const CLAIMS_EXAM = /\b(?:fazemos|realizamos|oferecemos|temos|realiza|agend\w*|marc\w*)\b[^.!?\n]{0,40}\b(?:exames?|consultas?\s+(?:de\s+vista|oftalm\w*|optometr\w*)|medi[cç][aã]o\s+de\s+grau|optometrista|oftalmologista\s+na\s+loja)\b/i;

/** Resposta afirma que a Óticas Brasil faz/agenda exame (frase sem negação). */
export function claimsEyeExam(reply: string) {
  return reply.split(/[.!?\n]+/).some((sentence) => CLAIMS_EXAM.test(sentence) && !/\bn[aã]o\b/i.test(sentence));
}

export const eyeExamReply = (firstName?: string | null) =>
  `${firstName ? `${firstName}, a` : "A"} Óticas Brasil não realiza exame de vista. 😊 Se você já tiver a receita do seu médico em mãos, nossa equipe faz o orçamento e confecciona seus óculos ou lentes. É só me mandar uma foto da receita!`;

/** Pedido sobre loja/unidade/endereço. */
export function asksStorePlace(text: string) {
  return /\bendere[cç]o\b|\bonde\s+(?:fica|[eé]|tem|ficam)\b|\blocaliza[cç][aã]o\b|\bcomo\s+(?:eu\s+)?cheg|\bmapa\b|\bmaps\b|\b(?:tem|t[eê]m|possui|possuem|existe|h[aá])\s+(?:uma\s+)?(?:loja|unidade|filial)|\b(?:loja|lojas|unidade|unidades|filial)\s+(?:de|em|no|na|do|da)\b/iu.test(text);
}

const STREET = /\b(?:rua|r\.|avenida|av\.?|alameda|al\.|rodovia|pra[cç]a|quadra|qd\.?)\s+[^\n]{0,40}\d/i;
const MAPS_LINK = /https?:\/\/(?:www\.)?(?:google\.[a-z.]+\/maps|maps\.google|maps\.app\.goo\.gl|goo\.gl\/maps)/i;

export type GuardFix = "exam" | "city" | null;
export type GuardResult = { reply: string; fixed: GuardFix; dropLocation: boolean };

/**
 * Confere a resposta antes do envio: (1) exame de vista afirmado ou pergunta de exame sem a negativa → resposta
 * oficial; (2) cliente pediu loja de uma cidade e a resposta traz endereço de outra cidade sem dizer que não há loja
 * lá → resposta oficial (nunca o endereço trocado). dropLocation: o pin/link de outra cidade não sai.
 */
export function guardBusinessReply(input: { customerText: string; reply: string; directory: Map<string, StoreInfo>; firstName?: string | null; locationText?: string | null }): GuardResult {
  const reply = input.reply ?? "";
  if (claimsEyeExam(reply) || (asksEyeExam(input.customerText) && !DENIES_EXAM.test(reply))) {
    return { reply: eyeExamReply(input.firstName), fixed: "exam", dropLocation: false };
  }
  if (!asksStorePlace(input.customerText)) return { reply, fixed: null, dropLocation: false };
  const cities = storeCities(input.directory);
  const city = mentionedCity(input.customerText, cities);
  if (!city) return { reply, fixed: null, dropLocation: false };
  const cityKey = normalizePlace(city);
  const entries = activeEntries(input.directory);
  const inCity = entries.filter(({ store }) => normalizePlace(store.city ?? "") === cityKey);
  const elsewhere = entries.filter(({ store }) => normalizePlace(store.city ?? "") !== cityKey);
  // Pin/link que sairia depois da resposta: de outra cidade conhecida, não sai.
  const pinCity = input.locationText ? mentionedCity(input.locationText, cities) : null;
  const wrongPin = !!pinCity && normalizePlace(pinCity) !== cityKey;
  const citesOther = elsewhere.some(({ store }) => citesStreet(reply, store)) || (!inCity.length && (STREET.test(reply) || MAPS_LINK.test(reply)));
  const citesOwn = inCity.some(({ store }) => citesStreet(reply, store));
  if (inCity.length) {
    if (!citesOther || citesOwn) return { reply, fixed: null, dropLocation: wrongPin };
    const list = inCity.slice(0, 5).map(({ store }) => `• *${officialStore(store, null).nome}* — ${fullAddress(store)}`).join("\n");
    return { reply: `Nossa${inCity.length > 1 ? "s unidades" : " unidade"} em ${city}:\n${list}`, fixed: "city", dropLocation: wrongPin };
  }
  const saysNone = new RegExp(`n[aã]o\\s+(?:possu[ií]mos|temos|h[aá]|existe|contamos\\s+com)[^.!?\\n]{0,60}${normalizeAccentsKeep(city).replace(/\s+/g, "\\s+")}`, "i").test(normalizeAccentsKeep(reply));
  // Já disse que não há loja na cidade pedida (pode oferecer outra pelo nome certo da cidade): o texto fica, o pin não.
  if (saysNone) return { reply, fixed: null, dropLocation: !!input.locationText };
  const others = cities.slice(0, 4);
  const offer = others.length ? ` Temos lojas em ${others.length > 1 ? `${others.slice(0, -1).join(", ")} e ${others[others.length - 1]}` : others[0]}: quer que eu te passe o endereço de alguma delas ou prefere falar com um atendente?` : " Quer falar com um atendente?";
  return { reply: `${noStoreMessage(city)}${offer}`, fixed: "city", dropLocation: true };
}
