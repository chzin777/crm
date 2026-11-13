/**
 * Ficha do produto para a IA (tool buscarDetalhesProdutoWeb): características reais pesquisadas na web
 * (cache de 30 dias por modelo) + cores/variações do mesmo modelo com saldo no ERP. Sem banco: as dependências
 * (cache, busca e estoque) entram por parâmetro para os testes.
 */

export const DETAILS_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Modelo sem nada útil na web: tenta de novo no dia seguinte. */
export const DETAILS_MISS_TTL_MS = 24 * 60 * 60 * 1000;
export const DETAILS_TIMEOUT_MS = 15_000;
export const DETAILS_MAX_CHARS = 1200;

export const MINI_DESCRIPTION_MAX = 120;

export type DetailsCacheRow = { key: string; query: string; details: string | null; updatedAt: Date };
export type DetailsCache = { get: (key: string) => Promise<DetailsCacheRow | null>; set: (row: { key: string; query: string; details: string | null }) => Promise<unknown> };
/** Avaliação média na web: só quando a página mostra a nota de forma explícita (nunca estimada). */
export type WebRating = { nota: string; contagem: number | null; fonte: string | null };
/** Ficha do modelo guardada no cache (JSON na coluna details). */
export type ProductSheet = { miniDescricao: string | null; descricaoDetalhada: string | null; avaliacaoWeb: WebRating | null };
/** text = descrição detalhada (compatível com o uso anterior). */
export type ProductDetails = { text: string | null; sheet: ProductSheet | null; source: "cache" | "web" | "none" };

/** "4.8" / "4,8" / 4.8 → "4,8" (escala de 1 a 5); fora disso, sem nota. */
export function formatRating(value: unknown) {
  const number = typeof value === "number" ? value : Number(String(value ?? "").replace(",", ".").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(number) || number < 1 || number > 5) return null;
  return number.toFixed(1).replace(".", ",");
}

/** Mini-descrição de 1 frase, até 120 caracteres. */
export function shortLine(value: unknown) {
  const text = typeof value === "string" ? cleanDetails(value)?.split("\n")[0]?.replace(/^[-•\s]+/, "").trim() : "";
  if (!text) return null;
  return text.length > MINI_DESCRIPTION_MAX ? `${text.slice(0, MINI_DESCRIPTION_MAX - 1).replace(/[\s,;:]+\S*$/, "")}…` : text;
}

/**
 * Lê a ficha devolvida pela pesquisa (JSON pedido no prompt; aceita texto em volta). Avaliação só com nota válida
 * e fonte informada; sem isso, avaliacaoWeb = null. Texto solto (sem JSON) vira só a descrição detalhada.
 */
export function parseSheet(raw: string | null | undefined): ProductSheet | null {
  if (!raw?.trim()) return null;
  const block = raw.match(/\{[\s\S]*\}/)?.[0];
  if (block) {
    try {
      const data = JSON.parse(block) as { miniDescricao?: unknown; descricaoDetalhada?: unknown; avaliacao?: { nota?: unknown; contagem?: unknown; fonte?: unknown } | null; avaliacaoWeb?: WebRating | null };
      const rating = data.avaliacao ?? data.avaliacaoWeb ?? null;
      const nota = rating ? formatRating(rating.nota) : null;
      const fonte = rating && typeof rating.fonte === "string" && rating.fonte.trim() ? rating.fonte.trim().slice(0, 60) : null;
      const contagem = rating && Number.isInteger(Number(rating.contagem)) && Number(rating.contagem) > 0 ? Number(rating.contagem) : null;
      const detailed = Array.isArray(data.descricaoDetalhada) ? data.descricaoDetalhada.map((item) => `- ${item}`).join("\n") : data.descricaoDetalhada;
      const sheet: ProductSheet = {
        miniDescricao: shortLine(data.miniDescricao),
        descricaoDetalhada: typeof detailed === "string" ? cleanDetails(detailed) : null,
        avaliacaoWeb: nota && fonte ? { nota, contagem, fonte } : null,
      };
      return sheet.miniDescricao || sheet.descricaoDetalhada ? sheet : null;
    } catch {
      // Segue como texto solto.
    }
  }
  const text = cleanDetails(raw);
  return text ? { miniDescricao: null, descricaoDetalhada: text, avaliacaoWeb: null } : null;
}

/** Ficha guardada no cache (JSON); linha antiga só com texto conta como desatualizada (pesquisa de novo). */
function cachedSheet(details: string): ProductSheet | null {
  if (!details.trim().startsWith("{")) return null;
  try {
    const data = JSON.parse(details) as ProductSheet;
    return data.miniDescricao || data.descricaoDetalhada ? data : null;
  } catch {
    return null;
  }
}

/** Busca com cache: acerto em 30 dias (ou "sem resultado" em 1 dia) não chama a web. Nunca lança erro. */
export function createProductDetailsService(deps: { cache: DetailsCache; search: (query: string) => Promise<string | null>; now?: () => number }) {
  const now = deps.now ?? Date.now;
  return async (key: string, query: string): Promise<ProductDetails> => {
    const row = await deps.cache.get(key).catch(() => null);
    if (row) {
      const age = now() - row.updatedAt.getTime();
      const sheet = row.details ? cachedSheet(row.details) : null;
      if (sheet && age < DETAILS_TTL_MS) return { text: sheet.descricaoDetalhada, sheet, source: "cache" };
      if (!row.details && age < DETAILS_MISS_TTL_MS) return { text: null, sheet: null, source: "none" };
    }
    const raw = await deps.search(query).catch(() => null);
    const sheet = parseSheet(raw);
    await deps.cache.set({ key, query, details: sheet ? JSON.stringify(sheet) : null }).catch(() => undefined);
    return { text: sheet?.descricaoDetalhada ?? null, sheet, source: sheet ? "web" : "none" };
  };
}

/** Avaliação para o cliente: "⭐ 4,8 (1.234 avaliações)"; null quando não há nota confiável. */
export function ratingLabel(rating: WebRating | null | undefined) {
  if (!rating?.nota) return null;
  return `⭐ ${rating.nota}${rating.contagem ? ` (${rating.contagem.toLocaleString("pt-BR")} avaliações)` : ""}`;
}

/** Tira links/citações da busca e limita o tamanho (a IA reescreve em linguagem de WhatsApp). */
export function cleanDetails(text: string) {
  const clean = text
    .replace(/\s*\(\[[^\]]*\]\([^)]*\)\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\*\*/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!clean || /^(n[ãa]o (encontrei|achei)|sem informa)/i.test(clean)) return null;
  return clean.length > DETAILS_MAX_CHARS ? `${clean.slice(0, DETAILS_MAX_CHARS).replace(/\s+\S*$/, "")}…` : clean;
}

/** Pedido de pesquisa: só características verificáveis, sem preço/loja (esses vêm do ERP). */
export function detailsPrompt(product: string, colorCodes: string[] = []) {
  return [
    "Pesquise na web as características reais deste produto de ótica. Responda SOMENTE com um JSON, em português do Brasil:",
    "{\"miniDescricao\": \"1 frase objetiva de até 120 caracteres com o principal atributo (ex.: Armação leve em acetato com design gatinho moderno)\",",
    "\"descricaoDetalhada\": \"até 6 tópicos curtos, um por linha começando com '- ': material da armação/lentes, formato e estilo, público, lentes e proteção (UV, polarizada, grau), tecnologias/diferenciais (ex.: câmera e áudio nos Ray-Ban Meta), conforto/peso/medidas\",",
    "\"avaliacao\": {\"nota\": 4.8, \"contagem\": 120, \"fonte\": \"nome do site\"} ou null}",
    "A avaliação só entra se uma página mostrar explicitamente a nota média deste modelo (escala de 1 a 5); se não achar com certeza, use null. Nunca estime nota.",
    colorCodes.length ? `Se encontrar, inclua na descricaoDetalhada o nome da cor destes códigos do fabricante: ${colorCodes.slice(0, 6).join(", ")}.` : "",
    "Não invente: o que não achar, omita. Não informe preços, lojas nem links.",
    `Produto: ${product}`,
  ].filter(Boolean).join("\n");
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/** Pesquisa na web pelo modelo da OpenAI (ferramenta web_search da Responses API). null = sem resultado ou falha. */
export async function webSearchDetails(prompt: string, deps: { apiKey: string; model: string; fetch?: FetchLike; timeoutMs?: number; onUsage?: (usage: { input: number; output: number; ok: boolean }) => unknown }) {
  const call = deps.fetch ?? (fetch as unknown as FetchLike);
  try {
    const response = await call("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${deps.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: deps.model, tools: [{ type: "web_search" }], max_output_tokens: 1400, input: prompt }),
      signal: AbortSignal.timeout(deps.timeoutMs ?? DETAILS_TIMEOUT_MS),
    });
    const body = (await response.json()) as { output_text?: string; output?: { content?: { text?: string }[] }[]; usage?: { input_tokens?: number; output_tokens?: number } };
    await deps.onUsage?.({ input: body.usage?.input_tokens ?? 0, output: body.usage?.output_tokens ?? 0, ok: response.ok });
    if (!response.ok) return null;
    const text = body.output_text ?? (body.output ?? []).flatMap((item) => item.content ?? []).map((part) => part.text ?? "").join("");
    return text.trim() || null;
  } catch {
    await deps.onUsage?.({ input: 0, output: 0, ok: false });
    return null;
  }
}

export type DetailsVariation = { nomeProduto: string; cor: string | null; totalDisponivel: number; lojas: string[] };
export type DetailsToolResult = {
  encontrado: boolean;
  nomeProduto: string;
  referencia: string | null;
  /** Descrição técnica completa (pedido de "mais detalhes"). */
  caracteristicas: string | null;
  descricaoDetalhada: string | null;
  miniDescricao: string | null;
  /** Nota média na web ("⭐ 4,8 (120 avaliações)"); null = não encontrada, nunca mencione nota. */
  avaliacaoWeb: string | null;
  fonteCaracteristicas: "cache" | "web" | "none";
  variacoesEmEstoque: DetailsVariation[];
  estoque: "ok" | "indisponivel" | "sem_codigo";
  orientacao: string;
};

/** Monta o resultado da tool com a orientação de como responder (detalhes reais, cores com saldo, próximo passo). */
export function buildDetailsResult(input: { nomeProduto: string; referencia: string | null; found: boolean; details: ProductDetails; variations: DetailsVariation[]; stock: DetailsToolResult["estoque"] }): DetailsToolResult {
  const withStock = input.variations.filter((variation) => variation.totalDisponivel > 0);
  const tips = [
    input.details.text
      ? "Pedido de mais detalhes: entregue a descricaoDetalhada de forma natural e consultiva (materiais, diferenciais técnicos, conforto/medidas e lentes/proteção), sem repetir a lista de lojas nem a ficha resumida já enviada."
      : "Não achei a ficha técnica na web: use só o que o nome e a referência indicam (tipo de produto e marca) e ofereça ver o modelo pessoalmente na loja; nunca invente material ou funções.",
    withStock.length > 1
      ? "Cite as cores/variações com saldo (variacoesEmEstoque; traduza códigos de cor para o nome quando caracteristicas trouxer o nome, senão diga apenas que há outras opções de cor)."
      : withStock.length === 1
        ? "Diga que há unidades disponíveis nesta versão."
        : input.stock === "ok" ? "No momento não há saldo deste modelo nas lojas: diga isso com naturalidade e ofereça ver modelos parecidos." : "",
    "Termine com o próximo passo lógico numa segunda bolha (---SPLIT---): ver as lojas com o modelo, enviar a localização da loja ou reservar.",
  ].filter(Boolean);
  return {
    encontrado: input.found,
    nomeProduto: input.nomeProduto,
    referencia: input.referencia,
    caracteristicas: input.details.text,
    descricaoDetalhada: input.details.text,
    miniDescricao: input.details.sheet?.miniDescricao ?? null,
    avaliacaoWeb: ratingLabel(input.details.sheet?.avaliacaoWeb),
    fonteCaracteristicas: input.details.source,
    variacoesEmEstoque: withStock.slice(0, 6),
    estoque: input.stock,
    orientacao: tips.join(" "),
  };
}

export const DETAILS_TOOL = {
  type: "function" as const,
  function: {
    name: "buscarDetalhesProdutoWeb",
    description: "Ficha do produto: características reais pesquisadas na web (material, formato, público, lentes, diferenciais) e as cores/variações do mesmo modelo com saldo no ERP. Use quando o cliente pedir mais detalhes, como é o modelo, diferenciais ou do que é feito. Somente leitura.",
    parameters: {
      type: "object",
      properties: {
        nomeProduto: { type: "string", description: "Nome do produto como na conversa ou na consulta de estoque, ex.: \"Armação Miu Miu (ref. 0MU 01XV)\", \"Ray-Ban Meta Wayfarer\"." },
        marca: { type: "string", description: "Marca, ex.: \"Miu Miu\". Opcional." },
        referencia: { type: "string", description: "Referência/modelo, ex.: \"0MU 01XV\", \"RB4165\". Opcional." },
      },
      required: ["nomeProduto"],
      additionalProperties: false,
    },
  },
};

/** Regra fixa do prompt: pedido de detalhes vira ficha real, nunca resposta genérica. */
export const DETAILS_RULES = [
  "DETALHES DO PRODUTO (regra fixa): quando o cliente pedir \"mais detalhes\", \"como é esse modelo?\", \"quais os diferenciais?\", \"do que é feito?\" ou parecido, chame buscarDetalhesProdutoWeb com o produto da conversa e responda com as características reais devolvidas (material, formato, público, lentes/proteção, funções especiais) e as cores/variações com saldo no ERP.",
  "Proibido responder pedido de detalhes com frase vazia (\"Posso te ajudar com disponibilidade e lojas\") ou repetir só a loja e o estoque.",
].join("\n");

/** Regra fixa do prompt: ficha padrão na 1ª consulta do modelo e descrição técnica quando pedirem mais detalhes. */
export const PRODUCT_CARD_RULES = [
  "APRESENTAÇÃO DE PRODUTO (regra fixa, vale antes e depois de o cliente entrar na fila):",
  "Na PRIMEIRA consulta de um modelo com estoque (resultado de consultarEstoqueProduto), a 1ª bolha (que vai como legenda da foto) segue esta ficha:",
  "1. Nome humanizado do modelo em negrito (campo nomeProduto, nunca o código bruto do ERP).",
  "2. A miniDescricao em 1 linha (se vier null, omita; nunca invente material ou função).",
  "3. Preço (precoVenda em R$), quantidade disponível (ex.: \"3 unidades disponíveis na rede\" com totalDisponivelRede, ou a quantidade da loja pedida) e a avaliacaoWeb (ex.: \"⭐ 4,8\") SOMENTE se ela vier preenchida; avaliacaoWeb null = não fale de nota nem de avaliação.",
  "4. As lojas com estoque agrupadas por cidade/região (formatação das listas de lojas).",
  "Depois, obrigatoriamente ---SPLIT--- e uma pergunta natural de continuação na 2ª bolha (ex.: \"Quer que eu te passe os detalhes técnicos completos desse modelo ou prefere a localização de alguma dessas lojas?\").",
  "Exemplo:\n*Armação Miu Miu (ref. 0MU 01XV)*\nArmação leve em acetato com design oval feminino\n💰 *R$ 1.290,00* · 3 unidades disponíveis na rede · ⭐ 4,8\n\n📍 *Goiânia*\n• *Loja Setor Bueno* — Av. T-8, 235\n\n---SPLIT---\n\nQuer que eu te passe os detalhes técnicos completos desse modelo ou prefere a localização dessa loja?",
  "Quando o cliente pedir \"mais detalhes\", \"mais informações\" ou \"como é\": NÃO repita a ficha nem a lista de lojas; chame buscarDetalhesProdutoWeb e entregue a descricaoDetalhada (materiais, diferenciais técnicos, conforto e cores em estoque) em texto natural, terminando com um próximo passo.",
].join("\n");

/** O cliente pediu para ver o modelo/foto ("manda a foto", "tem imagem?", "quero ver"). */
export function asksForPhoto(text: string) {
  return /\b(foto|fotos|imagem|imagens|figura|print)\b|\b(quero|queria|posso|pode|deixa)\s+(eu\s+)?ver\b|\bmostr[ae]\b|\bcomo\s+(ele|ela|é|e)\s+(é|e|fica)?\s*\??$/i.test(text);
}

/**
 * Foto do produto: vai na 1ª consulta do modelo na conversa (ou desde a entrada na fila) e sempre que o cliente
 * pedir para ver. Só evita reenviar a mesma foto já mandada nessa etapa; estar na fila nunca bloqueia.
 */
export function shouldSendProductPhoto(input: { sku: string; sentSkus: Iterable<string>; pendingText: string }) {
  if (asksForPhoto(input.pendingText)) return true;
  for (const sku of input.sentSkus) if (sku === input.sku) return false;
  return true;
}

/**
 * Orientação da ficha resumida que vai no próprio resultado de estoque (o modelo segue melhor o que vem junto dos
 * dados): nome, mini-descrição, preço · quantidade · avaliação (só se houver), lojas e a pergunta na 2ª bolha.
 */
export function cardGuidance(product: { nomeProduto: string; miniDescricao?: string | null; precoVenda?: string | null; totalDisponivelRede: number; avaliacaoWeb?: string | null }) {
  const units = `${product.totalDisponivelRede} ${product.totalDisponivelRede === 1 ? "unidade disponível" : "unidades disponíveis"} na rede`;
  const line = [product.precoVenda ? `💰 *${product.precoVenda}*` : "", units, product.avaliacaoWeb ?? ""].filter(Boolean).join(" · ");
  return [
    "FICHA DO PRODUTO (1ª consulta deste modelo): monte a 1ª bolha exatamente nesta ordem:",
    `*${product.nomeProduto}*`,
    product.miniDescricao ? product.miniDescricao : "(sem mini-descrição: pule esta linha)",
    line,
    "e depois as lojas agrupadas por cidade. Em seguida ---SPLIT--- e a pergunta: \"Quer que eu te passe os detalhes técnicos completos desse modelo ou prefere a localização de alguma dessas lojas?\".",
    product.avaliacaoWeb ? "" : "Não mencione avaliação nem nota (não encontrada).",
    "Se a ficha já foi enviada antes nesta conversa, não repita: responda só o que o cliente perguntou agora.",
  ].filter(Boolean).join("\n");
}
