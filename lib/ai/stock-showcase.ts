/**
 * Busca ampla (só marca ou categoria: "tem Ray-Ban?", "quais armações femininas?") x busca específica (modelo ou
 * referência: "tem o Ray-Ban Justin?"). Na ampla, a tool devolve uma vitrine enxuta de modelos distintos com estoque
 * (nome + preço, sem foto e sem lojas); na específica, o detalhamento por loja com foto e ficha. Sem banco nem rede.
 */
import { commercialName } from "@/lib/ai/product-card";
import { expandModelNicknames, KNOWN_BRANDS } from "@/lib/ai/product-names";
import { mainPrice, retailStock, type StockLookup, type StoreInfo } from "@/lib/ai/stock";
import { modelFamilyKey } from "@/lib/ai/product-names";

export type SearchKind = "marca_ampla" | "modelo_especifico";

/** Modelos na vitrine da busca ampla. */
export const SHOWCASE_MAX_MODELS = 8;
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
]);

// "Meta" é modelo (Ray-Ban Meta), não marca para vitrine.
const NOT_BROAD = new Set(["META", "RAYBANMETA"]);
const BRAND_KEYS = new Set(KNOWN_BRANDS.map(compact).filter((key) => !NOT_BROAD.has(key)));

/** Palavras do termo que sobram depois de tirar pedido/tipo/público ("Óculos Ray-Ban de sol" → ["RAY", "BAN"]). */
export function modelWords(term: string) {
  return norm(term).split(" ").filter((word) => word && !GENERIC.has(word));
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
export type ShowcaseModel = { nomeComercial: string; referencia: string | null; categoriaModelo: string | null; precoVenda: string | null; /** Cores/lentes com preços diferentes: a vitrine mostra "a partir de" o menor. */ precoVaria?: boolean; totalDisponivelRede: number; codigos: string[] };
export type ShowcaseResult = {
  tipoBusca: "marca_ampla";
  cenario: "disponivel_em_lojas" | "sem_estoque_na_rede" | "unavailable_api" | "produto_nao_encontrado";
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
export function showcaseCandidates<T extends ShowcaseCandidate>(products: T[]) {
  const groups = new Map<string, T[]>();
  for (const product of products) {
    // Família pelo código-base da referência: "RB4165L" e "4165L" são o mesmo modelo na vitrine; sem "REF", a
    // referência de cadastro ("OPBR 455") junta as cores do mesmo modelo.
    const fallback = fallbackReference(product.description, product.brand);
    const key = modelFamilyKey(product.description, product.brand) ?? (fallback ? `${compact(product.brand ?? "")}|${compact(fallback)}` : compact(product.description));
    const group = groups.get(key);
    if (group) group.push(product);
    else if (groups.size < SHOWCASE_CANDIDATES) groups.set(key, [product]);
  }
  return [...groups.values()].map((group) => group.slice(0, SHOWCASE_CODES_PER_MODEL));
}

const SHOWCASE_QUESTION_MANY = "Gostaria de ver a foto, lojas disponíveis e mais detalhes de algum desses modelos?";
const SHOWCASE_QUESTION_ONE = "Gostaria de ver a foto, lojas disponíveis e mais detalhes desse modelo?";
export const showcaseQuestion = (count: number) => (count === 1 ? SHOWCASE_QUESTION_ONE : SHOWCASE_QUESTION_MANY);

/** Vitrine no padrão do negócio: cabeçalho com a marca e uma linha "🕶️ *Nome (Ref. X)* — R$ ..." por modelo. */
export function formatShowcase(models: ShowcaseModel[]) {
  if (!models.length) return null;
  const brands = new Set(models.map((model) => model.nomeComercial.split(" ")[0]));
  const brand = brands.size === 1 ? commonBrand(models) : null;
  const header = models.length === 1
    ? `Temos este modelo${brand ? ` *${brand}*` : ""} disponível em estoque:`
    : `Temos vários modelos${brand ? ` *${brand}*` : ""} disponíveis em estoque! Confira alguns deles:`;
  // Numerada para o cliente escolher rápido ("o 1", "o segundo"); a sessão guarda a ordem (listedProducts).
  const lines = models.map((model, index) => {
    const icon = /sol/i.test(model.categoriaModelo ?? "") || !model.categoriaModelo ? "🕶️" : /lente/i.test(model.categoriaModelo) ? "👁️" : "👓";
    const name = `${model.nomeComercial}${model.referencia ? ` (Ref. ${model.referencia})` : ""}`;
    return `${index + 1}. ${icon} *${name}*${model.precoVenda ? ` — ${model.precoVaria ? "a partir de " : ""}${model.precoVenda}` : ""}`;
  });
  return [header, "", ...lines].join("\n");
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
  disponivel_em_lojas: "Busca ampla (só marca/categoria): use o campo vitrineFormatada exatamente como veio (sem reescrever, sem acrescentar lojas, quantidades ou descrições) como 1ª bolha; depois ---SPLIT--- e a pergunta: \"%Q\". Não mande foto nem lista de lojas nesta etapa.",
  sem_estoque_na_rede: "Nenhum modelo dessa marca/categoria tem estoque na rede agora. Diga isso com naturalidade e ofereça transferir para um atendente verificar encomenda ou similares (action handoff se o cliente aceitar).",
  unavailable_api: "Não foi possível verificar o estoque no sistema agora: transfira para um atendente confirmar (action handoff).",
  produto_nao_encontrado: "Nenhum produto dessa marca/categoria foi encontrado no catálogo. Pergunte qual modelo ou referência o cliente procura ou transfira para um atendente (action handoff).",
} as const;

/** Resultado da busca ampla: modelos distintos com saldo > 0 na rede (até 8, mais vendidos primeiro), com preço. */
export function buildShowcaseResult(input: {
  term: string;
  groups: ShowcaseCandidate[][];
  lookup: StockLookup | null;
  stores: Map<string, StoreInfo>;
  withPrices: boolean;
  /** Marca real reconhecida (com erro de digitação ou não). */
  brand?: string | null;
}): ShowcaseResult {
  const base = { tipoBusca: "marca_ampla" as const, termoBusca: input.term, regiao: "", regiaoReconhecida: false as const, produtos: [] as [], ...(input.brand ? { marcaResolvida: input.brand } : {}) };
  const brandMissing = input.brand ? `Não há modelos da marca ${input.brand} em estoque no momento: diga isso com clareza (sem listar produtos de outras marcas) e ofereça outras marcas ou um atendente para verificar encomenda.` : "";
  if (!input.groups.length) return { ...base, cenario: "produto_nao_encontrado", modelos: [], vitrineFormatada: null, orientacao: brandMissing || SHOWCASE_GUIDANCE.produto_nao_encontrado, ...(input.brand ? { semEstoqueDaMarca: true } : {}) };
  if (!input.lookup || input.lookup.stockStatus === "unavailable_api") return { ...base, cenario: "unavailable_api", modelos: [], vitrineFormatada: null, orientacao: SHOWCASE_GUIDANCE.unavailable_api };
  const lookup = input.lookup;
  const models: ShowcaseModel[] = [];
  const fallbackOnly = new Set<ShowcaseModel>();
  for (const group of input.groups) {
    const stores = group.flatMap((product) => retailStock(lookup.byCode[product.code] ?? [], input.stores));
    const total = stores.reduce((sum, store) => sum + store.quantidade, 0);
    if (total <= 0) continue;
    const withStock = group.filter((product) => retailStock(lookup.byCode[product.code] ?? [], input.stores).length);
    const naming = commercialName(withStock[0].description, withStock[0].brand);
    // Preço de cada variante com estoque (o mais comum entre as lojas dela); variação → "a partir de" o menor.
    const prices = input.withPrices ? withStock.map((product) => mainPrice(retailStock(lookup.byCode[product.code] ?? [], input.stores))).filter((price): price is string => !!price) : [];
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
    });
    if (!naming.referencia) fallbackOnly.add(models[models.length - 1]);
  }
  // Modelos com referência comercial do cadastro primeiro; código interno (#) por último; até 8.
  const rank = (model: ShowcaseModel) => (model.referencia?.startsWith("#") ? 2 : fallbackOnly.has(model) ? 1 : 0);
  models.sort((a, b) => rank(a) - rank(b));
  models.splice(SHOWCASE_MAX_MODELS);
  if (!models.length) return { ...base, cenario: "sem_estoque_na_rede", modelos: [], vitrineFormatada: null, orientacao: brandMissing || SHOWCASE_GUIDANCE.sem_estoque_na_rede, ...(input.brand ? { semEstoqueDaMarca: true } : {}) };
  return {
    ...base,
    cenario: "disponivel_em_lojas",
    modelos: models,
    vitrineFormatada: formatShowcase(models),
    orientacao: SHOWCASE_GUIDANCE.disponivel_em_lojas.replace("%Q", showcaseQuestion(models.length)),
  };
}

/** Na busca ampla nenhuma foto é anexada; só a busca específica (com produto em estoque) libera a foto. */
export function allowsProductPhoto(result: { tipoBusca?: SearchKind }) {
  return result.tipoBusca !== "marca_ampla";
}

/** Regra fixa do prompt: as 2 etapas (descoberta → detalhamento), com os exemplos literais. */
export const BROAD_SEARCH_RULES = [
  "BUSCA AMPLA x BUSCA ESPECÍFICA (regra fixa, 2 etapas):",
  "Etapa 1 — descoberta: o cliente perguntou só pela marca ou por um tipo (\"tem rayban?\", \"quais modelos da Oakley vocês têm?\", \"quais armações femininas têm?\"). Chame consultarEstoqueProduto com tipoBusca \"marca_ampla\" e termoBusca só com a marca/categoria. A ferramenta devolve vitrineFormatada (modelos distintos com estoque e preço): copie exatamente como 1ª bolha, SEM foto e SEM lista de lojas, e na 2ª bolha pergunte qual modelo ele quer ver. Exemplo:",
  "Temos vários modelos *Ray-Ban* disponíveis em estoque! Confira alguns deles:\n\n1. 🕶️ *Ray-Ban Justin (Ref. RB4165)* — R$ 1.210,27\n2. 🕶️ *Ray-Ban Aviator Classic (Ref. RB3025)* — R$ 1.150,00\n3. 🕶️ *Ray-Ban Erika (Ref. RB4171)* — R$ 980,00\n\n---SPLIT---\n\nGostaria de ver a foto, lojas disponíveis e mais detalhes de algum desses modelos?",
  "Depois da vitrine, \"o 1\", \"esse primeiro\", \"o segundo\", \"o último\" ou \"o de R$ 830\" são escolhas de um item da lista: NUNCA chame marca_ampla de novo nem repita a vitrine; abra o item escolhido com modelo_especifico e a referência dele. Se o preço citado servir para mais de um item, pergunte qual número ou referência o cliente quer ver.",
  "Se o termo tiver nome de modelo ou referência junto da marca (\"Ray-Ban Justin\", \"Oakley Holbrook\", \"RB4165\"), é SEMPRE modelo_especifico, nunca marca_ampla.",
  "Etapa 2 — detalhamento: o cliente escolheu um modelo da vitrine (\"me manda foto do Justin\", \"quero saber mais do Erika\") ou já perguntou direto por um modelo/referência. Chame consultarEstoqueProduto com tipoBusca \"modelo_especifico\" e termoBusca com a marca + a referência EXATA exibida na vitrine (ex.: \"Ray-Ban RB3025L\" para \"Ray-Ban Aviator Classic (Ref. RB3025L)\"), para o preço do card bater com a lista; sem vitrine anterior, marca + modelo (ex.: \"Ray-Ban Justin\"). A foto vai anexada e a resposta é a ficha completa (fichaFormatada, com estoque e lojas) + ---SPLIT--- + pergunta de continuação no singular ou plural conforme as lojas.",
].join("\n");
