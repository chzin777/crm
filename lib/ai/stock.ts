/**
 * Estoque em tempo real para o agente de IA: busca local do produto (catálogo do CRM) → saldo por loja
 * na API de estoque do VMSet só para esses poucos códigos, com cache de 3 min e tempo limite de 3 s.
 * Sem banco aqui: a chamada HTTP e o relógio entram por parâmetro (testável; mesma lógica no WhatsApp e no /ia).
 */
import { storeErpCode } from "@/lib/stores";

export const STOCK_CACHE_TTL_MS = 180_000;
export const STOCK_TIMEOUT_MS = 3_000;
/** No máximo 5 produtos por consulta (por turno de conversa). */
export const STOCK_MAX_CODES = 5;

export type StockUnit = { unit: string; name: string; qty: number };
export type StockStatus = "ok" | "unavailable_api";
export type StockLookup = { stockStatus: StockStatus; byCode: Record<string, StockUnit[]>; fromCache: number; requested: number };

type FetchLike = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/**
 * Cliente da API de estoque. Códigos consultados há menos de 3 min voltam do cache sem chamada HTTP;
 * lentidão (> 3 s) ou falha nunca lança erro: devolve stockStatus "unavailable_api" (a IA transfere).
 */
export function createStockClient(options: { url: string; token: string; fetch?: FetchLike; now?: () => number; ttlMs?: number; timeoutMs?: number }) {
  const ttl = options.ttlMs ?? STOCK_CACHE_TTL_MS;
  const timeout = options.timeoutMs ?? STOCK_TIMEOUT_MS;
  const now = options.now ?? Date.now;
  const doFetch: FetchLike = options.fetch ?? ((url, init) => fetch(url, init));
  const cache = new Map<string, { at: number; units: StockUnit[] }>();

  async function getStockByProductCodes(codes: string[]): Promise<StockLookup> {
    const wanted = [...new Set(codes.map((code) => code.trim()).filter(Boolean))].slice(0, STOCK_MAX_CODES);
    const byCode: Record<string, StockUnit[]> = {};
    const missing: string[] = [];
    for (const code of wanted) {
      const hit = cache.get(code);
      if (hit && now() - hit.at < ttl) byCode[code] = hit.units;
      else missing.push(code);
    }
    const fromCache = wanted.length - missing.length;
    if (!missing.length) return { stockStatus: "ok", byCode, fromCache, requested: 0 };
    if (!options.url || !options.token) return { stockStatus: "unavailable_api", byCode, fromCache, requested: 0 };
    try {
      const response = await doFetch(`${options.url.replace(/\/$/, "")}/stock?codes=${missing.map(encodeURIComponent).join(",")}`, {
        headers: { "x-api-key": options.token },
        signal: AbortSignal.timeout(timeout),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as { items?: { code?: unknown; unit?: unknown; name?: unknown; qty?: unknown }[] };
      if (!Array.isArray(body?.items)) throw new Error("resposta sem items");
      const at = now();
      for (const code of missing) byCode[code] = [];
      for (const item of body.items) {
        const code = String(item.code ?? "");
        if (!(code in byCode)) continue;
        byCode[code].push({ unit: String(item.unit ?? ""), name: String(item.name ?? ""), qty: Number(item.qty) || 0 });
      }
      for (const code of missing) cache.set(code, { at, units: byCode[code] });
      return { stockStatus: "ok", byCode, fromCache, requested: missing.length };
    } catch (error) {
      console.warn(`[ai][estoque] API do VMSet indisponível (${missing.join(",")}): ${error instanceof Error ? error.message : error}`);
      return { stockStatus: "unavailable_api", byCode, fromCache, requested: missing.length };
    }
  }

  return { getStockByProductCodes, clearCache: () => cache.clear() };
}

/** Unidades internas que não atendem o público: administrativo, CD/depósito, fábrica, laboratório, holding. */
const NON_RETAIL = /\b(ADM|ADMINISTRATIV\w*|M3 PROCESSO|DEPOSITO|DEPÓSITO|CENTRO DISTRIBUI\w*|CD|LABORATORIO|LABORATÓRIO|INDUSTRIA|INDÚSTRIA|PARTICIPACOES|PARTICIPAÇÕES)\b/i;

/** Ponto de venda ao público: precisa ter "LJ <número>" no nome e nenhuma marca de unidade interna. */
export function isRetailUnit(name: string) {
  return !!storeErpCode(name) && !NON_RETAIL.test(name);
}

/** Cadastro da loja usado para o nome comercial (tabela Store do CRM). */
export type StoreInfo = { name: string; address: string | null; addressNumber: string | null; neighborhood: string | null; city: string | null };

const ACCENTS: Record<string, string> = {
  GOIANIA: "Goiânia", AMAZONIA: "Amazônia", GOIAS: "Goiás", BRASILIA: "Brasília", ARAGUAINA: "Araguaína", AEROVIARIO: "Aeroviário",
  FERROVIARIO: "Ferroviário", IPES: "Ipês", SAO: "São", JOAO: "João", TEOTONIO: "Teotônio", INDEPENDENCIA: "Independência",
  PRACA: "Praça", AGUAS: "Águas", AEROPORTO: "Aeroporto", CAMPINAS: "Campinas", AVENIDA: "Av.", AV: "Av.", "AV.": "Av.", R: "R.",
};
const LOWER = new Set(["de", "da", "do", "das", "dos", "e", "com"]);

/** "PARQUE AMAZONIA" → "Parque Amazônia"; "AVENIDA PADRE ORLANDO" → "Av. Padre Orlando". */
export function titleCase(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .map((word, index) => {
      const fixed = ACCENTS[word.toUpperCase()];
      if (fixed) return fixed;
      const lower = word.toLowerCase();
      if (index > 0 && LOWER.has(lower)) return lower;
      return /^\d/.test(word) || /^[A-Z]{1,2}-?\d/i.test(word) ? word.toUpperCase() : lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

/** Nome comercial: "Loja Parque Amazônia — Av. Padre Orlando de Morais, 2017" (cidade quando não é Goiânia). */
export function storeLabel(code: string, store: StoreInfo | undefined) {
  if (!store) return `Loja ${code}`;
  const place = store.neighborhood ? titleCase(store.neighborhood) : `${code}`;
  // "Avenida AV. PERIMETRAL" no cadastro vira "Av. Perimetral" (sem o tipo repetido).
  const street = store.address ? titleCase(store.address.replace(/,\s*$/, "")).replace(/^(Av\.|R\.|Rua)\s+(Av\.|R\.|Rua)\s+/i, "$2 ") : "";
  const number = store.addressNumber && !/^s\/?n$/i.test(store.addressNumber.trim()) && !street.includes(store.addressNumber.trim()) ? store.addressNumber.trim() : "";
  const city = store.city && !/^GOIANIA$/i.test(store.city.trim()) ? ` (${titleCase(store.city)})` : "";
  const address = [street, number].filter(Boolean).join(", ");
  return `Loja ${place}${city}${address ? ` — ${address}` : ""}`;
}

const norm = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** A loja atende a região/loja pedida pelo cliente (bairro, cidade, rua, "LJ 36" ou "loja 36"). */
export function matchesRegion(code: string, store: StoreInfo | undefined, region: string) {
  const wanted = norm(region.replace(/\b(loja|lj|regiao|região|bairro|setor|perto|do|da|de)\b/gi, " "));
  if (!wanted) return false;
  if (/^\d+$/.test(wanted)) return wanted.replace(/^0+/, "") === code;
  const hay = norm([store?.neighborhood, store?.city, store?.address, storeLabel(code, store)].filter(Boolean).join(" "));
  return hay.includes(wanted) || wanted.includes(norm(store?.neighborhood ?? "#"));
}

export type StockStore = { code: string; loja: string; quantidade: number; /** Cidade para agrupar a lista (ex.: "Goiânia", "Águas Claras (DF)"). */ cidade?: string };

/** Regiões administrativas do DF que aparecem como cidade no cadastro das lojas. */
const DF_PLACES = /^(BRASILIA|AGUAS CLARAS|TAGUATINGA|CEILANDIA|GAMA|SOBRADINHO|SAMAMBAIA|GUARA|PLANALTINA|SUDOESTE|ASA (SUL|NORTE)|LAGO (SUL|NORTE)|RECANTO DAS EMAS|SANTA MARIA|RIACHO FUNDO|NUCLEO BANDEIRANTE|VICENTE PIRES|JARDIM BOTANICO|SAO SEBASTIAO|PARANOA|CRUZEIRO|NOROESTE|OCTOGONAL|ARNIQUEIRA|DISTRITO FEDERAL|DF)(s|$)/;

/** Cidade da loja para o agrupamento da lista; DF identificado pelo nome da região. */
export function storeCity(store: StoreInfo | undefined) {
  const raw = store?.city?.trim();
  if (!raw) return undefined;
  const plain = raw.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  const name = titleCase(raw.replace(/\s*[-/]\s*(DF|GO)$/i, ""));
  return DF_PLACES.test(plain) && !/\(DF\)/.test(name) ? `${name} (DF)` : name;
}
export type StockProduct = { codigo: string; produto: string; marca: string | null; preco: number | null; lojasComEstoque: StockStore[] };
export type StockScenario = "disponivel_na_regiao" | "esgotado_na_regiao_disponivel_em_outras" | "disponivel_em_lojas" | "sem_estoque_na_rede" | "unavailable_api" | "produto_nao_encontrado";
export type StockToolResult = { cenario: StockScenario; termoBusca: string; regiao: string; regiaoReconhecida: boolean; produtos: (StockProduct & { lojasNaRegiao: StockStore[] })[]; orientacao: string };

const MAX_STORES_PER_PRODUCT = 6;

/** Saldo por loja de varejo (filtra ADM/CD/fábrica e saldo ≤ 0), maior estoque primeiro. */
export function retailStock(units: StockUnit[], stores: Map<string, StoreInfo>): StockStore[] {
  const byCode = new Map<string, StockStore>();
  for (const unit of units) {
    const store = stores.get(unit.unit);
    if (!isRetailUnit(unit.name) || (store && !isRetailUnit(store.name)) || unit.qty <= 0) continue;
    const current = byCode.get(unit.unit);
    if (current) current.quantidade += unit.qty;
    else byCode.set(unit.unit, { code: unit.unit, loja: storeLabel(unit.unit, store), quantidade: unit.qty, ...(storeCity(store) ? { cidade: storeCity(store) } : {}) });
  }
  return [...byCode.values()].sort((a, b) => b.quantidade - a.quantidade);
}

const GUIDANCE: Record<StockScenario, string> = {
  disponivel_na_regiao: "Confirme objetivamente que há unidades disponíveis na loja da região pedida e informe o endereço comercial dela.",
  esgotado_na_regiao_disponivel_em_outras: "Informe que na loja pedida está esgotado no momento e liste exatamente as outras lojas com estoque (nome e endereço).",
  disponivel_em_lojas: "Informe objetivamente em quais lojas há unidades disponíveis agora (nome e endereço) e pergunte qual fica melhor para o cliente.",
  sem_estoque_na_rede: "Informe que o modelo está sem estoque na rede no momento e ofereça transferir para um atendente verificar encomenda ou modelos similares (action handoff se o cliente aceitar ou insistir).",
  unavailable_api: "Informe que não foi possível verificar o estoque no sistema agora e transfira para um atendente confirmar (action handoff).",
  produto_nao_encontrado: "Nenhum produto com esse nome foi encontrado no catálogo. Peça marca/modelo/referência ao cliente ou transfira para um atendente (action handoff).",
};

/** Monta o resultado da tool a partir da busca local e do saldo; o cenário é decidido no código, não pelo modelo. */
export function buildStockResult(input: {
  term: string;
  region?: string;
  products: { code: string; description: string; brand: string | null; price: number | null }[];
  lookup: StockLookup | null;
  stores: Map<string, StoreInfo>;
  withPrices: boolean;
}): StockToolResult {
  const region = input.region?.trim() ?? "";
  const base = { termoBusca: input.term, regiao: region };
  if (!input.products.length) return { ...base, cenario: "produto_nao_encontrado", regiaoReconhecida: false, produtos: [], orientacao: GUIDANCE.produto_nao_encontrado };
  if (!input.lookup || input.lookup.stockStatus === "unavailable_api") {
    return { ...base, cenario: "unavailable_api", regiaoReconhecida: false, produtos: [], orientacao: GUIDANCE.unavailable_api };
  }
  const lookup = input.lookup;
  const regionCodes = region ? [...input.stores.keys()].filter((code) => matchesRegion(code, input.stores.get(code), region)) : [];
  const regionKnown = regionCodes.length > 0;
  const produtos = input.products.map((product) => {
    const all = retailStock(lookup.byCode[product.code] ?? [], input.stores);
    const inRegion = all.filter((store) => regionCodes.includes(store.code));
    const others = all.filter((store) => !regionCodes.includes(store.code));
    return {
      codigo: product.code,
      produto: product.description,
      marca: product.brand,
      preco: input.withPrices ? product.price : null,
      lojasNaRegiao: inRegion,
      lojasComEstoque: [...inRegion, ...others].slice(0, MAX_STORES_PER_PRODUCT),
    };
  });
  const anyStock = produtos.some((product) => product.lojasComEstoque.length);
  const anyRegion = produtos.some((product) => product.lojasNaRegiao.length);
  const cenario: StockScenario = !anyStock ? "sem_estoque_na_rede" : !regionKnown ? "disponivel_em_lojas" : anyRegion ? "disponivel_na_regiao" : "esgotado_na_regiao_disponivel_em_outras";
  return { ...base, cenario, regiaoReconhecida: regionKnown, produtos, orientacao: GUIDANCE[cenario] };
}

/** Regras fixas no código (não editáveis na tela) sobre estoque. */
export const STOCK_RULES = [
  "REGRAS DE ESTOQUE (fixas): para disponibilidade, estoque ou \"tem na loja X\", use a ferramenta consultarEstoqueProduto (termoBusca com marca/modelo/referência; regiaoOuLoja quando o cliente citar bairro, cidade ou loja). Não use o histórico de vendas como estoque.",
  "NUNCA diga \"a disponibilidade precisa ser confirmada na loja\" (ou equivalente) quando a ferramenta devolver saldo. Siga o cenário retornado:",
  "- disponivel_na_regiao: confirme que há unidades na loja pedida e informe o endereço comercial;",
  "- esgotado_na_regiao_disponivel_em_outras: diga que naquela loja está esgotado no momento e liste exatamente as outras lojas com estoque;",
  "- disponivel_em_lojas: diga em quais lojas há unidades agora;",
  "- sem_estoque_na_rede: diga que o modelo está sem estoque na rede no momento e ofereça transferir para um atendente verificar encomenda ou similares;",
  "- unavailable_api: diga que não foi possível verificar o estoque no sistema agora e transfira (action handoff) para um atendente confirmar.",
  "Use só as lojas e os endereços devolvidos pela ferramenta; não informe quantidades exatas, diga apenas que há unidades disponíveis.",
].join("\n");

/** Definição da tool para a OpenAI (somente leitura). */
export const STOCK_TOOL = {
  type: "function" as const,
  function: {
    name: "consultarEstoqueProduto",
    description: "Consulta o saldo atual por loja de varejo de um produto (óculos de sol, armação, lente de contato, acessório) no ERP. Somente leitura.",
    parameters: {
      type: "object",
      properties: {
        termoBusca: { type: "string", description: "Marca, modelo ou referência do produto, ex.: \"Ray-Ban RB3025\", \"Oakley Holbrook\"." },
        regiaoOuLoja: { type: "string", description: "Bairro, cidade ou loja citada pelo cliente, ex.: \"Parque Amazônia\", \"Aparecida\", \"LJ 36\". Opcional." },
      },
      required: ["termoBusca"],
      additionalProperties: false,
    },
  },
};

/** Registro da consulta mostrado no teste da página /ia. */
export type StockLog = { term: string; region: string; scenario: StockScenario; products: number; stores: number; ms: number; cached: boolean; /** Foto do produto: do cache, da web ou não achada. */ image?: "cache" | "web" | "none" };

/** Passos da busca textual: todas as palavras; depois sem a última, até sobrar uma (marca). */
export function stockSearchTerms(term: string) {
  const words = term.split(/[\s,;/]+/).map(norm).filter((word) => word.length >= 2 && !["OCULOS", "DE", "SOL", "DO", "DA", "MODELO", "TEM", "QUERO"].includes(word));
  const steps: string[][] = [];
  // "Ray Ban" escrito separado também casa com "RAYBAN".
  const joined = words.length > 1 ? [words.join("")] : [];
  if (joined.length) steps.push(joined);
  for (let size = words.length; size >= 1; size -= 1) steps.push(words.slice(0, size));
  return steps;
}
