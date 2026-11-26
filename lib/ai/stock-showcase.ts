/**
 * Busca ampla (só marca ou categoria: "tem Ray-Ban?", "quais armações femininas?") x busca específica (modelo ou
 * referência: "tem o Ray-Ban Justin?"). Na ampla, a tool devolve uma vitrine enxuta de modelos distintos com estoque
 * (nome + preço, sem foto e sem lojas); na específica, o detalhamento por loja com foto e ficha. Sem banco nem rede.
 */
import { cleanReference, commercialName } from "@/lib/ai/product-card";
import { expandModelNicknames, KNOWN_BRANDS } from "@/lib/ai/product-names";
import { mainPrice, stockInCity, type StockLookup, type StoreInfo } from "@/lib/ai/stock";
import { modelFamilyKey, referenceKey } from "@/lib/ai/product-names";

/** Identificadores de um modelo exibido (códigos e referência-base): base da memória "já mostrei esse". */
export function modelShownIds(model: { codigos?: string[]; referencia?: string | null; sku?: string | null }) {
  const ref = model.referencia && !model.referencia.startsWith("#") ? referenceKey(model.referencia) : "";
  return [...new Set([...(model.codigos ?? []), model.sku ?? "", ref ? `ref:${ref}` : ""].filter(Boolean))];
}

export type SearchKind = "marca_ampla" | "modelo_especifico";

/** Modelos na vitrine da busca ampla: no máximo 3 opções distintas (curadoria de consultora, não catálogo inteiro). */
export const SHOWCASE_MAX_MODELS = 3;
/** Modelos de reserva (com estoque) para trocar opção sem foto válida no catálogo visual. */
export const SHOWCASE_RESERVES = 4;
/** Modelos candidatos consultados no saldo (até 2 códigos cada) para sobrarem até 8 com estoque. */
export const SHOWCASE_CANDIDATES = 12;
export const SHOWCASE_CODES_PER_MODEL = 2;

const norm = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const compact = (value: string) => norm(value).replace(/ /g, "");

/** Palavras que não identificam modelo: pedido, tipo de produto e público. */
const GENERIC = new Set([
  "TEM", "TEMS", "VCS", "VC", "VOCES", "VOCE", "QUAIS", "QUAL", "QUE", "OS", "AS", "O", "A", "UM", "UMA", "DE", "DO", "DA", "DOS", "DAS", "E", "EM", "PRA", "PARA",
  "MODELO", "MODELOS", "OPCOES", "OPCAO", "MARCA", "LINHA", "COLECAO", "DISPONIVEL", "DISPONIVEIS", "ESTOQUE", "AI", "LOJA", "LOJAS", "ALGUM", "ALGUMA", "ALGUNS",
  "OCULOS", "SOL", "SOLAR", "SOLARES", "GRAU", "ARMACAO", "ARMACOES", "ARMACAOS", "LENTE", "LENTES", "CONTATO", "ACESSORIO", "ACESSORIOS",
  "FEMININO", "FEMININOS", "FEMININA", "FEMININAS", "MASCULINO", "MASCULINOS", "MASCULINA", "MASCULINAS", "INFANTIL", "INFANTIS", "UNISSEX", "KIDS",
  // Orçamento ("armação barata até 250 reais") não identifica modelo.
  "BARATA", "BARATAS", "BARATO", "BARATOS", "BARATINHA", "BARATINHO", "CONTA", "ACESSIVEL", "ACESSIVEIS", "ECONOMICA", "ECONOMICO", "PRECO", "MELHOR", "MENOR", "BOM", "BOA", "ATE", "REAIS", "VALOR", "MAIS", "MENOS",
]);

// "Meta" é modelo (Ray-Ban Meta), não marca para vitrine.
const NOT_BROAD = new Set(["META", "RAYBANMETA"]);
const BRAND_KEYS = new Set(KNOWN_BRANDS.map(compact).filter((key) => !NOT_BROAD.has(key)));

/** Palavras do termo que sobram depois de tirar pedido/tipo/público ("Óculos Ray-Ban de sol" → ["RAY", "BAN"]). */
export function modelWords(term: string) {
  return norm(term).split(" ").filter((word) => word && !GENERIC.has(word));
}

/** Ocasião e pedido ("pra presentear", "queria uns") não identificam produto: saem do termo de busca. */
const OCCASION_WORDS = new Set([
  "PRESENTE", "PRESENTES", "PRESENTEAR", "PRESENTEANDO", "PRESENTINHO", "ANIVERSARIO", "NATAL", "DIA", "MAES", "PAIS", "NAMORADOS",
  "NAMORADA", "NAMORADO", "ESPOSA", "ESPOSO", "MARIDO", "MULHER", "MAE", "PAI", "FILHA", "FILHO", "AMIGA", "AMIGO", "ALGUEM",
  "QUERIA", "QUERO", "GOSTARIA", "PROCURO", "PROCURANDO", "PRECISO", "VER", "MOSTRAR", "MOSTRA", "UNS", "UMAS", "ALGUMAS",
  "MINHA", "MEU", "BONITO", "BONITOS", "BONITA", "BONITAS", "LINDO", "LINDOS", "LINDA", "LINDAS", "LEGAL", "LEGAIS",
]);

/**
 * Termo da busca sem cidade e sem ocasião: "Goiânia" (resposta à pergunta da cidade) ou "óculos de sol pra presentear"
 * viram "" e "OCULOS DE SOL", e a busca ampla segue só com categoria + cidade. A cidade encontrada no termo volta
 * em `city` (quando a tool não recebeu cidade).
 */
export function stripSearchNoise(term: string, cities: string[]): { term: string; city: string | null; changed: boolean } {
  const original = norm(term);
  let text = ` ${original} `;
  let city: string | null = null;
  const names = [...new Set(cities.map((item) => norm(item.replace(/\s*[-/]\s*[A-Z]{2}$/i, ""))).filter((item) => item.length >= 4))].sort((a, b) => b.length - a.length);
  for (const name of names) {
    if (!text.includes(` ${name} `)) continue;
    city ??= name;
    text = text.split(` ${name} `).join(" ");
  }
  const words = text.split(" ").filter((word) => word && !OCCASION_WORDS.has(word));
  const cleaned = words.join(" ");
  return { term: cleaned, city, changed: cleaned !== original };
}

/** Categoria do catálogo pedida no termo (filtro da vitrine). */
export function termCategory(term: string): "SOLAR" | "ARMACAO" | "LENTE_CONTATO" | "" {
  const words = new Set(norm(term).split(" "));
  if (["LENTE", "LENTES"].some((word) => words.has(word)) && words.has("CONTATO")) return "LENTE_CONTATO";
  if (["SOL", "SOLAR", "SOLARES"].some((word) => words.has(word))) return "SOLAR";
  if (["ARMACAO", "ARMACOES", "GRAU"].some((word) => words.has(word))) return "ARMACAO";
  return "";
}

/** Público pedido no termo ("femininas" → FEMININ), usado como filtro opcional na vitrine. */
export function termAudience(term: string) {
  const text = norm(term);
  return /\bFEMININ/.test(text) ? "FEMININ" : /\bMASCULIN/.test(text) ? "MASCULIN" : /\b(INFANTIL|INFANTIS|KIDS)\b/.test(text) ? "INFANTIL" : "";
}

/**
 * Tipo da busca. Termo que é só marca ("rayban", "ray-ban", "oakley", "miumiu") ou só categoria ("armações
 * femininas") é obrigatoriamente ampla, mesmo que a IA diga o contrário; com modelo/referência no termo vale a
 * classificação da IA (padrão: específica).
 */
export function classifySearch(term: string, aiKind?: unknown, catalogBrands: Iterable<string> = []): SearchKind {
  const words = modelWords(term);
  if (!words.length) return "marca_ampla";
  const joined = words.join("");
  const brands = new Set([...BRAND_KEYS, ...[...catalogBrands].map(compact).filter((key) => key && !NOT_BROAD.has(key))]);
  if (brands.has(joined)) return "marca_ampla";
  // Referência (com número), modelo conhecido ("Justin") ou linha Meta: sempre específica, mesmo se a IA disser ampla.
  if (/\d/.test(joined) || expandModelNicknames(term) !== term || words.includes("META")) return "modelo_especifico";
  return aiKind === "marca_ampla" ? "marca_ampla" : "modelo_especifico";
}

export type ShowcaseCandidate = { code: string; description: string; brand: string | null };
export type ShowcaseModel = { nomeComercial: string; referencia: string | null; categoriaModelo: string | null; precoVenda: string | null; /** Cores/lentes com preços diferentes: a vitrine mostra "a partir de" o menor. */ precoVaria?: boolean; totalDisponivelRede: number; codigos: string[]; /** Lojas com saldo (nome curto, na cidade pedida) para a legenda do catálogo com foto. */ lojas?: string[] };
export type ShowcaseResult = {
  tipoBusca: "marca_ampla";
  cenario: "disponivel_em_lojas" | "sem_estoque_na_cidade" | "sem_estoque_na_rede" | "unavailable_api" | "produto_nao_encontrado" | "todos_ja_mostrados";
  /** Todos os modelos com estoque desta busca já foram mostrados na conversa. */
  todosJaMostrados?: boolean;
  termoBusca: string;
  regiao: string;
  regiaoReconhecida: false;
  /** Vazio de propósito: na busca ampla não há detalhamento por loja nem foto. */
  produtos: [];
  modelos: ShowcaseModel[];
  vitrineFormatada: string | null;
  orientacao: string;
  /** Marca real reconhecida no termo do cliente ("rada" → "RADDA"). */
  marcaResolvida?: string;
  /** A marca foi reconhecida, mas não há modelo dela com estoque/cadastro agora. */
  semEstoqueDaMarca?: boolean;
  /** Próximos modelos com estoque (fora da vitrine): substituem no catálogo com foto quem não tiver foto válida. Nunca vão ao modelo de linguagem. */
  reservas?: ShowcaseModel[];
  /** Vitrine da rede quando a cidade não tem saldo (a loja confirma). */
  foraDaCidade?: boolean;
};

/**
 * Referência de cadastro sem "REF" ("ARM RADDA OPBR 455 C2" → "OPBR 455"): o que sobra depois do tipo e da marca,
 * sem a cor (C2) nem o tamanho final. null = nada que identifique o modelo.
 */
export function fallbackReference(description: string, brand?: string | null) {
  const brandWords = new Set(norm(brand ?? "").split(" ").filter(Boolean));
  const words = norm(description).split(" ").filter(Boolean);
  const rest = words.slice(1).filter((word) => !brandWords.has(word));
  while (rest.length > 1 && (/^C\d{1,2}$/.test(rest[rest.length - 1]) || /^\d{2}$/.test(rest[rest.length - 1]))) rest.pop();
  const reference = rest.join(" ").trim();
  return /\d/.test(reference) ? reference : null;
}

/** Referência exibida na vitrine: a do cadastro, a de fallback ou o código interno ("#145158"); nunca dois itens iguais. */
export function showcaseReference(description: string, brand: string | null, code: string) {
  return commercialName(description, brand).referencia ?? fallbackReference(description, brand) ?? `#${code}`;
}

/** Agrupa cores/tamanhos do mesmo modelo (mais vendidos primeiro) e escolhe os códigos a consultar no saldo. */
export function showcaseCandidates<T extends ShowcaseCandidate>(products: T[], limits = { groups: SHOWCASE_CANDIDATES, codesPerModel: SHOWCASE_CODES_PER_MODEL }) {
  const groups = new Map<string, T[]>();
  for (const product of products) {
    // Família pelo código-base da referência: "RB4165L" e "4165L" são o mesmo modelo na vitrine; sem "REF", a
    // referência de cadastro ("OPBR 455") junta as cores do mesmo modelo.
    const fallback = fallbackReference(product.description, product.brand);
    const key = modelFamilyKey(product.description, product.brand) ?? (fallback ? `${compact(product.brand ?? "")}|${compact(fallback)}` : compact(product.description));
    const group = groups.get(key);
    if (group) group.push(product);
    else if (groups.size < limits.groups) groups.set(key, [product]);
  }
  return [...groups.values()].map((group) => group.slice(0, limits.codesPerModel));
}

const SHOWCASE_QUESTION_MANY = "Gostaria de ver a foto, lojas disponíveis e mais detalhes de algum desses modelos?";
const SHOWCASE_QUESTION_ONE = "Gostaria de ver a foto, lojas disponíveis e mais detalhes desse modelo?";
export const showcaseQuestion = (count: number) => (count === 1 ? SHOWCASE_QUESTION_ONE : SHOWCASE_QUESTION_MANY);

/** Vitrine no padrão do negócio: cabeçalho com a marca e uma linha "🕶️ *Nome (Ref. X)* — R$ ..." por modelo. */
export function formatShowcase(models: ShowcaseModel[], options: { header?: boolean } = {}) {
  if (!models.length) return null;
  // Sem cabeçalho fixo: a abertura é escrita pela IA (vitrine de orçamento).
  if (options.header === false) return formatShowcaseLines(models).join("\n");
  const brands = new Set(models.map((model) => model.nomeComercial.split(" ")[0]));
  const brand = brands.size === 1 ? commonBrand(models) : null;
  const header = models.length === 1
    ? `Temos este modelo${brand ? ` *${brand}*` : ""} disponível em estoque:`
    : `Temos vários modelos${brand ? ` *${brand}*` : ""} disponíveis em estoque! Confira alguns deles:`;
  return [header, "", ...formatShowcaseLines(models)].join("\n");
}

/** Numerada para o cliente escolher rápido ("o 1", "o segundo"); a sessão guarda a ordem (listedProducts). */
function formatShowcaseLines(models: ShowcaseModel[]) {
  return models.map((model, index) => {
    const icon = /sol/i.test(model.categoriaModelo ?? "") || !model.categoriaModelo ? "🕶️" : /lente/i.test(model.categoriaModelo) ? "👁️" : "👓";
    const ref = cleanReference(model.referencia);
    const name = `${model.nomeComercial}${ref ? ` (Ref. ${ref})` : ""}`;
    return `${index + 1}. ${icon} *${name}*${model.precoVenda ? ` — ${model.precoVaria ? "a partir de " : ""}${model.precoVenda}` : ""}`;
  });
}

/** Marca comum a todos os modelos (prefixo igual do nome comercial: "Ray-Ban", "Miu Miu", "Dolce & Gabbana"). */
function commonBrand(models: ShowcaseModel[]) {
  let prefix = models[0].nomeComercial.split(" ");
  for (const model of models.slice(1)) {
    const words = model.nomeComercial.split(" ");
    let size = 0;
    while (size < prefix.length && size < words.length && prefix[size] === words[size]) size += 1;
    prefix = prefix.slice(0, size);
  }
  // Um modelo só: o nome inteiro pode incluir o apelido ("Ray-Ban Justin"); a marca é a 1ª palavra conhecida.
  if (models.length === 1) return null;
  return prefix.join(" ") || null;
}

const SHOWCASE_GUIDANCE = {
  disponivel_em_lojas: "Opções com estoque na cidade do cliente: escreva antes um comentário curto, com suas palavras, dizendo em poucas palavras por que essas peças combinam com o que ele pediu (presente, uso diário, estilo, formato do rosto); depois copie vitrineFormatada exatamente como veio (o sistema transforma em fotos com legenda curta, então não cite códigos de referência). Em armação de grau, lembre com naturalidade que as lentes são orçadas conforme a receita. Se couber uma pergunta leve depois das fotos, coloque-a após ---SPLIT---; não force pergunta. Sem lista de lojas nem ficha nesta etapa.",
  sem_estoque_na_rede: "Nenhum modelo dessa marca/categoria tem estoque na rede agora. Diga isso com naturalidade e ofereça transferir para um atendente verificar encomenda ou similares (action handoff se o cliente aceitar).",
  unavailable_api: "Não foi possível verificar o estoque no sistema agora: transfira para um atendente confirmar (action handoff).",
  produto_nao_encontrado: "Nenhum produto dessa marca/categoria foi encontrado no catálogo. Pergunte qual modelo ou referência o cliente procura ou transfira para um atendente (action handoff).",
} as const;

/** floor: ticket mínimo das sugestões por iniciativa da IA (não vem do cliente; nunca aparece como "faixa pedida"). */
export type PriceFilter = { minPrice?: number; maxPrice?: number; sortBy?: "price_asc" | "price_desc" | "relevance"; floor?: number };

/** Mesmo modelo em linhas diferentes (variantes de cor/código com o mesmo nome/referência): fica só a primeira. */
export function distinctModels(models: ShowcaseModel[]) {
  const seen = new Set<string>();
  return models.filter((model) => {
    // Referência comercial identifica o modelo; sem ela, o nome (só a marca no nome não basta: aí vale o código).
    const ref = model.referencia && !model.referencia.startsWith("#") ? `ref:${norm(model.referencia)}` : "";
    const keys = [ref, ...model.codigos.map((code) => `cod:${code}`)].filter(Boolean);
    if (keys.some((key) => seen.has(key))) return false;
    keys.forEach((key) => seen.add(key));
    return true;
  });
}

/**
 * Ticket mínimo: sugestões a partir do piso. Se nada com estoque alcança o piso, mostra o que há, do mais caro
 * para o mais barato (nunca prioriza os mais baratos).
 */
export function applyTicketFloor(models: ShowcaseModel[], floor?: number) {
  if (!floor) return models;
  const above = models.filter((model) => (priceNumber(model.precoVenda) ?? 0) >= floor);
  if (above.length) return above;
  return [...models].sort((a, b) => (priceNumber(b.precoVenda) ?? -1) - (priceNumber(a.precoVenda) ?? -1));
}

/** "R$ 1.070,00" → 1070. */
export const priceNumber = (text: string | null | undefined) => {
  if (!text) return null;
  const value = Number(text.replace(/[^\d,]/g, "").replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : null;
};

/** Mantém só os modelos dentro da faixa (sem preço fica de fora quando há faixa) e ordena por preço se pedido. */
export function applyPriceFilter(models: ShowcaseModel[], price?: PriceFilter) {
  if (!price) return models;
  const { minPrice, maxPrice, sortBy } = price;
  const ranged = minPrice || maxPrice
    ? models.filter((model) => {
      const value = priceNumber(model.precoVenda);
      return value !== null && (!minPrice || value >= minPrice) && (!maxPrice || value <= maxPrice);
    })
    : [...models];
  if (sortBy === "price_asc" || sortBy === "price_desc") {
    const direction = sortBy === "price_asc" ? 1 : -1;
    // Sem preço sempre no fim.
    ranged.sort((a, b) => {
      const [x, y] = [priceNumber(a.precoVenda), priceNumber(b.precoVenda)];
      if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
      return (x - y) * direction;
    });
  }
  return ranged;
}

/** Até `perBrand` modelos de cada marca, na ordem recebida. */
export function diverseByBrand(models: ShowcaseModel[], perBrand: number) {
  const count = new Map<string, number>();
  return models.filter((model) => {
    const brand = norm(model.nomeComercial).split(" ")[0] ?? "";
    const used = count.get(brand) ?? 0;
    count.set(brand, used + 1);
    return used < perBrand;
  });
}

/** Orientação da vitrine de orçamento: a IA escreve a abertura e o argumento de venda (sem pergunta pronta). */
export const BUDGET_SHOWCASE_GUIDANCE = "Busca por orçamento: comece com um comentário curto e natural, com suas palavras, ligando as opções à cidade e ao valor que o cliente comentou; depois copie vitrineFormatada exatamente como veio (sem inventar material, cor ou preço; o sistema transforma em fotos com legenda). Como consultora, diga em poucas palavras por que 2 ou 3 delas valem a pena (custo-benefício, marca, estilo; nada inventado). Em armação de grau, lembre com naturalidade que as lentes são orçadas conforme a receita. Se couber, uma pergunta leve após ---SPLIT---, escrita do zero (nunca fechamento passivo de telemarketing).";

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export function priceRangeLabel(price?: PriceFilter) {
  if (!price?.minPrice && !price?.maxPrice) return "";
  if (price.minPrice && price.maxPrice) return `entre ${brl(price.minPrice)} e ${brl(price.maxPrice)}`;
  return price.maxPrice ? `até ${brl(price.maxPrice)}` : `acima de ${brl(price.minPrice!)}`;
}

/** Resultado da busca ampla: modelos distintos com saldo > 0 na rede (até 8, mais vendidos primeiro), com preço. */
export function buildShowcaseResult(input: {
  term: string;
  groups: ShowcaseCandidate[][];
  lookup: StockLookup | null;
  stores: Map<string, StoreInfo>;
  withPrices: boolean;
  city?: string;
  /** Marca real reconhecida (com erro de digitação ou não). */
  brand?: string | null;
  /** Faixa de valor e ordenação pedidas pelo cliente (preço de venda nas lojas com estoque). */
  price?: PriceFilter;
  /** Modelos já mostrados na conversa (códigos e "ref:"): saem antes do corte, para a vitrine trazer modelos novos. */
  exclude?: string[];
}): ShowcaseResult {
  const base = { tipoBusca: "marca_ampla" as const, termoBusca: input.term, regiao: "", regiaoReconhecida: false as const, produtos: [] as [], ...(input.brand ? { marcaResolvida: input.brand } : {}) };
  const brandMissing = input.brand ? `Não há modelos da marca ${input.brand} em estoque${input.city ? ` em ${input.city}` : ""} no momento: diga isso com clareza, sem listar produtos de outras marcas.` : "";
  if (!input.groups.length) return { ...base, cenario: "produto_nao_encontrado", modelos: [], vitrineFormatada: null, orientacao: brandMissing || SHOWCASE_GUIDANCE.produto_nao_encontrado, ...(input.brand ? { semEstoqueDaMarca: true } : {}) };
  if (!input.lookup || input.lookup.stockStatus === "unavailable_api") return { ...base, cenario: "unavailable_api", modelos: [], vitrineFormatada: null, orientacao: SHOWCASE_GUIDANCE.unavailable_api };
  const lookup = input.lookup;
  const models: ShowcaseModel[] = [];
  const fallbackOnly = new Set<ShowcaseModel>();
  for (const group of input.groups) {
    const stores = group.flatMap((product) => stockInCity(lookup.byCode[product.code] ?? [], input.stores, input.city));
    const total = stores.reduce((sum, store) => sum + store.quantidade, 0);
    if (total <= 0) continue;
    const withStock = group.filter((product) => stockInCity(lookup.byCode[product.code] ?? [], input.stores, input.city).length);
    const naming = commercialName(withStock[0].description, withStock[0].brand);
    // Preço de cada variante com estoque (o mais comum entre as lojas dela); variação → "a partir de" o menor.
    const prices = input.withPrices ? withStock.map((product) => mainPrice(stockInCity(lookup.byCode[product.code] ?? [], input.stores, input.city))).filter((price): price is string => !!price) : [];
    const toNumber = (text: string) => Number(text.replace(/[^\d,]/g, "").replace(",", "."));
    const distinct = [...new Set(prices)].sort((a, b) => toNumber(a) - toNumber(b));
    models.push({
      nomeComercial: naming.nomeComercial,
      referencia: naming.referencia ?? showcaseReference(withStock[0].description, withStock[0].brand, withStock[0].code),
      categoriaModelo: naming.categoriaModelo,
      precoVenda: distinct[0] ?? null,
      precoVaria: distinct.length > 1,
      totalDisponivelRede: Math.round(total * 100) / 100,
      codigos: withStock.map((product) => product.code),
      lojas: [...new Set(stores.map((store) => store.loja.split(" — ")[0].replace(/^Loja\s+/i, "").replace(/\s*\([^)]*\)\s*$/, "").trim()).filter(Boolean))],
    });
    if (!naming.referencia) fallbackOnly.add(models[models.length - 1]);
  }
  // Modelos com referência comercial do cadastro primeiro; código interno (#) por último; até 8.
  const rank = (model: ShowcaseModel) => (model.referencia?.startsWith("#") ? 2 : fallbackOnly.has(model) ? 1 : 0);
  models.sort((a, b) => rank(a) - rank(b));
  const priced = applyTicketFloor(distinctModels(applyPriceFilter(models, input.price)), input.price?.floor);
  // Busca por orçamento sem marca: no máximo 2 modelos por marca, para a vitrine ter variedade de verdade.
  const varied = (input.price?.minPrice || input.price?.maxPrice || input.price?.sortBy || input.price?.floor) && !input.brand ? diverseByBrand(priced, 2) : priced;
  models.splice(0, models.length, ...(varied.length >= 3 ? varied : priced));
  const excluded = new Set(input.exclude ?? []);
  if (excluded.size && models.length) {
    const fresh = models.filter((model) => !modelShownIds(model).some((id) => excluded.has(id)));
    if (!fresh.length) return { ...base, cenario: "todos_ja_mostrados", todosJaMostrados: true, modelos: [], vitrineFormatada: null, orientacao: "Todos os modelos com estoque desta busca já foram mostrados nesta conversa: NÃO repita nenhum. Diga com naturalidade que esses são os que a loja tem dessa linha agora e ofereça outro caminho (outra marca, outro estilo ou faixa de preço, ou conhecer de perto na loja mais próxima)." };
    models.splice(0, models.length, ...fresh);
  }
  const reserves = models.slice(SHOWCASE_MAX_MODELS, SHOWCASE_MAX_MODELS + SHOWCASE_RESERVES);
  models.splice(SHOWCASE_MAX_MODELS);
  const range = priceRangeLabel(input.price);
  if (!models.length && range) return { ...base, cenario: input.city ? "sem_estoque_na_cidade" : "sem_estoque_na_rede", modelos: [], vitrineFormatada: null, orientacao: `Não há modelos com estoque ${range}${input.city ? ` em ${input.city}` : ""} agora. Diga isso com naturalidade e ofereça as opções mais próximas do orçamento (nova busca sem o limite de valor) ou ajuda de um atendente.` };
  if (!models.length) return { ...base, cenario: input.city ? "sem_estoque_na_cidade" : "sem_estoque_na_rede", modelos: [], vitrineFormatada: null, orientacao: brandMissing || (input.city ? `Não há modelos disponíveis em ${input.city} no momento.` : SHOWCASE_GUIDANCE.sem_estoque_na_rede), ...(input.brand ? { semEstoqueDaMarca: true } : {}) };
  return {
    ...base,
    cenario: "disponivel_em_lojas",
    modelos: models,
    ...(reserves.length ? { reservas: reserves } : {}),
    vitrineFormatada: formatShowcase(models, { header: false }),
    orientacao: input.price?.minPrice || input.price?.maxPrice || input.price?.sortBy ? BUDGET_SHOWCASE_GUIDANCE : SHOWCASE_GUIDANCE.disponivel_em_lojas,
  };
}

/** Na busca ampla nenhuma foto é anexada; só a busca específica (com produto em estoque) libera a foto. */
export function allowsProductPhoto(result: { tipoBusca?: SearchKind }) {
  return result.tipoBusca !== "marca_ampla";
}

