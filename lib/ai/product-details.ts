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

export type DetailsCacheRow = { key: string; query: string; details: string | null; updatedAt: Date };
export type DetailsCache = { get: (key: string) => Promise<DetailsCacheRow | null>; set: (row: { key: string; query: string; details: string | null }) => Promise<unknown> };
export type ProductDetails = { text: string | null; source: "cache" | "web" | "none" };

/** Busca com cache: acerto em 30 dias (ou "sem resultado" em 1 dia) não chama a web. Nunca lança erro. */
export function createProductDetailsService(deps: { cache: DetailsCache; search: (query: string) => Promise<string | null>; now?: () => number }) {
  const now = deps.now ?? Date.now;
  return async (key: string, query: string): Promise<ProductDetails> => {
    const row = await deps.cache.get(key).catch(() => null);
    if (row) {
      const age = now() - row.updatedAt.getTime();
      if (row.details && age < DETAILS_TTL_MS) return { text: row.details, source: "cache" };
      if (!row.details && age < DETAILS_MISS_TTL_MS) return { text: null, source: "none" };
    }
    const text = await deps.search(query).catch(() => null);
    const clean = text ? cleanDetails(text) : null;
    await deps.cache.set({ key, query, details: clean }).catch(() => undefined);
    return { text: clean, source: clean ? "web" : "none" };
  };
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
    "Pesquise na web as características reais deste produto de ótica e responda em português do Brasil, em até 6 tópicos curtos:",
    "material da armação/lentes, formato e estilo, público (feminino/masculino/unissex), lentes e proteção (UV, polarizada, grau), funcionalidades ou diferenciais (ex.: câmera e áudio nos Ray-Ban Meta), conforto/peso.",
    colorCodes.length ? `Se encontrar, diga o nome da cor destes códigos do fabricante: ${colorCodes.slice(0, 6).join(", ")}.` : "",
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
      body: JSON.stringify({ model: deps.model, tools: [{ type: "web_search" }], max_output_tokens: 700, input: prompt }),
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
  caracteristicas: string | null;
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
      ? "Responda com 2 a 4 características reais de caracteristicas (material, formato, público, lentes/proteção, diferenciais), em linguagem natural de WhatsApp, sem copiar a lista inteira."
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
