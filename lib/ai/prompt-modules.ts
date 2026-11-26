import { keywordMatches } from "@/lib/ai/studio";

/**
 * Módulos de prompt da IA (tabela AiPromptModule, editados em /ia). O código não guarda nenhuma instrução: o prompt
 * de sistema é só a junção dos módulos ativos, na ordem de prioridade. Sem módulo ativo (ou todos vazios), não há
 * mensagem "system". Puro (sem banco): o mesmo montador serve o WhatsApp, o copiloto, a inspeção e o teste de /ia.
 */

export const MODULE_CATEGORIES = ["persona", "regras", "conhecimento", "lojas", "fluxo"] as const;
export type ModuleCategory = (typeof MODULE_CATEGORIES)[number];

export type PromptModule = {
  id: string;
  slug: string;
  title: string;
  category: ModuleCategory;
  contentMarkdown: string;
  isActive: boolean;
  /** Entra sempre que ativo; senão é sob demanda (palavra-chave da conversa ou condição @). */
  alwaysInclude: boolean;
  /** Gatilhos sob demanda: palavras da conversa (sem acento/caixa) ou condições do motor começando com "@". */
  keywords: string[];
  priorityOrder: number;
};

/** Condições do motor que um módulo sob demanda pode usar como gatilho (com descrição para a tela). */
export const MODULE_CONDITIONS: Record<string, string> = {
  "@atendimento": "Atendimento da IA no WhatsApp e no teste de /ia",
  "@copiloto": "Sugestão de resposta do copiloto no /chat",
  "@primeira_resposta": "Primeira resposta da IA na conversa",
  "@ja_respondeu": "A IA já respondeu nesta conversa",
  "@saudacao_pura": "Cliente mandou só um cumprimento",
  "@qualificar": "Interesse em produto sem cidade ou tipo definidos",
  "@produto": "Assunto de produto, vitrine ou preço",
  "@receita": "Assunto de receita, graus ou lentes",
  "@financeiro": "Boleto, carnê, parcelas ou crediário",
  "@pos_venda": "Garantia, ajuste, entrega ou pedido",
  "@midia": "Cliente enviou foto, áudio ou documento",
  "@catalogo_encontrado": "Produto da foto encontrado no catálogo",
  "@legenda_foto": "Envio de foto do produto ligado",
  "@alerta_injecao": "Tentativa de manipular a IA detectada",
  "@triagem": "Pediu atendente sem dizer o assunto",
  "@transferir_agora": "Pediu pessoa com assunto claro",
  "@fila_espera": "Conversa aguardando na fila (espera assistida)",
  "@escolhe_fila": "A IA escolhe a fila do transbordo",
  "@pode_encerrar": "Encerramento autônomo ligado",
  "@skills_ativas": "Há skills ativas",
  "@skill_off_estoque_cidade": "Skill de estoque desligada",
  "@skill_off_leitura_receita": "Skill de leitura de receita desligada",
  "@skill_off_calculo_lentes": "Skill de orçamento de lentes desligada",
  "@skill_off_crediario_aprovacao": "Skill de crediário desligada",
};

/** Variáveis preenchidas pelo motor no momento da resposta ({{nome}} no Markdown). */
export const MODULE_VARIABLES: Record<string, string> = {
  nome_agente: "Nome da IA (Motor)",
  data_hora: "Data e hora de Brasília",
  hora: "Hora de Brasília (HH:MM)",
  periodo: "manhã, tarde ou noite",
  saudacao_periodo: "Bom dia, Boa tarde ou Boa noite",
  base_conhecimento: "Lojas, horários, preços e documentos ligados na Base de Conhecimento",
  trechos_conhecimento: "Trechos da Base de Conhecimento e memória parecidos com a mensagem",
  contexto_do_turno: "Fatos calculados pelo motor nesta resposta (busca feita, foto lida, loja resolvida...)",
  filas: "Filas de transbordo cadastradas",
  fila_atual: "Fila em que o cliente aguarda",
  nome_atendente: "Primeiro nome do atendente (copiloto)",
  perfil_cliente: "Perfil do cliente (copiloto)",
};

export type AssembleInput = {
  /** Texto da conversa (mensagem atual + recentes) para os gatilhos por palavra. */
  conversationText: string;
  /** Condições verdadeiras neste turno (ex.: "@primeira_resposta"). */
  conditions: Iterable<string>;
  vars: Partial<Record<string, string>>;
};

export type UsedModule = { id: string; slug: string; title: string; category: ModuleCategory; reason: string; tokens: number };
export type AssembledPrompt = { system: string; used: UsedModule[]; tokens: number };

/** Estimativa de tokens (≈ 4 caracteres por token em português). */
export const estimateTokens = (text: string) => (text.trim() ? Math.ceil(text.trim().length / 4) : 0);

const VAR = /\{\{\s*([a-z_]+)\s*\}\}/g;

/** Preenche {{variáveis}}; parágrafo cujas variáveis ficaram todas vazias sai inteiro (sem rótulo solto). */
export function fillModule(content: string, vars: Partial<Record<string, string>>) {
  return content.replace(/\r\n/g, "\n").split(/\n{2,}/).map((paragraph) => {
    const names = [...paragraph.matchAll(VAR)].map((match) => match[1]);
    if (names.length && names.every((name) => !(vars[name] ?? "").trim())) return "";
    return paragraph.replace(VAR, (_, name: string) => (vars[name] ?? "").trim());
  }).map((paragraph) => paragraph.trim()).filter(Boolean).join("\n\n");
}

/** Por que o módulo entra (ou null): sempre, condição do motor ou palavra-chave da conversa. */
export function moduleReason(module: PromptModule, input: Pick<AssembleInput, "conversationText" | "conditions">): string | null {
  if (!module.isActive || !module.contentMarkdown.trim()) return null;
  if (module.alwaysInclude) return "sempre";
  const conditions = new Set(input.conditions);
  for (const keyword of module.keywords) {
    const key = keyword.trim();
    if (!key) continue;
    if (key.startsWith("@")) {
      if (conditions.has(key.toLowerCase())) return `condição ${key}`;
    } else if (keywordMatches(input.conversationText, key)) return `palavra "${key}"`;
  }
  return null;
}

export const sortModules = <T extends Pick<PromptModule, "priorityOrder" | "title">>(modules: T[]) =>
  [...modules].sort((a, b) => a.priorityOrder - b.priorityOrder || a.title.localeCompare(b.title, "pt-BR"));

/** Prompt de sistema = módulos que entram, na ordem de prioridade, separados por linha em branco. Nada além disso. */
export function assemblePrompt(modules: PromptModule[], input: AssembleInput): AssembledPrompt {
  const used: UsedModule[] = [];
  const parts: string[] = [];
  for (const module of sortModules(modules)) {
    const reason = moduleReason(module, input);
    if (!reason) continue;
    const text = fillModule(module.contentMarkdown, input.vars);
    if (!text) continue;
    parts.push(text);
    used.push({ id: module.id, slug: module.slug, title: module.title, category: module.category, reason, tokens: estimateTokens(text) });
  }
  const system = parts.join("\n\n");
  return { system, used, tokens: estimateTokens(system) };
}

/** O prompt pede a resposta em JSON: só então a chamada usa response_format json (senão o modelo responde livre). */
export const wantsJson = (system: string) => /\bjson\b/i.test(system);

/** Normaliza o que veio da tela. */
export function normalizeModuleInput(input: Partial<PromptModule>, current?: PromptModule): Omit<PromptModule, "id"> | { error: string } {
  const title = String(input.title ?? current?.title ?? "").trim().slice(0, 120);
  if (!title) return { error: "Informe o título do módulo." };
  const category = MODULE_CATEGORIES.includes(input.category as ModuleCategory) ? (input.category as ModuleCategory) : current?.category ?? "regras";
  const rawSlug = String(input.slug ?? current?.slug ?? title);
  const slug = rawSlug.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "modulo";
  const keywords = [...new Set((Array.isArray(input.keywords) ? input.keywords : current?.keywords ?? []).map((item) => String(item).trim().toLowerCase()).filter(Boolean))].slice(0, 60).map((item) => item.slice(0, 60));
  return {
    slug,
    title,
    category,
    contentMarkdown: String(input.contentMarkdown ?? current?.contentMarkdown ?? "").replace(/\r\n/g, "\n"),
    isActive: input.isActive ?? current?.isActive ?? true,
    alwaysInclude: input.alwaysInclude ?? current?.alwaysInclude ?? false,
    keywords,
    priorityOrder: Number.isFinite(Number(input.priorityOrder)) ? Math.trunc(Number(input.priorityOrder)) : current?.priorityOrder ?? 1000,
  };
}
