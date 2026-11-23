import { createHash } from "node:crypto";

/** Origens da memória vetorial da IA (coluna "sourceType" de AiKnowledgeVector). */
export const VECTOR_SOURCES = ["KNOWLEDGE_BASE", "PRODUCT_CATALOG", "CLOSED_CONVERSATION", "COPILOT_CORRECTION"] as const;
export type VectorSource = (typeof VECTOR_SOURCES)[number];

/** Fatos (base de conhecimento + catálogo) e exemplos (atendimentos padrão ouro + correções do copiloto). */
export const FACT_SOURCES: VectorSource[] = ["KNOWLEDGE_BASE", "PRODUCT_CATALOG"];
export const EXAMPLE_SOURCES: VectorSource[] = ["CLOSED_CONVERSATION", "COPILOT_CORRECTION"];
/** Relevância mínima (cosseno, text-embedding-3-small): abaixo disso é ruído e não entra no prompt. */
export const FACT_MIN_SCORE = 0.35;
export const EXAMPLE_MIN_SCORE = 0.42;
export const FACT_TOP_K = 3;
export const EXAMPLE_TOP_K = 2;

export type VectorHit = { sourceType: VectorSource; sourceId: string; title: string; content: string; metadata: Record<string, unknown>; score: number };
export type SemanticMemory = { facts: VectorHit[]; examples: VectorHit[] };

export const contentHash = (text: string) => createHash("sha1").update(text).digest("hex");

export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i += 1) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

/** Top-K por cosseno acima do mínimo (busca no aplicativo quando o Postgres não tem pgvector). */
export function rankByCosine<T extends { embedding: ArrayLike<number> }>(query: number[], rows: T[], topK: number, minScore: number): (T & { score: number })[] {
  return rows
    .map((row) => ({ ...row, score: cosineSimilarity(query, row.embedding) }))
    .filter((row) => row.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/** Literal aceito pelo pgvector ("[0.1,0.2,...]"). */
export const vectorLiteral = (embedding: number[]) => `[${embedding.map((value) => (Number.isFinite(value) ? value : 0)).join(",")}]`;

/**
 * Tira dados pessoais antes de guardar um atendimento como exemplo: e-mail, CPF/CNPJ, telefone, números longos
 * (cartão, protocolo) e os nomes informados (cliente e atendentes).
 */
export function anonymize(text: string, names: (string | null | undefined)[] = []): string {
  let clean = text
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[cpf]")
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "[cnpj]")
    .replace(/(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g, "[telefone]")
    .replace(/\b\d{8,}\b/g, "[numero]");
  const parts = names.flatMap((name) => (name ?? "").split(/\s+/)).map((part) => part.replace(/[^\p{L}'-]/gu, "")).filter((part) => part.length >= 3);
  for (const part of [...new Set(parts)].sort((a, b) => b.length - a.length)) {
    clean = clean.replace(new RegExp(`(?<![\\p{L}])${part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}])`, "giu"), "[nome]");
  }
  return clean;
}

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Texto indexado de um produto do catálogo (descrição, marca, categoria e faixa de preço de venda). */
export function catalogDocument(product: { description: string; brand: string | null; category: string | null; subcategory: string | null; price: number | null; minPrice?: number | null; maxPrice?: number | null }) {
  const category = [product.category, product.subcategory].filter(Boolean).join(" / ");
  const range = product.minPrice && product.maxPrice && Math.round(product.maxPrice) > Math.round(product.minPrice)
    ? `${brl(product.minPrice)} a ${brl(product.maxPrice)}`
    : product.price ? brl(product.price) : "";
  return [
    product.description,
    [product.brand ? `Marca: ${product.brand}` : "", category ? `Categoria: ${category}` : ""].filter(Boolean).join(" · "),
    range ? `Faixa de preço de venda: ${range}` : "",
  ].filter(Boolean).join("\n");
}

/** Blocos do prompt: fatos da loja e referências de condução (nunca copiadas nem citadas ao cliente). */
export function semanticMemoryBlock(memory: SemanticMemory | null | undefined, alreadyInPrompt: string[] = []): string {
  if (!memory) return "";
  const seen = new Set(alreadyInPrompt.map((text) => text.trim()));
  const facts = memory.facts.filter((hit) => !seen.has(hit.content.trim()));
  const blocks: string[] = [];
  if (facts.length) {
    blocks.push([
      "MEMÓRIA DA LOJA (busca semântica pela mensagem atual; use só se ajudar nesta resposta, com suas palavras):",
      ...facts.map((hit, index) => hit.sourceType === "PRODUCT_CATALOG"
        ? `[${index + 1}] Modelo que a loja já vendeu (referência de busca: estoque e preço atuais só pela ferramenta consultarEstoqueProduto, nunca afirme sem consultar)\n${hit.content}`
        : `[${index + 1}] ${hit.title}\n${hit.content}`),
    ].join("\n\n"));
  }
  if (memory.examples.length) {
    blocks.push([
      "REFERÊNCIAS DE ATENDIMENTOS BEM-SUCEDIDOS (situações parecidas que a equipe conduziu bem; inspire-se no jeito de conduzir, sem copiar frases, sem citar e sem repetir preços ou dados delas, que podem ter mudado):",
      ...memory.examples.map((hit, index) => `[${index + 1}] ${hit.content}`),
    ].join("\n\n"));
  }
  return blocks.join("\n\n");
}

/** Correção do copiloto só vale se o atendente mudou de verdade o texto sugerido. */
export function meaningfulEdit(suggestion: string, sent: string): boolean {
  const norm = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const a = norm(suggestion), b = norm(sent);
  if (!a || b.length < 6 || a === b) return false;
  const wordsA = new Set(a.split(" ")), wordsB = b.split(" ");
  const shared = wordsB.filter((word) => wordsA.has(word)).length;
  return shared / Math.max(wordsA.size, wordsB.length) < 0.9;
}
