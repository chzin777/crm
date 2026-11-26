import seed from "@/lib/ai/prompt-modules.seed.json";
import { fillModule, type PromptModule } from "@/lib/ai/prompt-modules";

/**
 * Módulos padrão do seed (o que o banco recebe na primeira execução), para os testes do motor. Os textos que antes
 * eram constantes no código agora são módulos de /ia: estes atalhos apontam para o módulo que guarda cada um.
 */
export const SEED_MODULES: PromptModule[] = (seed as Omit<PromptModule, "id" | "isActive">[]).map((item) => ({ ...item, id: item.slug, isActive: true }));

export const seedText = (slug: string) => {
  const module = SEED_MODULES.find((item) => item.slug === slug);
  if (!module) throw new Error(`módulo ${slug} não existe no seed`);
  return module.contentMarkdown;
};

export const SECURITY_RULES = seedText("seguranca");
export const SECURITY_REMINDER = seedText("lembrete-seguranca");
export const INJECTION_ALERT = seedText("alerta-injecao");
export const BUSINESS_HARD_RULES = seedText("regras-criticas");
export const BRAND_RULES = seedText("identidade");
const PRODUCT_TOOLS = seedText("produtos-ferramentas");
export const IMAGE_RULE = PRODUCT_TOOLS;
export const PRODUCT_INFO_RULE = PRODUCT_TOOLS;
export const STOCK_RULES = PRODUCT_TOOLS;
export const BROAD_SEARCH_RULES = PRODUCT_TOOLS;
export const BRAND_TYPO_RULES = PRODUCT_TOOLS;
export const PRODUCT_CARD_RULES = PRODUCT_TOOLS;
export const DETAILS_RULES = PRODUCT_TOOLS;
export const CATALOG_FOUND_RULE = seedText("catalogo-encontrado");
export const IMAGE_CAPTION_RULE = seedText("legenda-foto");
export const STAFF_NAME_RULES = seedText("transbordo");
export const LOCATION_RULES = seedText("lojas");
const STYLE = seedText("naturalidade-formato");
export const NATURAL_RULES = STYLE;
export const FORMAT_RULES = STYLE;
export const CLOSING_RULES = STYLE;
export const ROUTING_RULES = seedText("roteamento-filas").split("\n\nFILAS DE TRANSBORDO")[0];
export const TRIAGE_NOW = seedText("triagem-agora");
export const ROUTE_NOW = seedText("transferir-agora");
export const SESSION_ANCHOR_RULES = seedText("ancora-sessao");
export const MEDIA_RULES = seedText("anexos");
export const PURE_GREETING_HINT = seedText("saudacao-pura");
export const GREETING_RULES = seedText("saudacao");
export const SALES_CONSULTANT_RULES = seedText("vitrine-estoque");

const FILES: Record<string, string> = { core: "identidade", saudacao: "saudacao", qualificacao: "qualificacao", "vitrine-estoque": "vitrine-estoque", "receituario-lentes": "receituario-lentes", "financeiro-crediario": "financeiro-crediario", "pos-venda-suporte": "pos-venda" };
export const PROMPT_MODULES = Object.keys(FILES);
/** Antigo lib/ai/prompts/<nome>.md, agora módulo do seed. */
export const loadPromptModule = (name: string) => seedText(FILES[name] ?? name);

/** Bloco da espera assistida (módulo "fila-espera") com o nome da fila. */
export const queuedAssistBlock = (queueName: string | null | undefined) => fillModule(seedText("fila-espera"), { fila_atual: queueName?.trim() ? `na fila ${queueName.trim()}` : "na fila de atendimento" });

import { assembleSystemPrompt } from "@/lib/ai/agent-core";
import { promptConditions, type PromptState } from "@/lib/ai/prompt-composer";
import { DEFAULT_AI_SETTINGS, type AiSettings } from "@/lib/ai/settings";
import { knowledgePromptBlock, type AiSkill, type BusinessRule } from "@/lib/ai/studio";
import { semanticMemoryBlock } from "@/lib/ai/vector-memory";
import { queueRoutingData, type RoutingQueue } from "@/lib/ai/routing";

/** Regras da empresa e skills como ficam depois da migração para módulos (mesma regra de prompt-modules-db). */
export function migratedModules(input: { rules?: BusinessRule[]; skills?: AiSkill[] }): PromptModule[] {
  const rules = (input.rules ?? []).map((rule): PromptModule => ({ id: `regra-${rule.slug}`, slug: `regra-${rule.slug}`, title: rule.title, category: "regras", contentMarkdown: `## ${rule.title}\n${rule.content.trim()}`, isActive: rule.active, alwaysInclude: rule.alwaysInclude, keywords: [...new Set([...rule.keywords, rule.title.toLowerCase()])], priorityOrder: 150 + rule.order }));
  const skills = (input.skills ?? []).filter((skill) => skill.instructionsMd.trim() || skill.triggerDescription.trim()).map((skill): PromptModule => ({ id: `skill-${skill.slug}`, slug: `skill-${skill.slug}`, title: `Skill: ${skill.name}`, category: "fluxo", contentMarkdown: `### Skill: ${skill.name}\nQuando acionar: ${skill.triggerDescription.trim() || "quando o assunto da conversa corresponder ao nome da skill"}\n${skill.instructionsMd.trim()}`, isActive: true, alwaysInclude: false, keywords: [`@skill_${skill.slug}`], priorityOrder: 165 + skill.sortOrder }));
  return [...rules, ...skills];
}

/** Módulos que entram pelo assunto (nomes dos antigos arquivos .md), pelas mesmas condições do motor. */
export function selectPromptModules(state: PromptState): string[] {
  const conditions = promptConditions(state);
  const names = ["core"];
  if (!state.hasGreetedInSession) names.push("saudacao");
  if (conditions.includes("@qualificar")) names.push("qualificacao");
  if (conditions.includes("@produto")) names.push("vitrine-estoque");
  if (conditions.includes("@receita")) names.push("receituario-lentes");
  if (conditions.includes("@financeiro")) names.push("financeiro-crediario");
  if (conditions.includes("@pos_venda")) names.push("pos-venda-suporte");
  return names;
}

/** Prompt do atendimento com os módulos do seed + regras/skills migradas + RAG e memória do estado. */
export function composeSystemPrompt(state: PromptState, settings: AiSettings = DEFAULT_AI_SETTINGS): string {
  const studio = state.studio;
  const knowledge = [knowledgePromptBlock(studio?.knowledge ?? []), semanticMemoryBlock(studio?.memory, (studio?.knowledge ?? []).map((hit) => hit.content))].filter(Boolean).join("\n\n");
  return assembleSystemPrompt({ modules: [...SEED_MODULES, ...migratedModules({ rules: studio?.rules, skills: studio?.skills })], settings, info: "", knowledge, firstReply: !state.hasGreetedInSession, prompt: { ...state, conversationText: state.conversationText ?? state.text }, skills: studio?.skills }).system;
}

/** Antigo agentRules: o prompt montado dos módulos do seed (sem os fatos do turno). */
export const agentRules = (settings: AiSettings, queues: RoutingQueue[] = []) => assembleSystemPrompt({ modules: SEED_MODULES, settings, queues, info: "" }).system;

/** Antigo bloco de filas: rótulo do módulo de roteamento + filas ativas. */
export const queueRoutingBlock = (queues: RoutingQueue[], hints: Record<string, string>) => {
  const data = queueRoutingData(queues, hints);
  return data ? `FILAS DE TRANSBORDO (escolha uma pelo queue_id ao transferir):\n${data}` : "";
};
