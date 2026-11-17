import { formatBrl } from "@/lib/ai/stock";
import { documentKind, EXTRACTION_SCHEMA, formatExtraction, type DocumentExtraction, type DocumentKind } from "@/lib/ai/document-extract";
import { iconicModel } from "@/lib/ai/product-names";
import { formatShowcase, type ShowcaseModel } from "@/lib/ai/stock-showcase";
/**
 * Foto de produto enviada pelo cliente: a IA identifica o produto em silêncio (JSON interno), o CRM busca
 * no histórico de vendas do ERP e a resposta sai só com o resultado da busca, ou a conversa vai para a equipe.
 * Sem banco nem rede aqui: a busca e a chamada ao modelo entram por parâmetro (mesma lógica no WhatsApp e no teste).
 */

/** Regra fixa no código (não editável na tela): a IA nunca narra a imagem do cliente. */
export const IMAGE_RULE =
  'REGRA CRÍTICA SOBRE IMAGENS: NUNCA narre a imagem enviada pelo cliente (proibido dizer "Pela imagem, parece ser...", "Vejo que você mandou um óculos...", "Na foto aparece..." etc.). O cliente já sabe o que enviou. Use a análise visual para identificar marca, linha, modelo, tipo, formato e cor e responda com o resultado da busca no catálogo (modelos encontrados e lojas). Pode nomear o modelo identificado ("Esse modelo é um *Prada Linea Rossa*...") quando o cliente perguntar o nome, a marca ou o tipo, ou quando a referência exata não estiver em estoque e você mostrar os modelos da mesma marca/linha. Nunca diga que a marca toda está sem estoque por causa de uma referência.';

/** Pedido interno de identificação (nunca chega ao cliente). */
export const VISION_PROMPT = [
  "Você classifica a imagem enviada por um cliente de ótica para uma busca no sistema. Não converse, só extraia dados.",
  'Transcreva todo texto visível, inclusive títulos, legendas de anúncios, prints, etiquetas e texto sobreposto, em "textoVisivelNaImagem". Um print de anúncio com óculos é "produto", não "documento". Extraia "marca", "nomeModelo" (nome comercial lido ou reconhecido com segurança pelo design), "referenciaOuSku" (somente código legível, ou null) e "corLenteEArmacao". Não invente referências nem modelos incertos.',
  'Responda em json: {"kind": "produto" | "receita" | "documento" | "outro", "category": "SOLAR" | "ARMACAO" | "LENTE_CONTATO" | "", "marca": "marca legível ou reconhecível com segurança (ex.: Prada), ou vazio", "linha": "linha/submarca reconhecível (ex.: Linea Rossa), ou vazio", "modeloOuReferenciaProvavel": "código/referência LEGÍVEL na haste, lente ou etiqueta (ex.: PS 07RV), ou null", "caracteristicasVisuais": {"tipo": "Armação de grau" | "Óculos de sol" | "", "formato": "ex.: Retangular, Gatinho, Aviador, Redondo, Esportivo", "cor": "ex.: Preto fosco, Tartaruga, Metal dourado"}, "material": "METAL" | "ACETATO" | "MISTO" | "TITANIO" | "NYLON" | "", "keywords": ["até 4 palavras em MAIÚSCULAS sem acento, ex.: DOURADO, AVIADOR, RETANGULAR, GATINHO"]}.',
  '"produto": óculos de sol, armação, lente de contato ou acessório, inclusive anúncios e prints que os apresentem. "receita": prescrição/receita oftalmológica ou laudo. "documento": comprovante de pagamento, orçamento, nota ou outro print sem produto. "outro": qualquer outra imagem.',
  'Marca só se tiver certeza (logotipo ou nome legível); linha separada da marca ("Prada" + "Linea Rossa"). Referência só se estiver legível na foto; se não der para ler, null. Nunca chute nem invente código.',
  `Se kind for "receita" ou "documento", inclua também ${EXTRACTION_SCHEMA}`,
].join("\n");

export type VisionResult = {
  kind?: string; category?: string; brand?: string; reference?: string | null; material?: string; keywords?: unknown; documento?: DocumentExtraction;
  textoVisivelNaImagem?: string; nomeModelo?: string; referenciaOuSku?: string | null; corLenteEArmacao?: string;
  marca?: string; linha?: string; modeloOuReferenciaProvavel?: string | null; caracteristicasVisuais?: { tipo?: string; formato?: string; cor?: string } | null;
};
export type CatalogQuery = { category: "SOLAR" | "ARMACAO" | "LENTE_CONTATO" | ""; brand: string; reference: string; material: string; keywords: string[]; line?: string; shape?: string; color?: string; model?: string; visibleText?: string };

/** Análise da última foto de produto do cliente (fica na sessão para "qual o nome desse modelo?"). */
export type ImageAnalysis = { marca: string; linha: string; modeloProvavel: string | null; tipo: string; formato: string; cor: string; descricaoVisual: string };

/** Maiúsculas, sem acento e só letras/números: "Ray-Ban" e "RAY BAN" viram RAYBAN, como no SQL da busca. */
export const normalizeTerm = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const BRAND_ALIASES: [string, string][] = [
  ["prada linea rossa", "Prada Linea Rossa"], ["prada linearossa", "Prada Linea Rossa"], ["linea rossa", "Prada Linea Rossa"],
  ["dolce & gabbana", "Dolce & Gabbana"], ["dolce gabbana", "Dolce & Gabbana"], ["dg", "Dolce & Gabbana"],
  ["emporio armani", "Emporio Armani"], ["carolina herrera", "Carolina Herrera"], ["carolinaherrera", "Carolina Herrera"],
  ["miu miu", "Miu Miu"], ["miu-miu", "Miu Miu"], ["miumiu", "Miu Miu"], ["mew mew", "Miu Miu"],
  ["ray ban", "Ray-Ban"], ["ray-ban", "Ray-Ban"], ["rayban", "Ray-Ban"], ["raiban", "Ray-Ban"],
  ["tom ford", "Tom Ford"], ["tomford", "Tom Ford"], ["michael kors", "Michael Kors"], ["ana hickmann", "Ana Hickmann"],
  ["bvlgari", "Bvlgari"], ["bulgari", "Bvlgari"], ["prada", "Prada"], ["vogue", "Vogue"], ["oakley", "Oakley"],
  ["armani", "Armani"], ["versace", "Versace"], ["burberry", "Burberry"], ["gucci", "Gucci"], ["fendi", "Fendi"],
  ["chanel", "Chanel"], ["dior", "Dior"], ["persol", "Persol"], ["tiffany", "Tiffany"], ["atitude", "Atitude"],
  ["speedo", "Speedo"], ["mormaii", "Mormaii"], ["hb", "HB"],
];

/** Substitui apenas palavras inteiras; aceita espaços, hífens e acentos da transcrição. */
export function normalizeBrandQuery(text: string): string {
  const plain = text.replace(/[\u00c0-\u024f]/g, (char) => char.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
  const aliases = [...BRAND_ALIASES].sort((a, b) => b[0].length - a[0].length);
  for (const [alias, brand] of aliases) {
    const pattern = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[\s-]+/g, "[\\s-]+");
    const match = new RegExp(`(^|[^a-zA-Z0-9])(${pattern})(?=$|[^a-zA-Z0-9])`, "i").exec(plain);
    if (match) return text.slice(0, match.index + match[1].length) + brand + text.slice(match.index + match[0].length);
  }
  return text;
}

export function explicitBrand(text: string): string | null {
  const normalized = normalizeBrandQuery(text);
  const plain = normalized.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const [, brand] of [...BRAND_ALIASES].sort((a, b) => b[1].length - a[1].length)) {
    const pattern = brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[\s-]+/g, "[\\s-]+");
    if (new RegExp(`(^|[^a-zA-Z0-9])${pattern}(?=$|[^a-zA-Z0-9])`, "i").test(plain)) return brand;
  }
  return null;
}

export function readVision(raw: VisionResult): { kind: "produto" | "receita" | "documento" | "outro"; query: CatalogQuery } {
  const kind = raw.kind === "produto" || raw.kind === "receita" || raw.kind === "documento" ? raw.kind : "outro";
  const category = raw.category === "SOLAR" || raw.category === "ARMACAO" || raw.category === "LENTE_CONTATO" ? raw.category : "";
  const clean = (value: unknown) => (typeof value === "string" ? value.trim().slice(0, 40) : "");
  const keywords = Array.isArray(raw.keywords) ? raw.keywords.map(clean).filter((word) => normalizeTerm(word).length >= 3).slice(0, 4) : [];
  const visual = raw.caracteristicasVisuais ?? {};
  // "Armação de grau"/"Óculos de sol" também definem a categoria quando o modelo não a mandou.
  const type = clean(visual.tipo);
  const inferred: CatalogQuery["category"] = category || (/sol/i.test(type) ? "SOLAR" : /grau|arma/i.test(type) ? "ARMACAO" : "");
  const visibleText = typeof raw.textoVisivelNaImagem === "string" ? raw.textoVisivelNaImagem.trim().slice(0, 4000) : "";
  const brand = clean(raw.marca || raw.brand);
  const iconic = iconicModel([raw.nomeModelo, raw.referenciaOuSku, visibleText].filter(Boolean).join(" "), brand);
  const model = clean(raw.nomeModelo) || iconic?.name || "";
  const reference = clean(raw.referenciaOuSku ?? raw.modeloOuReferenciaProvavel ?? raw.reference);
  return {
    kind,
    query: {
      category: inferred, brand: brand || (iconic ? "Ray-Ban" : ""), line: clean(raw.linha), model, visibleText,
      reference: /^(null|n\/?a|nenhum|nenhuma|ilegivel|ilegível)$/i.test(reference) ? "" : reference,
      material: clean(raw.material).toUpperCase(), keywords, shape: clean(visual.formato), color: clean(raw.corLenteEArmacao || visual.cor),
    },
  };
}

/** Análise legível da foto (marca, linha, referência provável e características) para a sessão e as respostas. */
export function imageAnalysis(query: CatalogQuery): ImageAnalysis {
  const tipo = query.category === "SOLAR" ? "Óculos de sol" : query.category === "ARMACAO" ? "Armação de grau" : query.category === "LENTE_CONTATO" ? "Lente de contato" : "";
  const formato = query.shape ?? "";
  const cor = query.color ?? "";
  const descricaoVisual = [tipo, formato && `formato ${formato.toLowerCase()}`, cor.toLowerCase()].filter(Boolean).join(", ");
  return { marca: query.brand, linha: [query.line, query.model].filter(Boolean).join(" "), modeloProvavel: query.reference || null, tipo, formato, cor, descricaoVisual };
}

/** Nome do modelo identificado: "Prada Linea Rossa" (marca + linha, sem repetir). */
export function analysisName(analysis: Pick<ImageAnalysis, "marca" | "linha">) {
  const { marca, linha } = analysis;
  if (!linha) return marca;
  return normalizeTerm(marca).includes(normalizeTerm(linha)) ? marca : `${marca} ${linha}`.trim();
}

/** Análise recebida de fora (teste da página /ia): só campos de texto curtos. */
export function sanitizeImageAnalysis(value: unknown): ImageAnalysis | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const text = (key: string) => (typeof raw[key] === "string" ? (raw[key] as string).replace(/[\r\n]+/g, " ").trim().slice(0, 60) : "");
  const analysis: ImageAnalysis = { marca: text("marca"), linha: text("linha"), modeloProvavel: text("modeloProvavel") || null, tipo: text("tipo"), formato: text("formato"), cor: text("cor"), descricaoVisual: text("descricaoVisual") };
  return analysis.marca || analysis.descricaoVisual ? analysis : null;
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** Bloco do prompt: o que a IA sabe da última foto (responde nome/marca/tipo sem transferir). */
export function analysisPromptBlock(analysis: ImageAnalysis | null) {
  if (!analysis) return "";
  return [
    "ANÁLISE DA ÚLTIMA FOTO DE PRODUTO DO CLIENTE (interna, desta sessão):",
    `- Marca/linha: ${analysisName(analysis) || "não identificada"}`,
    `- Referência provável: ${analysis.modeloProvavel ?? "não legível na foto"}`,
    analysis.descricaoVisual ? `- Características: ${analysis.descricaoVisual}` : "",
    'Se o cliente perguntar o nome, a marca, o modelo ou se é de grau ou sol ("qual o nome desse modelo?", "que marca é essa?"), responda DIRETO com estes dados e ofereça os modelos em estoque. NUNCA transfira para um atendente por essa pergunta.',
  ].filter(Boolean).join("\n");
}

/** Resposta direta a "qual o nome desse modelo?" com a análise da foto (sem transferir). */
export function analysisAnswer(analysis: ImageAnalysis) {
  const name = analysisName(analysis);
  const style = analysis.descricaoVisual ? ` (${lowerFirst(analysis.descricaoVisual)})` : "";
  const ref = analysis.modeloProvavel ? ` A referência que aparece é *${analysis.modeloProvavel}*.` : " A referência exata não dá para ler na foto.";
  if (!name) return `É ${lowerFirst(analysis.descricaoVisual) || "um óculos"}, mas a marca não aparece com clareza.${ref} Se puder, me manda uma foto da parte de dentro da haste que eu confirmo pra você 😊`;
  return `Esse modelo é um *${name}*${style} 😊${ref}\n---SPLIT---\nQuer que eu te mostre os modelos *${name}* que temos em estoque?`;
}

/** Regra fixa do prompt: pergunta informativa sobre produto é respondida, nunca transferida. */
export const PRODUCT_INFO_RULE =
  'PERGUNTAS INFORMATIVAS SOBRE PRODUTO (regra fixa): se o cliente perguntar o nome, a marca, o modelo, a referência, se é de grau ou sol ou quanto custa o óculos da foto ou de um produto ("Qual o nome desse modelo?", "Que marca é essa?", "É de grau ou sol?", "Quanto custa esse?"), responda DIRETO usando a análise da foto desta sessão e/ou consultarEstoqueProduto. NUNCA transfira para atendente por esse tipo de pergunta. Transbordo por indisponibilidade só quando o cliente pedir explicitamente para encomendar um modelo esgotado ou falar com um vendedor depois de ver as opções.';

/** Resposta quando não há análise de foto nem produto em foco para responder a pergunta informativa. */
export const PRODUCT_INFO_FALLBACK = "Me conta qual modelo você quer saber? Se puder, me manda uma foto da parte de dentro da haste ou a referência, que eu te digo o nome, o preço e onde tem 😊";

const PRODUCT_INFO = /\b(qual|quais|que|q)\s+(e\s+|eh\s+|seria\s+)?(o\s+|a\s+)?(nome|marca|modelo|referencia|ref|linha|cor|material|formato|valor|preco)\b|\bcomo\s+(que\s+)?(se\s+)?chama\b|\b(e|eh)\s+(de\s+)?grau\s+ou\s+(de\s+)?sol\b|\b(de\s+)?grau\s+ou\s+(de\s+)?sol\b|\bquanto\s+(custa|e|eh|sai|fica|ta|esta)\b|\b(que|qual)\s+(oculos|armacao)\s+(e|eh)\b/;

/** "Qual o nome desse modelo?", "Que marca é essa?", "É de grau ou sol?", "Quanto custa esse?". */
export function asksProductInfo(text: string) {
  const plain = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return PRODUCT_INFO.test(plain);
}

/**
 * Trava no código: o modelo quis transferir (ou ficou sem resposta) diante de uma pergunta informativa sobre o
 * produto ou logo depois da foto, sem o cliente pedir uma pessoa → responde com a análise da foto em vez de transferir.
 */
export function informativeReply(outcome: { action: string; trigger: string }, input: { pendingText: string; askedHuman: boolean; queued: boolean; photoThisTurn: boolean; analysis: ImageAnalysis | null }) {
  if (outcome.action !== "handoff" || (outcome.trigger !== "ai" && outcome.trigger !== "no_reply")) return null;
  if (input.askedHuman || input.queued) return null;
  if (!asksProductInfo(input.pendingText) && !input.photoThisTurn) return null;
  return input.analysis ? analysisAnswer(input.analysis) : PRODUCT_INFO_FALLBACK;
}

/** Abertura da vitrine quando a referência exata da foto não está em estoque, mas a marca/linha está. */
export function photoFallbackOpener(analysis: ImageAnalysis, family: string) {
  const name = analysisName(analysis) || family;
  const style = analysis.descricaoVisual ? ` (${lowerFirst(analysis.descricaoVisual)})` : "";
  return `Esse modelo da foto é um *${name}*${style}! No momento não localizei essa referência exata em estoque, mas temos estes modelos *${family}* disponíveis na rede:`;
}

/** Um passo da cascata: todos os termos precisam aparecer (marca, descrição ou subcategoria). */
export type SearchStep = {
  label: string; category: CatalogQuery["category"]; terms: string[];
  /** referencia: a referência da foto; marca: mesma marca/linha; caracteristicas: sem marca. */
  kind?: "referencia" | "marca" | "caracteristicas";
  /** Termos originais ("Prada Linea Rossa"), usados na consulta de estoque. */
  query?: string;
};

/** Variantes da referência: "0PS 07RV" também vale "PS07RV" (prefixo 0 do ERP); espaços e hífens não contam. */
export function referenceVariants(reference: string) {
  const key = normalizeTerm(reference);
  if (key.length < 4) return [];
  return /^0[A-Z]/.test(key) ? [key, key.slice(1)] : [key];
}

/**
 * Cascata: marca + referência → referência → marca + material → marca → palavras-chave combinadas
 * (tirando a menos importante até sobrar uma). Só categoria não basta: sem termo, não há busca.
 */
export function searchSteps(query: CatalogQuery): SearchStep[] {
  const steps: SearchStep[] = [];
  const add = (terms: string[], category: CatalogQuery["category"], kind: NonNullable<SearchStep["kind"]>, shown = terms) => {
    const clean = [...new Set(terms.map(normalizeTerm).filter((term) => term.length >= 2))];
    if (!clean.length) return;
    const words = shown.filter((term) => normalizeTerm(term).length >= 2);
    const label = [category && CATEGORY_LABEL[category], ...words].filter(Boolean).join(" + ");
    if (!steps.some((step) => step.category === category && step.terms.join() === clean.join())) steps.push({ label, category, terms: clean, kind, query: words.join(" ") });
  };
  const brand = query.brand;
  const line = query.line && !normalizeTerm(brand).includes(normalizeTerm(query.line)) ? query.line : "";
  // Passo 1: referência legível na foto (com e sem o prefixo 0 do ERP), com e sem a marca.
  const variants = referenceVariants(query.reference);
  for (const variant of variants) if (brand) add([brand, variant], "", "referencia", [brand, query.reference]);
  for (const variant of variants) add([variant], "", "referencia", [query.reference]);
  // Passo 2: mesma marca/linha, no mesmo tipo (grau ou sol) quando identificado.
  if (brand && line) add([brand, line], query.category, "marca");
  if (brand && query.material && !line) add([brand, query.material], query.category, "marca");
  if (brand) add([brand], query.category, "marca");
  if (!brand) {
    const words = [query.material, ...query.keywords].filter(Boolean);
    for (let size = words.length; size >= 1; size -= 1) add(words.slice(0, size), query.category, "caracteristicas");
  }
  return steps;
}

const CATEGORY_LABEL: Record<Exclude<CatalogQuery["category"], "">, string> = { SOLAR: "ÓCULOS SOLAR", ARMACAO: "ARMAÇÃO", LENTE_CONTATO: "LENTES DE CONTATO" };
/** Categoria do ERP para o filtro (comparada normalizada). */
export const CATEGORY_FILTER: Record<Exclude<CatalogQuery["category"], "">, string> = { SOLAR: "OCULOSSOLAR", ARMACAO: "ARMACAO", LENTE_CONTATO: "LENTESDECONTATO" };

export type CatalogProduct = { description: string; brand: string | null; category: string | null; sales: number; price: number | null; stores: string[] };
/** stock "ok": stores são as lojas de varejo com saldo agora (API do VMSet); sem isso, lojas onde o modelo foi vendido. */
export type CatalogSearch = { term: string; results: CatalogProduct[]; stock?: "ok" | "unavailable_api"; /** Passo da cascata que encontrou (referência exata ou marca/linha). */ step?: SearchStep };
/** Registro da busca mostrado no teste da página /ia. */
export type SearchLog = { kind: string; term: string; found: number };

export function formatCatalogResults(search: CatalogSearch, withPrices: boolean) {
  const live = search.stock === "ok";
  const lines = search.results.map((product) => {
    const price = withPrices && product.price ? ` · preço ${formatBrl(product.price)}` : "";
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
  /** Receita, comprovante ou outro documento: lido e resumido (quem decide o transbordo é o agente). */
  | { type: "document"; kind: DocumentKind; summary: string; log: SearchLog; extraction?: DocumentExtraction }
  /**
   * Produto com estoque: "exata" = a referência da foto (ficha completa); "linha" = referência fora de estoque ou
   * ilegível, mas a mesma marca/linha tem modelos (vitrine com a abertura que identifica a foto); "similar" = sem marca.
   */
  | { type: "found"; match: "exata" | "linha" | "similar"; context: string; log: SearchLog; analysis: ImageAnalysis; searchTerm: string; opener?: string }
  /** Marca identificada, mas nada dela com estoque agora: a IA informa e oferece opções (sem transferir sozinha). */
  | { type: "identified"; context: string; log: SearchLog; analysis: ImageAnalysis }
  | { type: "continue"; log: SearchLog | null };

/** Regra da resposta para cada resultado da foto (o código também garante a ficha/vitrine se o modelo não buscar). */
function photoContext(match: "exata" | "linha", analysis: ImageAnalysis, term: string, opener: string) {
  const known = [`marca/linha ${analysisName(analysis) || "não identificada"}`, `referência ${analysis.modeloProvavel ?? "não legível"}`, analysis.descricaoVisual].filter(Boolean).join("; ");
  if (match === "exata") {
    return `FOTO DE PRODUTO (análise interna: ${known}). A referência está em estoque: chame consultarEstoqueProduto com termoBusca "${term}" e tipoBusca "modelo_especifico" e envie a ficha completa (foto, preço e lojas).`;
  }
  return `FOTO DE PRODUTO (análise interna: ${known}). A referência exata da foto não está em estoque (ou não é legível), MAS há modelos ${term} em estoque na rede. Chame consultarEstoqueProduto com termoBusca "${term}" e tipoBusca "marca_ampla" e responda começando exatamente com: "${opener}" seguido da vitrine. NUNCA diga só que "o modelo está sem estoque" nem transfira para atendente.`;
}

/**
 * Fluxo da foto: identifica (modelo) → receita/documento vai para a equipe → produto busca no catálogo →
 * achou: contexto com o resultado; não achou: transbordo. Outra imagem segue o atendimento normal.
 */
export async function productImageFlow(deps: {
  identify: () => Promise<VisionResult>;
  search: (steps: SearchStep[]) => Promise<CatalogSearch | null>;
  withPrices: boolean;
}): Promise<ImageFlowResult> {
  const vision = await deps.identify();
  const { kind, query } = readVision(vision);
  // Receita/comprovante: a mesma chamada de visão já extraiu os dados (graus, valor, data) para o atendente.
  const docKind = kind === "receita" || kind === "documento" ? documentKind(kind, vision.documento) : null;
  if (docKind) return { type: "document", kind: docKind, summary: formatExtraction(docKind, vision.documento), extraction: vision.documento, log: { kind, term: "", found: 0 } };
  if (kind !== "produto") return { type: "continue", log: { kind, term: "", found: 0 } };
  const steps = searchSteps(query);
  const analysis = imageAnalysis(query);
  const result = steps.length ? await deps.search(steps) : null;
  const term = result?.term ?? steps[0]?.label ?? (query.category ? CATEGORY_LABEL[query.category] : "produto sem marca ou característica");
  if (!result?.results.length) {
    // Marca reconhecida sem nada em estoque: a IA identifica o modelo e oferece opções (transfere só se o cliente pedir).
    if (query.brand) {
      const name = analysisName(analysis);
      const context = `FOTO DE PRODUTO (análise interna: marca/linha ${name}; referência ${analysis.modeloProvavel ?? "não legível"}${analysis.descricaoVisual ? `; ${analysis.descricaoVisual}` : ""}). Nenhum modelo ${name} com estoque na rede agora. Diga isso com gentileza identificando o modelo ("Esse modelo é um *${name}*..."), ofereça modelos parecidos de outras marcas (mesmo tipo/formato) ou que um atendente verifique encomenda. Só transfira se o cliente pedir.`;
      return { type: "identified", context, analysis, log: { kind, term, found: 0 } };
    }
    return { type: "handoff", trigger: "catalog_miss", reply: CATALOG_MISS_REPLY, reason: `Foto de produto sem correspondência no catálogo (busca: ${term})`, log: { kind, term, found: 0 } };
  }
  const log = { kind, term, found: result.results.length };
  const listing = formatCatalogResults(result, deps.withPrices);
  const stepKind = result.step?.kind;
  const searchTerm = result.step?.query || [query.brand, query.reference].filter(Boolean).join(" ");
  if (stepKind === "referencia") return { type: "found", match: "exata", analysis, searchTerm, log, context: `${photoContext("exata", analysis, searchTerm, "")}\n${listing}` };
  if (stepKind === "marca") {
    const opener = photoFallbackOpener(analysis, searchTerm);
    return { type: "found", match: "linha", analysis, searchTerm, opener, log, context: `${photoContext("linha", analysis, searchTerm, opener)}\n${listing}` };
  }
  return { type: "found", match: "similar", analysis, searchTerm, log, context: listing };
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

/** Resultados de uma família comercial: nome no cadastro ou qualquer referência equivalente. */
export function matchIconicProducts(products: IndexedProduct[], text: string, brand?: string | null) {
  const model = iconicModel(text, brand);
  if (!model) return null;
  const name = normalizeTerm(model.name);
  const matches = products.filter((product) => {
    const productBrand = normalizeTerm(product.brand ?? "");
    if (productBrand ? !productBrand.startsWith("RAYBAN") : !product.text.includes("RAYBAN")) return false;
    return product.text.includes(name) || model.references.some((reference) => product.text.includes(reference));
  }).filter((product) => !!product.code).sort((a, b) => b.sales - a.sales);
  return { model, products: matches };
}

const plainUpper = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

/** Linha/marca infantil ou juvenil no cadastro ("SP KIDS", "ARM INFANTIL", "JUNIOR", "TEEN"). */
export function isKidsProduct(product: { description?: string | null; brand?: string | null }) {
  return /\b(KIDS?|INFANTIL|INFANTIS|JUNIOR|TEEN|TEENS|BABY|BEBE|CRIANCA)\b/.test(plainUpper(`${product.brand ?? ""} ${product.description ?? ""}`));
}

/**
 * O cliente falou de criança/adolescente ("pro meu filho", "infantil", "minha neta de 8 anos", "kids"):
 * só assim a vitrine inclui linhas infantis; por padrão as recomendações são de adulto.
 */
export function mentionsKids(text: string) {
  const source = plainUpper(text);
  if (/\b(CRIANCAS?|FILH[OA]S?|FILHINH[OA]S?|INFANTIL|INFANTIS|KIDS?|MENIN[OA]S?|NET[OA]S?|NETINH[OA]S?|SOBRINH[OA]S?|BEBES?|ADOLESCENTES?|JUVENIL|TEEN|PRE ?ADOLESCENTE|ESCOLA|ESCOLAR)\b/.test(source)) return true;
  // Idade juvenil dita em anos ("de 9 anos", "tem 12 anos").
  return [...source.matchAll(/\b(\d{1,2})\s*ANOS?\b/g)].some((match) => Number(match[1]) <= 15);
}

/**
 * Marcas equivalentes (mesmo posicionamento/estilo) para sugerir quando a marca pedida não tem saldo na cidade.
 * Ordem = prioridade da sugestão. Marca fora do mapa usa o grupo premium padrão.
 */
const PREMIUM_EQUIVALENTS = ["Prada", "Dolce & Gabbana", "Versace", "Tiffany", "Vogue", "Michael Kors", "Carolina Herrera"];
export const EQUIVALENT_BRANDS: Record<string, string[]> = {
  "Miu Miu": ["Prada", "Dolce & Gabbana", "Versace", "Tiffany", "Vogue"],
  Prada: ["Miu Miu", "Dolce & Gabbana", "Versace", "Gucci", "Burberry"],
  "Prada Linea Rossa": ["Prada", "Oakley", "Emporio Armani", "Ray-Ban"],
  "Dolce & Gabbana": ["Versace", "Prada", "Miu Miu", "Gucci", "Tiffany"],
  Versace: ["Dolce & Gabbana", "Prada", "Gucci", "Miu Miu", "Michael Kors"],
  Gucci: ["Prada", "Versace", "Dolce & Gabbana", "Burberry", "Fendi"],
  Chanel: ["Dior", "Prada", "Miu Miu", "Tiffany", "Dolce & Gabbana"],
  Dior: ["Chanel", "Prada", "Gucci", "Versace", "Fendi"],
  Fendi: ["Gucci", "Prada", "Dior", "Versace", "Miu Miu"],
  Tiffany: ["Miu Miu", "Prada", "Michael Kors", "Vogue", "Carolina Herrera"],
  Burberry: ["Prada", "Emporio Armani", "Gucci", "Ray-Ban", "Michael Kors"],
  "Tom Ford": ["Prada", "Gucci", "Burberry", "Persol", "Emporio Armani"],
  "Ray-Ban": ["Oakley", "Vogue", "Emporio Armani", "Persol", "Arnette"],
  Oakley: ["Ray-Ban", "Prada Linea Rossa", "Mormaii", "Speedo", "HB"],
  Persol: ["Ray-Ban", "Tom Ford", "Emporio Armani", "Burberry", "Prada"],
  "Emporio Armani": ["Armani", "Ray-Ban", "Burberry", "Prada", "Michael Kors"],
  Armani: ["Emporio Armani", "Prada", "Burberry", "Ray-Ban", "Persol"],
  "Michael Kors": ["Tiffany", "Vogue", "Carolina Herrera", "Emporio Armani", "Ray-Ban"],
  "Carolina Herrera": ["Michael Kors", "Tiffany", "Vogue", "Ana Hickmann", "Prada"],
  "Ana Hickmann": ["Vogue", "Carolina Herrera", "Atitude", "Michael Kors", "Tiffany"],
  Vogue: ["Ana Hickmann", "Michael Kors", "Ray-Ban", "Atitude", "Tiffany"],
};

/** Marcas equivalentes à pedida (sem repetir a própria marca). */
export function equivalentBrands(brand: string): string[] {
  const key = normalizeTerm(brand);
  const entry = Object.entries(EQUIVALENT_BRANDS).find(([name]) => normalizeTerm(name) === key);
  return (entry?.[1] ?? PREMIUM_EQUIVALENTS).filter((name) => normalizeTerm(name) !== key);
}

/**
 * Pedido de marca sem referência nem modelo explícito: a busca é sempre a vitrine da marca (nunca o fluxo de
 * "modelo específico" que responde "Não encontrei esse modelo"). Estilo dito pelo cliente ("mais presença no
 * rosto") não vira termo de modelo.
 */
export function brandSearchArgs(args: Record<string, unknown>, brand: string, categoryWord = ""): Record<string, unknown> {
  const { nomeModelo: _model, referenciaOuSku: _ref, ...rest } = args;
  return { ...rest, termoBusca: [brand, categoryWord].filter(Boolean).join(" "), marca: brand, tipoBusca: "marca_ampla" };
}

/** Uma vitrine da busca ampla (o que o fallback precisa ler do resultado da ferramenta). */
export type BrandShowcase = { modelos?: ShowcaseModel[]; cenario?: string } | null;
export type BrandFallback = { brand: string; city: string; otherCities: string[]; alternatives: ShowcaseModel[]; alternativeBrands: string[]; unavailable: boolean };

/**
 * Marca sem saldo na cidade do cliente: procura a mesma marca nas outras praças da rede (transferência/encomenda)
 * e, no mesmo turno, marcas equivalentes com saldo real na cidade do cliente. A busca entra por parâmetro.
 */
export async function brandStockFallback(input: {
  brand: string; city: string; categoryWord?: string; otherCities: string[];
  search: (args: { termoBusca: string; marca: string; cidade: string; tipoBusca: "marca_ampla" }) => Promise<BrandShowcase>;
  maxAlternatives?: number;
}): Promise<BrandFallback> {
  const term = (brand: string) => [brand, input.categoryWord].filter(Boolean).join(" ");
  const has = (result: BrandShowcase) => !!result?.modelos?.length;
  const seen = new Set<string>();
  const cities = input.otherCities.filter((city) => {
    const key = normalizeTerm(city);
    if (!key || key === normalizeTerm(input.city) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const elsewhere = await Promise.all(cities.map(async (city) => ({ city, result: await input.search({ termoBusca: term(input.brand), marca: input.brand, cidade: city, tipoBusca: "marca_ampla" }).catch(() => null) })));
  const brands = equivalentBrands(input.brand);
  const local = await Promise.all(brands.map(async (brand) => ({ brand, result: await input.search({ termoBusca: term(brand), marca: brand, cidade: input.city, tipoBusca: "marca_ampla" }).catch(() => null) })));
  const limit = input.maxAlternatives ?? 4;
  const alternatives: ShowcaseModel[] = [];
  const alternativeBrands: string[] = [];
  // Uma opção (a primeira da vitrine) por marca equivalente, na ordem de prioridade.
  for (const { brand, result } of local) {
    if (alternatives.length >= limit || !has(result)) continue;
    alternatives.push(result!.modelos![0]);
    alternativeBrands.push(brand);
  }
  const unavailable = [...elsewhere.map((item) => item.result), ...local.map((item) => item.result)].every((result) => result?.cenario === "unavailable_api");
  return { brand: input.brand, city: input.city, otherCities: elsewhere.filter((item) => has(item.result)).map((item) => item.city), alternatives, alternativeBrands, unavailable };
}

/** Resposta consultiva da marca sem saldo na cidade: transparência + transferência + alternativas locais. */
export function brandFallbackReply(fallback: BrandFallback, variant = 0) {
  const { brand, city } = fallback;
  const transfer = fallback.otherCities.length
    ? `Em ${city} a *${brand}* está sem saldo agora, mas temos em ${fallback.otherCities.slice(0, 2).join(" e ")}: dá pra pedir a transferência pra uma loja de ${city} 😊`
    : `No momento a *${brand}* está sem saldo em ${city} e nas outras unidades da rede, mas um atendente pode verificar encomenda pra você.`;
  if (!fallback.alternatives.length) return `${transfer}\n---SPLIT---\nQuer que eu peça pra separarem uma pra você?`;
  const intro = [
    `Enquanto isso, separei opções com o mesmo estilo que estão disponíveis em ${city}:`,
    `E pra você já ver hoje em ${city}, estas têm a mesma pegada:`,
    `Já com pronta entrega em ${city}, olha estas no mesmo estilo:`,
  ][Math.abs(variant) % 3];
  const showcase = `${transfer}\n---SPLIT---\n${intro}\n${formatShowcase(fallback.alternatives, { header: false })}`;
  // Vitrine de 2+ itens ganha o fechamento ativo no agente; com 1 só, a pergunta de avanço sai aqui.
  return fallback.alternatives.length >= 2 ? showcase : `${showcase}\n\nQuer que eu peça a transferência da *${brand}* ou prefere conhecer essa opção na loja?`;
}

/** Catálogo com foto: no máximo 4 opções por vitrine (leve no celular do cliente e no envio de mídia). */
export const VISUAL_CATALOG_MAX = 4;
/** Opção do catálogo: foto + legenda curta (nome limpo, preço e lojas da cidade), sem código "Ref.". */
export type CatalogPhoto = { index: number; sku: string; ref: string | null; name: string; price: string | null; priceValue: number | null; stores: string[]; imageUrl: string; caption: string };
export type VisualCatalog = { opening: string; items: CatalogPhoto[]; closing: string };

const priceNumber = (price: string | null) => {
  if (!price) return null;
  const value = Number(price.replace(/[^\d,]/g, "").replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : null;
};

/** "1. Ray-Ban Aviator — R$ 899,00" + "Lojas em Goiânia: Setor Marista, Jardim Goiás". */
export function catalogCaption(item: { index: number; name: string; price: string | null; varies?: boolean; stores: string[] }, city: string) {
  const price = item.price ? ` — ${item.varies ? "a partir de " : ""}${item.price}` : "";
  const stores = item.stores.slice(0, 3);
  const where = stores.length ? `\n${stores.length === 1 ? "Loja" : "Lojas"}${city ? ` em ${city}` : ""}: ${stores.join(", ")}${item.stores.length > 3 ? " e outras" : ""}` : "";
  return `${item.index}. ${item.name.replace(/\s*\(Ref\.[^)]*\)/gi, "").trim()}${price}${where}`;
}

/** Mensagem curta que abre a vitrine com fotos ("Separei 3 opções de óculos de sol em Goiânia 👇"). */
export function catalogOpening(input: { count: number; category?: string; city?: string; budget?: boolean }) {
  const what = input.category === "SOLAR" ? "óculos de sol" : input.category === "ARMACAO" ? "armações de grau" : input.category === "LENTE_CONTATO" ? "lentes de contato" : "modelos";
  const count = input.count === 1 ? `1 opção de ${what}` : `${input.count} opções de ${what}`;
  return `Separei ${count}${input.city ? ` em ${input.city}` : ""}${input.budget ? " nessa faixa de valor" : ""} 👇`;
}

export const CATALOG_CLOSINGS = ["Qual dessas fotos chamou mais sua atenção?", "Qual delas você mais gostou?", "Alguma dessas te agradou? Me fala o número da foto."];

/**
 * Curadoria do catálogo visual: na ordem da vitrine, só modelos com foto válida (qualquer código da variante),
 * até VISUAL_CATALOG_MAX. null quando nenhum tem foto (aí a vitrine sai em texto limpo).
 */
export function buildVisualCatalog(input: { models: ShowcaseModel[]; images: Record<string, string>; city: string; opening: string; closing: string; max?: number }): VisualCatalog | null {
  const items: CatalogPhoto[] = [];
  for (const model of input.models) {
    if (items.length >= (input.max ?? VISUAL_CATALOG_MAX)) break;
    const sku = model.codigos.find((code) => !!input.images[code]);
    if (!sku) continue;
    const index = items.length + 1;
    const stores = model.lojas ?? [];
    items.push({
      index, sku, ref: model.referencia, name: model.nomeComercial, price: model.precoVenda, priceValue: priceNumber(model.precoVenda), stores, imageUrl: input.images[sku],
      caption: catalogCaption({ index, name: model.nomeComercial, price: model.precoVenda, varies: model.precoVaria, stores }, input.city),
    });
  }
  return items.length ? { opening: input.opening, items, closing: input.closing } : null;
}

/** Ordem exibida para o aiContext (lastShownProducts): "gostei da 2ª foto" resolve sem mostrar referência. */
export function shownProductsOf(items: { index: number; sku: string | null; ref: string | null; name: string; priceValue: number | null; stores: string[] }[]) {
  return items.map((item) => ({ index: item.index, id: item.sku ?? "", ref: item.ref, name: item.name, price: item.priceValue, stores: item.stores }));
}

/** Vitrine em texto sem códigos internos: tira "(Ref. 921093)" / "(Ref. #921093)" das linhas numeradas. */
export function withoutShowcaseRefs(text: string) {
  return text.replace(/\s*\(Ref\.\s*[^)]*\)/gi, "");
}

export const NO_PHOTOS_NOTE = "(As fotos desses modelos não estão disponíveis no sistema no momento.)";
