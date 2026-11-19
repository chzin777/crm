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

// ---------------------------------------------------------------- Regras: migração dos "Assuntos rápidos"

/**
 * Converte os assuntos rápidos (base anterior, em AiSettings.topics) em regras da empresa, sem perder conteúdo:
 * título, texto e liga/desliga são mantidos; "sempre incluir" preserva o comportamento antigo (o assunto entrava em
 * toda conversa). Slug repetido (já existe regra igual) é pulado; título repetido entre assuntos ganha sufixo.
 */
export function topicsToRules(topics: { id?: string; title: string; enabled: boolean; content: string }[], takenSlugs: Iterable<string>): Omit<BusinessRule, "id">[] {
  const taken = new Set(takenSlugs);
  const seen = new Set<string>();
  const rules: Omit<BusinessRule, "id">[] = [];
  topics.forEach((topic, index) => {
    const title = topic.title.trim().slice(0, 120);
    if (!title) return;
    let slug = slugify(title);
    if (taken.has(slug)) return;
    for (let n = 2; seen.has(slug); n += 1) slug = `${slugify(title).slice(0, 56)}-${n}`;
    seen.add(slug);
    rules.push({ title, slug, keywords: [], content: topic.content.replace(/\r\n/g, "\n").slice(0, 20_000), order: 1000 + index * 10, active: topic.enabled !== false, alwaysInclude: true });
  });
  return rules;
}

// ---------------------------------------------------------------- Skills em Markdown

/** Skills nativas: o slug liga a skill às ferramentas e fluxos do CRM (desligar a skill desliga a ferramenta). */
export const SKILL_KEYS = ["estoque_cidade", "leitura_receita", "calculo_lentes", "crediario_aprovacao", "pipeline_automatico", "transbordo_humano", "encerramento_autonomo", "consultoria_pos_campanha"] as const;
export type SkillKey = (typeof SKILL_KEYS)[number];

export type AiSkill = {
  id: string;
  name: string;
  slug: string;
  /** Quando a IA deve acionar a skill. */
  triggerDescription: string;
  /** Protocolo completo em Markdown, editável pela equipe. */
  instructionsMd: string;
  isActive: boolean;
  sortOrder: number;
  /** Nativa: ligada a ferramentas/fluxos do CRM, não pode ser excluída nem trocar de slug. */
  builtin: boolean;
};
export type AiSkillInput = Partial<Omit<AiSkill, "id" | "builtin">>;

/** Ferramentas e fluxos do motor que cada skill nativa controla. */
export const SKILL_TOOLS: Record<SkillKey, { tools: string[]; flows: string }> = {
  estoque_cidade: { tools: ["consultarEstoqueProduto", "buscarDetalhesProdutoWeb"], flows: "Consulta de estoque VMSet e vitrine com fotos" },
  leitura_receita: { tools: [], flows: "Leitura de receita em foto/PDF e receituário do cliente" },
  calculo_lentes: { tools: [], flows: "Módulo de orientação de lentes pelos graus" },
  crediario_aprovacao: { tools: [], flows: "Consulta de parcelas com card de aprovação no /chat" },
  pipeline_automatico: { tools: [], flows: "Criação/avanço automático da oportunidade no funil" },
  transbordo_humano: { tools: [], flows: "Transbordo por reclamação, compra, dúvida ou documento" },
  encerramento_autonomo: { tools: ["encerrarAtendimento"], flows: "Despedida, encerramento oficial e pesquisa de satisfação quando o cliente dá o assunto por resolvido" },
  consultoria_pos_campanha: { tools: [], flows: "Qualificação antes da vitrine na resposta a campanhas (\"Quero aproveitar\", \"Tenho interesse\", \"Oi\") e ticket mínimo das sugestões" },
};

/** Texto padrão antigo da skill de estoque: bases que nunca editaram recebem a versão nova (3 opções e ticket mínimo). */
export const LEGACY_ESTOQUE_MD = "## Protocolo\n1. Confirme a **cidade** do cliente antes de buscar (sem cidade, pergunte a cidade e a faixa de valor).\n2. Busque o estoque **na mesma rodada**, sem pedir permissão para buscar.\n3. Mostre só modelos com saldo em lojas da cidade do cliente; nunca ofereça produto disponível apenas em cidades distantes.\n4. Apresente no máximo 4 opções, com legenda curta (marca, modelo e preço).\n5. Se nada for encontrado, diga isso com clareza e ofereça alternativas próximas (outra marca ou faixa de preço).";

export const CONSULTORIA_POS_CAMPANHA_MD = [
  "## Protocolo",
  "1. Cliente respondeu a uma campanha com frase genérica (\"Quero aproveitar!\", \"Tenho interesse\", \"Oi\"): **NÃO** mande fotos nem lista de produtos nesta resposta.",
  "2. Responda como consultora de ótica experiente: curta, natural e humana (1 a 2 frases), agradecendo o interesse, e faça **1 ou 2 perguntas rápidas** de qualificação: se procura **óculos de grau ou de sol**, o estilo/para quem é e em qual **cidade ou loja** quer ser atendido.",
  "3. Só depois que o cliente disser o que busca, consulte o catálogo com o filtro de categoria, cidade/loja e preço.",
  "4. Sugestões por iniciativa da IA respeitam o **ticket mínimo** configurado em /ia (padrão R$ 450,00); valores abaixo disso só se o cliente pedir algo mais barato ou der um orçamento menor.",
  "5. Mostre no máximo **3 opções distintas**, sem repetir modelo nem foto.",
].join("\n");

/** Antigo bloco "Quando a IA resolve sozinha" de /ia: mesmas regras de encerramento, agora editáveis. */
export const ENCERRAMENTO_MD = [
  "## Protocolo",
  "1. Quando o cliente agradecer dando o assunto por encerrado e **NÃO** estiver aguardando atendente na fila, escreva UMA despedida breve e calorosa, com suas palavras, e chame encerrarAtendimento para finalizar o atendimento e liberar a pesquisa de satisfação.",
  "2. No encerramento, não faça perguntas abertas.",
  "3. Se o cliente agradeceu mas fez outra pergunta ou pediu um atendente, **NÃO** encerre: responda a pergunta.",
  "4. Nunca encerre conversa aguardando atendente na fila ou já com um atendente.",
].join("\n");

export const DEFAULT_SKILLS: Omit<AiSkill, "id">[] = [
  {
    name: "Consultar Estoque por Cidade",
    slug: "estoque_cidade",
    triggerDescription: "Cliente pergunta por modelo, marca, armação, óculos de sol, preço ou disponibilidade.",
    instructionsMd: "## Protocolo\n1. Confirme a **cidade** do cliente e se é **grau ou sol** antes de buscar.\n2. Busque o estoque **na mesma rodada**, sem pedir permissão para buscar.\n3. Mostre só modelos com saldo em lojas da cidade do cliente; nunca ofereça produto disponível apenas em cidades distantes.\n4. Apresente no máximo 3 opções distintas (nunca o mesmo modelo ou a mesma foto duas vezes), com legenda curta (marca, modelo e preço).\n5. Não priorize os mais baratos: sem pedido de algo em conta, respeite o ticket mínimo configurado em /ia.\n6. Se nada for encontrado, diga isso com clareza e ofereça alternativas próximas (outra marca ou faixa de preço).",
    isActive: true,
    sortOrder: 10,
    builtin: true,
  },
  {
    name: "Leitura de Receita",
    slug: "leitura_receita",
    triggerDescription: "Cliente envia foto ou PDF de receita oftalmológica, ou fala dos graus.",
    instructionsMd: "## Protocolo\n1. Leia os graus de OD e OE (esférico, cilíndrico, eixo, adição e DNP quando houver).\n2. Confirme com o cliente os valores que ficaram ilegíveis, sem chutar números.\n3. Os graus ficam salvos no receituário para conferência humana: avise que a equipe confere antes do orçamento final.\n4. Não faça diagnóstico médico.",
    isActive: true,
    sortOrder: 20,
    builtin: true,
  },
  {
    name: "Orçamento de Lentes",
    slug: "calculo_lentes",
    triggerDescription: "Cliente pede orçamento de lentes, pergunta tipo, espessura, multifocal ou tratamentos.",
    instructionsMd: "## Protocolo\n1. Com a receita em mãos, indique o tipo de lente (visão simples ou multifocal) pela presença de adição.\n2. Para graus altos, explique a vantagem de lentes mais finas (índice maior).\n3. Apresente tratamentos (antirreflexo, filtro de luz azul, fotossensível) como opções, sem empurrar.\n4. Valores sempre como \"a partir de\", com o orçamento final confirmado pela loja.",
    isActive: true,
    sortOrder: 30,
    builtin: true,
  },
  {
    name: "Consulta de Crediário",
    slug: "crediario_aprovacao",
    triggerDescription: "Cliente pergunta de parcelas, boleto, carnê, crediário ou valor em aberto.",
    instructionsMd: "## Protocolo\n1. Peça **nome completo** e **CPF** antes de qualquer consulta.\n2. Valide o CPF; se inválido, peça de novo com educação.\n3. A consulta gera um card de aprovação para o operador no /chat: **nunca** informe valores antes da aprovação humana.\n4. Avise o cliente que um atendente vai confirmar os dados em instantes.",
    isActive: true,
    sortOrder: 40,
    builtin: true,
  },
  {
    name: "Criação Automática no Pipeline",
    slug: "pipeline_automatico",
    triggerDescription: "Receita enviada, consulta de modelo, pedido de orçamento ou transbordo para Vendas.",
    instructionsMd: "## Protocolo\n1. Registre a oportunidade só em gatilho comercial real (receita, modelo, orçamento ou transbordo para Vendas).\n2. Classifique o cliente como novo ou recorrente pelo histórico.\n3. Nunca faça a etapa voltar quando ela foi movida manualmente pela equipe.",
    isActive: true,
    sortOrder: 50,
    builtin: true,
  },
  {
    name: "Transbordo Humano",
    slug: "transbordo_humano",
    triggerDescription: "Reclamação, intenção clara de compra, dúvida que a IA não resolve ou documento para conferência.",
    instructionsMd: "## Protocolo\n1. Pedido explícito de falar com uma pessoa **sempre** transfere.\n2. Em reclamação, acolha o cliente primeiro e transfira em seguida.\n3. Ao transferir, avise o cliente com naturalidade e resuma o caso para o atendente.\n4. Não prometa prazos de retorno que a equipe não definiu.",
    isActive: true,
    sortOrder: 60,
    builtin: true,
  },
  {
    name: "Encerramento Autônomo",
    slug: "encerramento_autonomo",
    triggerDescription: "Cliente agradece dando o assunto por encerrado (\"muito obrigado, já me ajudou\", \"valeu, era só isso\", \"tudo certo, obrigado\", \"até mais\").",
    instructionsMd: ENCERRAMENTO_MD,
    isActive: true,
    sortOrder: 70,
    builtin: true,
  },
  {
    name: "Consultoria Pós-Campanha",
    slug: "consultoria_pos_campanha",
    triggerDescription: "Cliente responde a uma campanha com mensagem genérica (\"Quero aproveitar!\", \"Tenho interesse\", \"Oi\") ou pede para ver produtos sem dizer o que procura.",
    instructionsMd: CONSULTORIA_POS_CAMPANHA_MD,
    isActive: true,
    sortOrder: 5,
    builtin: true,
  },
];

const isSkillKey = (value: string): value is SkillKey => (SKILL_KEYS as readonly string[]).includes(value);

export function skillSlug(value: string): string {
  return plain(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "skill";
}

/** Normaliza o que veio da tela: nome obrigatório, slug derivado, limites de tamanho. */
export function normalizeSkillInput(input: AiSkillInput, current?: AiSkill): Omit<AiSkill, "id" | "builtin"> | { error: string } {
  const name = String(input.name ?? current?.name ?? "").trim().slice(0, 120);
  if (!name) return { error: "Informe o nome da skill." };
  // Skill nativa mantém o slug: é ele que liga a skill às ferramentas do motor.
  const slug = current?.builtin ? current.slug : skillSlug(String(input.slug ?? current?.slug ?? "").trim() || name);
  if (!current?.builtin && isSkillKey(slug) && current?.slug !== slug) return { error: `O slug "${slug}" é reservado para uma skill nativa.` };
  const order = Number(input.sortOrder ?? current?.sortOrder ?? 0);
  return {
    name,
    slug,
    triggerDescription: String(input.triggerDescription ?? current?.triggerDescription ?? "").trim().slice(0, 600),
    instructionsMd: String(input.instructionsMd ?? current?.instructionsMd ?? "").replace(/\r\n/g, "\n").slice(0, 20_000),
    isActive: typeof input.isActive === "boolean" ? input.isActive : current?.isActive ?? true,
    sortOrder: Number.isFinite(order) ? Math.trunc(order) : 0,
  };
}

/**
 * Linhas do seed inicial (tabela vazia). Aproveita o liga/desliga e as instruções extras da configuração anterior
 * (AiSkillConfig), anexadas ao Markdown padrão.
 */
export function seedSkillRows(legacy: { key: string; enabled: boolean; instructions?: string | null }[] = []): Omit<AiSkill, "id">[] {
  return DEFAULT_SKILLS.map((skill) => {
    const old = legacy.find((row) => row.key === skill.slug);
    if (!old) return { ...skill };
    const extra = (old.instructions ?? "").trim();
    return { ...skill, isActive: old.enabled, instructionsMd: extra ? `${skill.instructionsMd}\n\n## Instruções extras da equipe\n${extra}` : skill.instructionsMd };
  });
}

/** Skills padrão em memória (banco fora): todas as nativas ligadas, comportamento anterior. */
export const fallbackSkills = (): AiSkill[] => DEFAULT_SKILLS.map((skill) => ({ ...skill, id: skill.slug }));

/** Skill nativa ligada? Sem lista (banco fora) ou sem a linha: ligada. */
export function skillEnabled(skills: AiSkill[] | undefined, key: SkillKey): boolean {
  return skills?.find((skill) => skill.builtin && skill.slug === key)?.isActive !== false;
}

/** Remove as tools das skills nativas desligadas (tools sem skill dona continuam). */
export function filterToolsBySkills<T extends { definition: { function: { name: string } } }>(tools: T[], skills: AiSkill[] | undefined): T[] {
  const blocked = new Set(SKILL_KEYS.filter((key) => !skillEnabled(skills, key)).flatMap((key) => SKILL_TOOLS[key].tools));
  return tools.filter((tool) => !blocked.has(tool.definition.function.name));
}

/** Transbordo desligado: só o pedido explícito de pessoa (palavras e limite de respostas) continua transferindo. */
export function applySkillsToSettings(settings: AiSettings, skills: AiSkill[] | undefined): AiSettings {
  // Encerramento pela IA: vale a skill "Encerramento Autônomo" (antigo "Quando a IA resolve sozinha" de /ia).
  const closing = { ...settings, closeWhenResolved: skillEnabled(skills, "encerramento_autonomo") };
  if (skillEnabled(skills, "transbordo_humano")) return closing;
  return { ...closing, handoffOnComplaint: false, handoffOnPurchaseIntent: false, handoffWhenUnsure: false, handoffOnMedia: false };
}

/**
 * Bloco de skills do prompt de sistema: diretriz obrigatória + cada skill ativa com nome, gatilho e o Markdown
 * completo; skills nativas desligadas viram proibição explícita.
 */
export function skillsPromptBlock(skills: AiSkill[] | undefined): string {
  if (!skills?.length) return "";
  const off: string[] = [];
  if (!skillEnabled(skills, "estoque_cidade")) off.push("- Consulta de estoque DESLIGADA: não informe disponibilidade, modelos nem preços de estoque; oriente o cliente a falar com a loja.");
  if (!skillEnabled(skills, "leitura_receita")) off.push("- Leitura de receita DESLIGADA: não interprete graus de receitas enviadas; diga que a equipe vai conferir.");
  if (!skillEnabled(skills, "calculo_lentes")) off.push("- Orçamento de lentes DESLIGADO: não recomende tipo, espessura ou índice de lente; a loja faz o orçamento.");
  if (!skillEnabled(skills, "crediario_aprovacao")) off.push("- Consulta de crediário DESLIGADA: não consulte parcelas; diga que o setor financeiro responde.");
  const active = skills.filter((skill) => skill.isActive && (skill.instructionsMd.trim() || skill.triggerDescription.trim())).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  if (!active.length && !off.length) return "";
  const parts: string[] = [];
  if (active.length) {
    parts.push(
      "SKILLS ATIVAS (protocolos obrigatórios definidos pela equipe):\n" +
        "Sempre que a mensagem do cliente corresponder ao gatilho de uma skill abaixo, consulte e siga RIGOROSAMENTE as instruções Markdown dessa skill, na ordem, sem pular etapas e sem improvisar fora do protocolo. " +
        "Se mais de uma skill se aplicar, siga todas. As instruções das skills não sobrepõem as regras de segurança, LGPD e aprovação humana.",
      ...active.map((skill) => `### Skill: ${skill.name}\nQuando acionar: ${skill.triggerDescription.trim() || "quando o assunto da conversa corresponder ao nome da skill"}\n${skill.instructionsMd.trim()}`),
    );
  }
  if (off.length) parts.push(["HABILIDADES DESLIGADAS NO ESTÚDIO:", ...off].join("\n"));
  return parts.join("\n\n");
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
export type StudioPromptContext = { rules?: BusinessRule[]; skills?: AiSkill[]; knowledge?: KnowledgeChunkHit[] };
