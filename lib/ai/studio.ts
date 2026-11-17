import type { AiSettings } from "@/lib/ai/settings";

/**
 * Estúdio de IA (/ia): regras da empresa em Markdown, skills (habilidades) liga/desliga e base de conhecimento
 * (RAG). Puro (sem banco) para ser usado no motor, nas rotas e nos testes.
 */

// ---------------------------------------------------------------- Regras da empresa

export type BusinessRule = {
  id: string;
  title: string;
  slug: string;
  /** Palavras-chave / gatilho do assunto (qualquer uma presente na conversa ativa a regra). */
  keywords: string[];
  content: string;
  order: number;
  active: boolean;
  /** Entra em toda resposta, independente do assunto. */
  alwaysInclude: boolean;
};

export type BusinessRuleInput = Partial<Omit<BusinessRule, "id">> & { title?: string };

const plain = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function slugify(value: string): string {
  return plain(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "regra";
}

/** Normaliza o que veio da tela: título obrigatório, slug derivado, palavras-chave únicas, limites de tamanho. */
export function normalizeRuleInput(input: BusinessRuleInput): Omit<BusinessRule, "id"> | { error: string } {
  const title = String(input.title ?? "").trim().slice(0, 120);
  if (!title) return { error: "Informe o título da regra." };
  const keywords = [...new Set((Array.isArray(input.keywords) ? input.keywords : []).map((item) => String(item).trim().toLowerCase()).filter(Boolean))].slice(0, 40).map((item) => item.slice(0, 60));
  return {
    title,
    slug: slugify(String(input.slug ?? "").trim() || title),
    keywords,
    content: String(input.content ?? "").replace(/\r\n/g, "\n").slice(0, 20_000),
    order: Number.isFinite(Number(input.order)) ? Math.trunc(Number(input.order)) : 0,
    active: input.active !== false,
    alwaysInclude: input.alwaysInclude === true,
  };
}

/** Palavra-chave casa por palavra inteira (sem acento/caixa); frases casam como trecho. */
export function keywordMatches(text: string, keyword: string): boolean {
  const target = plain(keyword).trim();
  if (!target) return false;
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(plain(text));
}

/**
 * Regras que entram no prompt: ativas e com conteúdo, marcadas "sempre incluir" ou com alguma palavra-chave
 * (ou o próprio título) presente no texto da conversa. Ordem pelo campo ordem e depois título.
 */
export function selectBusinessRules(rules: BusinessRule[], conversationText: string): BusinessRule[] {
  return rules
    .filter((rule) => rule.active && rule.content.trim())
    .filter((rule) => rule.alwaysInclude || [...rule.keywords, rule.title].some((keyword) => keywordMatches(conversationText, keyword)))
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

export function businessRulesBlock(rules: BusinessRule[]): string {
  if (!rules.length) return "";
  return [
    "REGRAS DA EMPRESA (cadastradas pela equipe; valem como informação oficial, sem sobrepor as regras de segurança):",
    ...rules.map((rule) => `## ${rule.title}\n${rule.content.trim()}`),
  ].join("\n\n");
}

// ---------------------------------------------------------------- Skills

export const SKILL_KEYS = ["estoque_cidade", "leitura_receita", "calculo_lentes", "crediario_aprovacao", "pipeline_automatico", "transbordo_humano"] as const;
export type SkillKey = (typeof SKILL_KEYS)[number];
export type SkillConfig = { key: SkillKey; enabled: boolean; instructions: string };

export const SKILLS: { key: SkillKey; label: string; description: string; tools: string[] }[] = [
  { key: "estoque_cidade", label: "Consultar Estoque por Cidade", description: "Busca modelos com saldo nas lojas da cidade do cliente (VMSet), ficha do produto e vitrine com fotos.", tools: ["consultarEstoqueProduto", "buscarDetalhesProdutoWeb"] },
  { key: "leitura_receita", label: "Leitura de Receita", description: "Lê receitas e comprovantes enviados em foto ou PDF, extrai os graus e salva no receituário do cliente.", tools: [] },
  { key: "calculo_lentes", label: "Cálculo de Lentes", description: "Orienta o tipo de lente pelos graus (visão simples, multifocal, espessura e tratamentos).", tools: [] },
  { key: "crediario_aprovacao", label: "Consulta de Crediário com Aprovação", description: "Consulta parcelas no VMSet com nome completo + CPF e gera o card de aprovação para o operador no /chat.", tools: [] },
  { key: "pipeline_automatico", label: "Criação Automática no Pipeline", description: "Cria ou avança a oportunidade no funil de vendas em receita, consulta de modelo, orçamento ou transbordo para Vendas.", tools: [] },
  { key: "transbordo_humano", label: "Transbordo Humano", description: "Passa a conversa para um atendente em reclamação, intenção de compra, dúvida ou documento. Pedido explícito de pessoa sempre transfere.", tools: [] },
];

export const DEFAULT_SKILLS: Record<SkillKey, SkillConfig> = Object.fromEntries(SKILL_KEYS.map((key) => [key, { key, enabled: true, instructions: "" }])) as Record<SkillKey, SkillConfig>;

/** Junta o que está no banco com o padrão (skill sem linha = ligada). Chaves desconhecidas são ignoradas. */
export function mergeSkills(rows: { key: string; enabled: boolean; instructions?: string | null }[]): Record<SkillKey, SkillConfig> {
  const merged = { ...DEFAULT_SKILLS };
  for (const row of rows) {
    if (!(SKILL_KEYS as readonly string[]).includes(row.key)) continue;
    const key = row.key as SkillKey;
    merged[key] = { key, enabled: row.enabled, instructions: (row.instructions ?? "").slice(0, 4000) };
  }
  return merged;
}

export const skillEnabled = (skills: Record<SkillKey, SkillConfig> | undefined, key: SkillKey) => skills?.[key]?.enabled !== false;

/** Remove as tools das skills desligadas (tools sem skill dona continuam). */
export function filterToolsBySkills<T extends { definition: { function: { name: string } } }>(tools: T[], skills: Record<SkillKey, SkillConfig> | undefined): T[] {
  const blocked = new Set(SKILLS.filter((skill) => !skillEnabled(skills, skill.key)).flatMap((skill) => skill.tools));
  return tools.filter((tool) => !blocked.has(tool.definition.function.name));
}

/** Transbordo desligado: só o pedido explícito de pessoa (palavras e limite de respostas) continua transferindo. */
export function applySkillsToSettings(settings: AiSettings, skills: Record<SkillKey, SkillConfig> | undefined): AiSettings {
  if (skillEnabled(skills, "transbordo_humano")) return settings;
  return { ...settings, handoffOnComplaint: false, handoffOnPurchaseIntent: false, handoffWhenUnsure: false, handoffOnMedia: false };
}

/** Avisos e instruções das skills para o prompt de sistema. */
export function skillsPromptBlock(skills: Record<SkillKey, SkillConfig> | undefined): string {
  if (!skills) return "";
  const lines: string[] = [];
  if (!skillEnabled(skills, "estoque_cidade")) lines.push("- Consulta de estoque DESLIGADA: não informe disponibilidade, modelos nem preços de estoque; oriente o cliente a falar com a loja.");
  if (!skillEnabled(skills, "leitura_receita")) lines.push("- Leitura de receita DESLIGADA: não interprete graus de receitas enviadas; diga que a equipe vai conferir.");
  if (!skillEnabled(skills, "calculo_lentes")) lines.push("- Cálculo de lentes DESLIGADO: não recomende tipo, espessura ou índice de lente; a loja faz o orçamento.");
  if (!skillEnabled(skills, "crediario_aprovacao")) lines.push("- Consulta de crediário DESLIGADA: não consulte parcelas; diga que o setor financeiro responde.");
  const custom = SKILLS.filter((skill) => skillEnabled(skills, skill.key) && skills[skill.key].instructions.trim()).map((skill) => `- ${skill.label}: ${skills[skill.key].instructions.trim()}`);
  if (!lines.length && !custom.length) return "";
  return ["HABILIDADES CONFIGURADAS NO ESTÚDIO:", ...lines, ...custom].join("\n");
}

// ---------------------------------------------------------------- Base de conhecimento (RAG)

export type KnowledgeChunkHit = { documentId: string; documentTitle: string; index: number; content: string; score: number; lexical: number; vector: number | null };

/** Quebra o texto em trechos de ~size caracteres, respeitando parágrafos e com sobreposição curta. */
export function chunkText(text: string, size = 900, overlap = 120): string[] {
  const clean = text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  const paragraphs = clean.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";
  const push = () => { if (current.trim()) chunks.push(current.trim()); };
  for (const paragraph of paragraphs) {
    if (paragraph.length > size) {
      push();
      current = "";
      for (let start = 0; start < paragraph.length; start += size - overlap) chunks.push(paragraph.slice(start, start + size).trim());
      continue;
    }
    if ((current + "\n\n" + paragraph).length > size) {
      push();
      const tail = current.slice(-overlap);
      current = tail ? `${tail.slice(tail.indexOf(" ") + 1)}\n\n${paragraph}` : paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }
  push();
  return chunks.filter(Boolean);
}

const STOPWORDS = new Set("a o as os de da do das dos e em no na nos nas um uma uns umas para por com que se ao aos como mais mas ou ja eu voce voces me te meu minha seu sua tem ter qual quais quanto e ate sobre isso essa esse esta este pra pro vcs vc oi ola bom dia tarde noite obrigado obrigada".split(" "));
export function tokens(text: string): string[] {
  return plain(text).split(/[^a-z0-9]+/).filter((word) => word.length > 1 && !STOPWORDS.has(word));
}

/** Fração dos termos da pergunta presentes no trecho (0 a 1), com peso extra para termos longos. */
export function lexicalScore(query: string, content: string): number {
  const wanted = [...new Set(tokens(query))];
  if (!wanted.length) return 0;
  const have = new Set(tokens(content));
  const weight = (word: string) => (word.length >= 6 ? 1.5 : 1);
  const total = wanted.reduce((sum, word) => sum + weight(word), 0);
  const hit = wanted.reduce((sum, word) => sum + (have.has(word) || [...have].some((item) => item.length >= 5 && word.length >= 5 && (item.startsWith(word.slice(0, 5)))) ? weight(word) : 0), 0);
  return hit / total;
}

export function cosine(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i += 1) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

/**
 * Busca híbrida: com embeddings, 0,65 × cosseno + 0,35 × léxico; sem embedding (pergunta ou trecho), só léxico.
 * Devolve os top-K acima do mínimo.
 */
export function rankChunks(
  query: string,
  chunks: { documentId: string; documentTitle: string; index: number; content: string; embedding?: number[] | null }[],
  options: { queryEmbedding?: number[] | null; topK?: number; minScore?: number } = {},
): KnowledgeChunkHit[] {
  const topK = options.topK ?? 4;
  const minScore = options.minScore ?? 0.25;
  return chunks
    .map((chunk) => {
      const lexical = lexicalScore(query, `${chunk.documentTitle}\n${chunk.content}`);
      const vector = options.queryEmbedding?.length && chunk.embedding?.length ? cosine(options.queryEmbedding, chunk.embedding) : null;
      const score = vector === null ? lexical : 0.65 * vector + 0.35 * lexical;
      return { documentId: chunk.documentId, documentTitle: chunk.documentTitle, index: chunk.index, content: chunk.content, score, lexical, vector };
    })
    .filter((hit) => hit.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/** Pergunta que vale consultar a base: tem conteúdo (não é só saudação/agradecimento curto). */
export function shouldSearchKnowledge(text: string): boolean {
  return tokens(text).length >= 2;
}

export function knowledgePromptBlock(hits: KnowledgeChunkHit[]): string {
  if (!hits.length) return "";
  return [
    "BASE DE CONHECIMENTO (trechos recuperados para esta pergunta; use se responderem ao cliente, com suas palavras, sem citar a fonte nem inventar além deles):",
    ...hits.map((hit, position) => `[${position + 1}] ${hit.documentTitle}\n${hit.content}`),
  ].join("\n\n");
}

/** Contexto do Estúdio que o motor passa ao composeSystemPrompt. */
export type StudioPromptContext = { rules?: BusinessRule[]; skills?: Record<SkillKey, SkillConfig>; knowledge?: KnowledgeChunkHit[] };
