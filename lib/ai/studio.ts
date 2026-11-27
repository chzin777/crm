import type { SemanticMemory } from "@/lib/ai/vector-memory";
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
export const SKILL_KEYS = ["estoque_cidade", "leitura_receita", "calculo_lentes", "crediario_aprovacao", "pipeline_automatico", "transbordo_humano", "encerramento_autonomo", "consultoria_pos_campanha", "envio_fotos", "leitura_fotos"] as const;
export type SkillKey = (typeof SKILL_KEYS)[number];

/** Envio de Fotos: liga/desliga todo envio de imagem ao cliente e guarda os parâmetros técnicos (config). */
export const PHOTO_SKILL = "envio_fotos" satisfies SkillKey;
/** Leitura de Fotos: liga/desliga a análise das fotos que o cliente manda (foto de referência). */
export const READ_PHOTO_SKILL = "leitura_fotos" satisfies SkillKey;
/** Skill antiga que juntava envio e leitura (v1.139.0): migrada para as duas acima. */
export const LEGACY_COMBINED_PHOTO_SKILL = "envio_leitura_fotos";
export type PhotoSkillConfig = { maxPhotos: number; webSearch: boolean };
export const PHOTO_SKILL_DEFAULTS: PhotoSkillConfig = { maxPhotos: 3, webSearch: true };
export const PHOTO_MAX_LIMIT = 6;

const asRecord = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

/** Parâmetros da skill de fotos vindos do banco/tela: fora do intervalo ou ausente volta ao padrão. */
export function photoSkillConfig(raw: unknown): PhotoSkillConfig {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const max = Number(value.maxPhotos);
  return {
    maxPhotos: Number.isFinite(max) ? Math.min(PHOTO_MAX_LIMIT, Math.max(1, Math.trunc(max))) : PHOTO_SKILL_DEFAULTS.maxPhotos,
    webSearch: typeof value.webSearch === "boolean" ? value.webSearch : PHOTO_SKILL_DEFAULTS.webSearch,
  };
}

/** Estado efetivo das fotos nesta resposta: skill ligada + parâmetros (sem a skill no banco: padrão ligado). */
export function photoSkillState(skills: AiSkill[] | undefined): PhotoSkillConfig & { enabled: boolean } {
  const skill = skills?.find((item) => item.builtin && item.slug === PHOTO_SKILL);
  return { enabled: skill ? skill.isActive : true, ...photoSkillConfig(skill?.config) };
}

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
  /** Parâmetros técnicos editáveis na tela (ex.: skill de fotos: maxPhotos, webSearch). */
  config?: unknown;
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
  envio_fotos: { tools: [], flows: "Foto do produto confirmado no estoque e vitrine com fotos (desligada: só texto, nenhuma imagem sai)" },
  leitura_fotos: { tools: [], flows: "Análise da foto que o cliente manda (\"Tem esse?\") e leitura de anexos (desligada: a IA não analisa a foto e pede que descreva o modelo em texto; receita em foto segue na skill de receita)" },
};

/** Seções dos protocolos de fotos (a migração junta aqui os 4 módulos antigos: legenda, vitrine, catálogo e anexos). */
export const PHOTO_SKILL_SECTIONS = {
  produto: "## 1. Foto do produto confirmado no estoque\nQuando o resultado de consultarEstoqueProduto trouxer \"fotoAnexada\": true, o sistema envia a foto junto com a sua resposta.\n- Escreva a resposta como legenda curta e natural (modelo, disponibilidade e loja), sem cara de ficha técnica.\n- Nunca invente, cite ou escreva URLs de imagem; não diga \"segue o link\". Se o cliente pedir foto e não houver \"fotoAnexada\", diga com naturalidade que não tem a foto aqui agora e passe as informações.",
  vitrine: "## 2. Vitrine com várias opções\nCada opção mostrada vira uma foto com legenda curta feita pelo sistema, até o limite de fotos configurado nesta skill.\n- Comente em poucas palavras por que aquelas peças combinam com o que a pessoa pediu (estilo, ocasião, rosto, custo-benefício), sem repetir a lista em texto, sem códigos e sem listar lojas em cada item.\n- Use a quantidade real de modelos: com 1 só, fale no singular.\n- Feche com uma pergunta leve para ela escolher a foto que mais gostou ou combinar a visita à loja mais próxima.",
  referencia: "## 3. Foto de referência enviada pelo cliente (\"Tem esse?\")\nTrate como uma cliente interessada num modelo, nunca como manual técnico.\n- Se a análise da foto trouxe marca, linha ou estilo e o catálogo achou modelos, responda direto como vendedora: até 3 modelos parecidos e as lojas com estoque agora.\n- Se não deu para ter certeza da marca, fale do estilo como quem entendeu o gosto dela (formato, cor, proposta), diga que vai buscar opções nessa linha e, se precisar, peça de um jeito leve a marca ou a cidade.\n- Nunca narre a foto (\"na foto aparece...\", \"pela imagem parece...\"): o cliente sabe o que mandou.",
  anexos: "## 4. Anexos recebidos (fotos, áudios e PDFs)\nUse o conteúdo de PDFs, documentos e transcrições de áudio para responder normalmente, sem repetir para o cliente o que ele mesmo enviou. Áudio é uma mensagem como outra qualquer: responda ao que foi dito.\nReceitas, laudos, comprovantes e orçamentos de outra ótica exigem conferência humana: confirme o recebimento com acolhimento e transfira.\n[FALHA_LEITURA_MIDIA: ...] significa que o arquivo não pôde ser lido: avise com naturalidade, sugerindo reenviar ou mandar em outro formato. Nunca invente o conteúdo.",
} as const;
type PhotoSection = keyof typeof PHOTO_SKILL_SECTIONS;
/** Seções de cada skill: envio (produto e vitrine) e leitura (foto de referência e anexos). */
export const PHOTO_SKILL_PARTS: Record<typeof PHOTO_SKILL | typeof READ_PHOTO_SKILL, PhotoSection[]> = { envio_fotos: ["produto", "vitrine"], leitura_fotos: ["referencia", "anexos"] };
export const PHOTO_SKILL_MD = PHOTO_SKILL_PARTS.envio_fotos.map((key) => PHOTO_SKILL_SECTIONS[key]).join("\n\n");
export const READ_PHOTO_SKILL_MD = PHOTO_SKILL_PARTS.leitura_fotos.map((key) => PHOTO_SKILL_SECTIONS[key]).join("\n\n");
/** Texto padrão da skill antiga combinada (v1.139.0): reconhece se a equipe já tinha editado. */
export const LEGACY_COMBINED_PHOTO_MD = Object.values(PHOTO_SKILL_SECTIONS).join("\n\n");

/** Separa o protocolo da skill antiga combinada: até a seção "## 3." é envio; dali em diante, leitura. */
export function splitCombinedPhotoMarkdown(markdown: string): { send: string; read: string } {
  const at = markdown.search(/^## 3\./m);
  if (at < 0) return { send: markdown.trim(), read: READ_PHOTO_SKILL_MD };
  return { send: markdown.slice(0, at).trim(), read: markdown.slice(at).trim() };
}

/** Módulos de prompt antigos que as skills de fotos substituem (seção que cada um vira). */
export const LEGACY_PHOTO_MODULES = { "legenda-foto": "produto", "vitrine-estoque": "vitrine", "catalogo-encontrado": "referencia", anexos: "anexos" } as const;

/**
 * Migração: cada seção da skill usa o texto do módulo antigo quando ele estava ATIVO (preserva o que a equipe
 * customizou e está em produção); módulo desligado ou ausente fica com o texto padrão da seção.
 */
export function mergePhotoSkillMarkdown(modules: { slug: string; isActive: boolean; contentMarkdown: string }[], sections: PhotoSection[] = Object.keys(PHOTO_SKILL_SECTIONS) as PhotoSection[]): string {
  return sections.map((section) => {
    const slug = (Object.keys(LEGACY_PHOTO_MODULES) as (keyof typeof LEGACY_PHOTO_MODULES)[]).find((key) => LEGACY_PHOTO_MODULES[key] === section);
    const legacy = modules.find((module) => module.slug === slug && module.isActive && module.contentMarkdown.trim());
    if (!legacy) return PHOTO_SKILL_SECTIONS[section];
    return `${PHOTO_SKILL_SECTIONS[section].split("\n")[0]}\n${legacy.contentMarkdown.trim()}`;
  }).join("\n\n");
}

/** Texto padrão antigo da skill de estoque: bases que nunca editaram recebem a versão nova (3 opções e ticket mínimo). */
export const LEGACY_ESTOQUE_MD = "## Protocolo\n1. Confirme a **cidade** do cliente antes de buscar (sem cidade, pergunte a cidade e a faixa de valor).\n2. Busque o estoque **na mesma rodada**, sem pedir permissão para buscar.\n3. Mostre só modelos com saldo em lojas da cidade do cliente; nunca ofereça produto disponível apenas em cidades distantes.\n4. Apresente no máximo 4 opções, com legenda curta (marca, modelo e preço).\n5. Se nada for encontrado, diga isso com clareza e ofereça alternativas próximas (outra marca ou faixa de preço).";

/** Texto padrão anterior da skill de estoque (v2): bases que nunca editaram recebem ESTOQUE_MD (ver studio-db). */
export const LEGACY_ESTOQUE_MD_V2 = "## Protocolo\n1. Confirme a **cidade** do cliente e se é **grau ou sol** antes de buscar.\n2. Busque o estoque **na mesma rodada**, sem pedir permissão para buscar.\n3. Mostre só modelos com saldo em lojas da cidade do cliente; nunca ofereça produto disponível apenas em cidades distantes.\n4. Apresente no máximo 3 opções distintas (nunca o mesmo modelo ou a mesma foto duas vezes), com legenda curta (marca, modelo e preço).\n5. Não priorize os mais baratos: sem pedido de algo em conta, respeite o ticket mínimo configurado em /ia.\n6. Se nada for encontrado, diga isso com clareza e ofereça alternativas próximas (outra marca ou faixa de preço).";

export const ESTOQUE_MD = "## Protocolo\n1. Para mostrar estoque você precisa da **cidade** (use a do cadastro ou da conversa; só pergunte se não souber) e saber se é **grau ou sol**; descubra o que faltar com naturalidade, sem pergunta pronta.\n2. Busque o estoque **na mesma rodada**, sem pedir permissão para buscar.\n3. Mostre só modelos com saldo em lojas da cidade do cliente; nunca ofereça produto disponível apenas em cidades distantes.\n4. Apresente no máximo 3 opções distintas (nunca o mesmo modelo ou a mesma foto duas vezes), com legenda curta (marca, modelo e preço).\n5. Não priorize os mais baratos: sem pedido de algo em conta, respeite o ticket mínimo configurado em /ia.\n6. Se nada for encontrado, diga isso com clareza e ofereça alternativas próximas (outra marca ou faixa de preço).";

/** Texto padrão anterior da skill pós-campanha (roteiro fixo de perguntas). */
export const LEGACY_CONSULTORIA_POS_CAMPANHA_MD = [
  "## Protocolo",
  "1. Cliente respondeu a uma campanha com frase genérica (\"Quero aproveitar!\", \"Tenho interesse\", \"Oi\"): **NÃO** mande fotos nem lista de produtos nesta resposta.",
  "2. Responda como consultora de ótica experiente: curta, natural e humana (1 a 2 frases), agradecendo o interesse, e faça **1 ou 2 perguntas rápidas** de qualificação: se procura **óculos de grau ou de sol**, o estilo/para quem é e em qual **cidade ou loja** quer ser atendido.",
  "3. Só depois que o cliente disser o que busca, consulte o catálogo com o filtro de categoria, cidade/loja e preço.",
  "4. Sugestões por iniciativa da IA respeitam o **ticket mínimo** configurado em /ia (padrão R$ 450,00); valores abaixo disso só se o cliente pedir algo mais barato ou der um orçamento menor.",
  "5. Mostre no máximo **3 opções distintas**, sem repetir modelo nem foto.",
].join("\n");

export const CONSULTORIA_POS_CAMPANHA_MD = [
  "## Protocolo",
  "1. Leia a mensagem da campanha que a loja enviou e responda **ao assunto dela** (oferta, reativação, pós-venda, convite): a resposta do cliente é uma reação àquilo, não um primeiro contato.",
  "2. Resposta genérica (\"Quero aproveitar!\", \"Tenho interesse\", \"Oi\", \"ok\"): **não** mande fotos nem lista de produtos ainda. Agradeça o interesse com naturalidade e descubra, com suas palavras e uma pergunta por vez, o que a pessoa procura (sem roteiro fixo e sem perguntar o que já está no cadastro, como a cidade).",
  "3. Mensagem vaga ou acidental (\"aa\", \"?\"): reaja como gente, comentando que parece ter cortado e retomando o assunto da campanha.",
  "4. Só depois que o cliente disser o que busca, consulte o catálogo com o filtro de categoria, cidade/loja e preço.",
  "5. Sugestões por iniciativa da IA respeitam o **ticket mínimo** configurado em /ia (padrão R$ 450,00); valores abaixo disso só se o cliente pedir algo mais barato ou der um orçamento menor.",
  "6. Mostre no máximo **3 opções distintas**, sem repetir modelo nem foto.",
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
    instructionsMd: ESTOQUE_MD,
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
  {
    name: "Envio de Fotos",
    slug: PHOTO_SKILL,
    triggerDescription: "Resposta com produto confirmado no estoque ou vitrine de opções (a foto é enviada pelo sistema junto com a resposta).",
    instructionsMd: PHOTO_SKILL_MD,
    isActive: true,
    sortOrder: 80,
    builtin: true,
    config: { ...PHOTO_SKILL_DEFAULTS },
  },
  {
    name: "Leitura de Fotos",
    slug: READ_PHOTO_SKILL,
    triggerDescription: "Cliente manda foto de um modelo (\"Tem esse?\") ou outro anexo (foto, áudio, PDF).",
    instructionsMd: READ_PHOTO_SKILL_MD,
    isActive: true,
    sortOrder: 85,
    builtin: true,
  },
];

const isSkillKey = (value: string): value is SkillKey => (SKILL_KEYS as readonly string[]).includes(value);

export function skillSlug(value: string): string {
  return plain(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "skill";
}

/** Normaliza o que veio da tela: nome obrigatório, slug derivado, limites de tamanho. */
export function normalizeSkillInput(input: AiSkillInput, current?: AiSkill): (Omit<AiSkill, "id" | "builtin" | "config"> & { config?: PhotoSkillConfig }) | { error: string } {
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
    // Parâmetros técnicos só existem na skill de fotos (campo ausente mantém o salvo).
    ...(slug === PHOTO_SKILL && current?.builtin ? { config: photoSkillConfig({ ...asRecord(current.config), ...asRecord(input.config) }) } : {}),
  };
}

/** Restaurar padrão da skill de fotos também volta os parâmetros (máximo de fotos e busca na web). */
export function defaultSkillConfig(slug: string): Record<string, unknown> | undefined {
  return slug === PHOTO_SKILL ? { ...PHOTO_SKILL_DEFAULTS } : undefined;
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

/** Slug do módulo de prompt que leva as instruções da skill ao motor (condição "@skill_<slug>"). */
export function skillModuleSlug(slug: string): string {
  return `skill-${slug}`.slice(0, 60);
}

/** Módulo de prompt da skill: é este texto que o motor da IA lê (/chat, Valentina e automações). */
export function skillModuleRow(skill: Pick<AiSkill, "name" | "slug" | "triggerDescription" | "instructionsMd" | "sortOrder">) {
  return {
    slug: skillModuleSlug(skill.slug),
    title: `Skill: ${skill.name}`,
    category: "fluxo" as const,
    contentMarkdown: `### Skill: ${skill.name}\nQuando acionar: ${skill.triggerDescription.trim() || "quando o assunto da conversa corresponder ao nome da skill"}\n${skill.instructionsMd.trim()}`,
    isActive: true,
    alwaysInclude: false,
    keywords: [`@skill_${skill.slug}`],
    priorityOrder: 165 + skill.sortOrder,
  };
}

/** Volta o texto do módulo da skill (skillModuleRow) para nome, gatilho e protocolo: base do histórico de versões. */
export function parseSkillModule(markdown: string): { name?: string; triggerDescription: string; instructionsMd: string } {
  const match = markdown.match(/^### Skill: ([^\n]*)\nQuando acionar: ([^\n]*)\n?([\s\S]*)$/);
  if (!match) return { triggerDescription: "", instructionsMd: markdown.trim() };
  const trigger = match[2].trim() === "quando o assunto da conversa corresponder ao nome da skill" ? "" : match[2].trim();
  return { name: match[1].trim(), triggerDescription: trigger, instructionsMd: match[3].trim() };
}

/** Texto padrão de fábrica de uma skill nativa ("Restaurar padrão"); null para skill customizada. */
export function defaultSkillInput(slug: string): AiSkillInput | null {
  const base = DEFAULT_SKILLS.find((skill) => skill.slug === slug);
  return base ? { name: base.name, triggerDescription: base.triggerDescription, instructionsMd: base.instructionsMd, ...(base.config ? { config: { ...base.config } } : {}) } : null;
}

/** Remove as tools das skills nativas desligadas (tools sem skill dona continuam). */
export function filterToolsBySkills<T extends { definition: { function: { name: string } } }>(tools: T[], skills: AiSkill[] | undefined): T[] {
  const blocked = new Set(SKILL_KEYS.filter((key) => !skillEnabled(skills, key)).flatMap((key) => SKILL_TOOLS[key].tools));
  return tools.filter((tool) => !blocked.has(tool.definition.function.name));
}

/** Transbordo desligado: só o pedido explícito de pessoa (palavras e limite de respostas) continua transferindo. */
export function applySkillsToSettings(settings: AiSettings, skills: AiSkill[] | undefined): AiSettings {
  // Encerramento pela IA: vale a skill "Encerramento Autônomo" (antigo "Quando a IA resolve sozinha" de /ia).
  // Fotos: a skill "Envio e Leitura de Fotos" é o único liga/desliga (desligada, nenhuma imagem sai).
  const closing = { ...settings, closeWhenResolved: skillEnabled(skills, "encerramento_autonomo"), sendProductImage: skills?.some((item) => item.builtin && item.slug === PHOTO_SKILL) ? photoSkillState(skills).enabled : settings.sendProductImage };
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
export type StudioPromptContext = { rules?: BusinessRule[]; skills?: AiSkill[]; knowledge?: KnowledgeChunkHit[]; /** Busca semântica (pgvector): fatos da loja e atendimentos parecidos. */ memory?: SemanticMemory };
