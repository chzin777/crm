/**
 * Foto de produto enviada pelo cliente: a IA identifica o produto em silêncio (JSON interno), o CRM busca
 * no histórico de vendas do ERP e a resposta sai só com o resultado da busca, ou a conversa vai para a equipe.
 * Sem banco nem rede aqui: a busca e a chamada ao modelo entram por parâmetro (mesma lógica no WhatsApp e no teste).
 */

/** Regra fixa no código (não editável na tela): a IA nunca narra a imagem do cliente. */
export const IMAGE_RULE =
  'REGRA CRÍTICA SOBRE IMAGENS: NUNCA descreva, narre ou explique o que está na imagem enviada pelo cliente (proibido dizer "Pela imagem, parece ser...", "Vejo que você mandou um óculos...", "Na foto aparece..." etc.). O cliente já sabe o que enviou. Use a análise visual apenas internamente para identificar marca, modelo, tipo, cor e material; responda só com o resultado da busca no catálogo (modelos encontrados e lojas) ou encaminhe para o atendente responsável caso não encontre.';

/** Pedido interno de identificação (nunca chega ao cliente). */
export const VISION_PROMPT = [
  "Você classifica a imagem enviada por um cliente de ótica para uma busca no sistema. Não converse, só extraia dados.",
  'Responda em json: {"kind": "produto" | "receita" | "documento" | "outro", "category": "SOLAR" | "ARMACAO" | "LENTE_CONTATO" | "", "brand": "marca legível ou reconhecível com segurança, ou vazio", "reference": "código/referência legível na haste ou etiqueta, ou vazio", "material": "METAL" | "ACETATO" | "MISTO" | "TITANIO" | "NYLON" | "", "keywords": ["até 4 palavras em MAIÚSCULAS sem acento, ex.: DOURADO, AVIADOR, RETANGULAR, GATINHO"]}.',
  '"produto": óculos de sol, armação, lente de contato ou acessório. "receita": prescrição/receita oftalmológica ou laudo. "documento": orçamento, nota, print de texto. "outro": qualquer outra imagem.',
  "Marca só se tiver certeza (logotipo ou nome legível). Nunca invente referência.",
].join("\n");

export type VisionResult = { kind?: string; category?: string; brand?: string; reference?: string; material?: string; keywords?: unknown };
export type CatalogQuery = { category: "SOLAR" | "ARMACAO" | "LENTE_CONTATO" | ""; brand: string; reference: string; material: string; keywords: string[] };

/** Maiúsculas, sem acento e só letras/números: "Ray-Ban" e "RAY BAN" viram RAYBAN, como no SQL da busca. */
export const normalizeTerm = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export function readVision(raw: VisionResult): { kind: "produto" | "receita" | "documento" | "outro"; query: CatalogQuery } {
  const kind = raw.kind === "produto" || raw.kind === "receita" || raw.kind === "documento" ? raw.kind : "outro";
  const category = raw.category === "SOLAR" || raw.category === "ARMACAO" || raw.category === "LENTE_CONTATO" ? raw.category : "";
  const clean = (value: unknown) => (typeof value === "string" ? value.trim().slice(0, 40) : "");
  const keywords = Array.isArray(raw.keywords) ? raw.keywords.map(clean).filter((word) => normalizeTerm(word).length >= 3).slice(0, 4) : [];
  return { kind, query: { category, brand: clean(raw.brand), reference: clean(raw.reference), material: clean(raw.material).toUpperCase(), keywords } };
}

/** Um passo da cascata: todos os termos precisam aparecer (marca, descrição ou subcategoria). */
export type SearchStep = { label: string; category: CatalogQuery["category"]; terms: string[] };

/**
 * Cascata: marca + referência → referência → marca + material → marca → palavras-chave combinadas
 * (tirando a menos importante até sobrar uma). Só categoria não basta: sem termo, não há busca.
 */
export function searchSteps(query: CatalogQuery): SearchStep[] {
  const steps: SearchStep[] = [];
  const add = (terms: string[], category: CatalogQuery["category"] = query.category) => {
    const clean = [...new Set(terms.map(normalizeTerm).filter((term) => term.length >= 2))];
    if (!clean.length) return;
    const label = [category && CATEGORY_LABEL[category], ...terms.filter((term) => normalizeTerm(term).length >= 2)].filter(Boolean).join(" + ");
    if (!steps.some((step) => step.category === category && step.terms.join() === clean.join())) steps.push({ label, category, terms: clean });
  };
  const brand = query.brand;
  const reference = normalizeTerm(query.reference).length >= 4 ? query.reference : "";
  if (brand && reference) add([brand, reference], "");
  if (reference) add([reference], "");
  if (brand && query.material) add([brand, query.material]);
  if (brand) add([brand]);
  if (!brand) {
    const words = [query.material, ...query.keywords].filter(Boolean);
    for (let size = words.length; size >= 1; size -= 1) add(words.slice(0, size));
  }
  return steps;
}

const CATEGORY_LABEL: Record<Exclude<CatalogQuery["category"], "">, string> = { SOLAR: "ÓCULOS SOLAR", ARMACAO: "ARMAÇÃO", LENTE_CONTATO: "LENTES DE CONTATO" };
/** Categoria do ERP para o filtro (comparada normalizada). */
export const CATEGORY_FILTER: Record<Exclude<CatalogQuery["category"], "">, string> = { SOLAR: "OCULOSSOLAR", ARMACAO: "ARMACAO", LENTE_CONTATO: "LENTESDECONTATO" };

export type CatalogProduct = { description: string; brand: string | null; category: string | null; sales: number; price: number | null; stores: string[] };
/** stock "ok": stores são as lojas de varejo com saldo agora (API do VMSet); sem isso, lojas onde o modelo foi vendido. */
export type CatalogSearch = { term: string; results: CatalogProduct[]; stock?: "ok" | "unavailable_api" };
/** Registro da busca mostrado no teste da página /ia. */
export type SearchLog = { kind: string; term: string; found: number };

export function formatCatalogResults(search: CatalogSearch, withPrices: boolean) {
  const live = search.stock === "ok";
  const lines = search.results.map((product) => {
    const price = withPrices && product.price ? ` · preço médio R$ ${product.price.toFixed(2)}` : "";
    const where = live ? (product.stores.length ? `com estoque agora em: ${product.stores.join("; ")}` : "sem estoque nas lojas no momento") : `vendido recentemente em: ${product.stores.join("; ") || "lojas não informadas"}`;
    return `- ${product.description}${product.brand ? ` (${product.brand})` : ""}${price} · ${where}`;
  });
  const source = live ? "saldo em tempo real por loja de varejo" : "o estoque não pôde ser verificado agora: lojas onde o modelo foi vendido nos últimos 2 anos";
  return `Resultado da busca no catálogo do ERP para "${search.term}" (${source}):\n${lines.join("\n")}`;
}

export const CATALOG_MISS_REPLY = "Não localizei esse modelo exato no nosso sistema agora. Vou encaminhar para o atendente responsável verificar a disponibilidade nas lojas e já te retorna, tudo bem?";
export const PRESCRIPTION_REPLY = "Recebi! Vou encaminhar para o atendente responsável conferir com cuidado e já te retorna, tudo bem?";

/** Instrução da resposta quando a busca achou produtos (a imagem não vai junto: só o resultado). */
export const CATALOG_FOUND_RULE =
  "O cliente enviou a foto de um produto e a busca no catálogo encontrou os modelos abaixo. Responda direto, como vendedora: apresente até 3 modelos encontrados e as lojas com estoque agora, seguindo as REGRAS DE ESTOQUE. Se o resultado disser que o estoque não pôde ser verificado, cite as lojas onde o modelo é vendido e ofereça um atendente para confirmar. Não descreva a foto.";

export type ImageFlowResult =
  | { type: "handoff"; reason: string; reply: string; trigger: "catalog_miss" | "prescription"; log: SearchLog }
  | { type: "found"; context: string; log: SearchLog }
  | { type: "continue"; log: SearchLog | null };

/**
 * Fluxo da foto: identifica (modelo) → receita/documento vai para a equipe → produto busca no catálogo →
 * achou: contexto com o resultado; não achou: transbordo. Outra imagem segue o atendimento normal.
 */
export async function productImageFlow(deps: {
  identify: () => Promise<VisionResult>;
  search: (steps: SearchStep[]) => Promise<CatalogSearch | null>;
  withPrices: boolean;
}): Promise<ImageFlowResult> {
  const { kind, query } = readVision(await deps.identify());
  if (kind === "receita" || kind === "documento") {
    return { type: "handoff", trigger: "prescription", reply: PRESCRIPTION_REPLY, reason: kind === "receita" ? "Cliente enviou receita: precisa de conferência humana" : "Cliente enviou documento: precisa de conferência humana", log: { kind, term: "", found: 0 } };
  }
  if (kind !== "produto") return { type: "continue", log: { kind, term: "", found: 0 } };
  const steps = searchSteps(query);
  const result = steps.length ? await deps.search(steps) : null;
  const term = result?.term ?? steps[0]?.label ?? (query.category ? CATEGORY_LABEL[query.category] : "produto sem marca ou característica");
  if (!result?.results.length) {
    return { type: "handoff", trigger: "catalog_miss", reply: CATALOG_MISS_REPLY, reason: `Foto de produto sem correspondência no catálogo (busca: ${term})`, log: { kind, term, found: 0 } };
  }
  return { type: "found", context: formatCatalogResults(result, deps.withPrices), log: { kind, term, found: result.results.length } };
}

/** Produto distinto do histórico de vendas, com o texto já normalizado para a busca. */
export type IndexedProduct = { code?: string | null; description: string; brand: string | null; category: string | null; sales: number; price: number | null; text: string; categoryKey: string };

export function indexProduct(row: { code?: string | null; description: string; brand: string | null; category: string | null; subcategory: string | null; sales: number; price: number | null }): IndexedProduct {
  return { code: row.code ?? null, description: row.description, brand: row.brand, category: row.category, sales: row.sales, price: row.price, text: normalizeTerm(`${row.brand ?? ""} ${row.description} ${row.subcategory ?? ""}`), categoryKey: normalizeTerm(row.category ?? "") };
}

/** Produtos que têm todos os termos do passo (e a categoria, se houver), mais vendidos primeiro. */
export function matchProducts(products: IndexedProduct[], step: SearchStep, limit = 6) {
  const category = step.category ? CATEGORY_FILTER[step.category] : "";
  return products
    .filter((product) => (!category || product.categoryKey === category) && step.terms.every((term) => product.text.includes(term)))
    .sort((a, b) => b.sales - a.sales)
    .slice(0, limit);
}
