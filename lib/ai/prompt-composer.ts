import { readFileSync } from "node:fs";
import path from "node:path";
import { isProductBrowseRequest } from "@/lib/ai/catalog-context";
import { isInstallmentQuestion } from "@/lib/ai/installments";
import { semanticMemoryBlock } from "@/lib/ai/vector-memory";
import { businessRulesBlock, knowledgePromptBlock, selectBusinessRules, skillEnabled, skillsPromptBlock, type StudioPromptContext } from "@/lib/ai/studio";

/**
 * Dynamic Prompt Composition: o prompt de sistema é montado a partir de módulos Markdown curtos em
 * lib/ai/prompts/*.md, escolhidos pelo estado/intenção da conversa. Só servidor (lê arquivos); cache em memória
 * em produção, leitura a cada chamada em desenvolvimento (edição do .md vale sem reiniciar).
 */
export const PROMPT_MODULES = ["core", "saudacao", "qualificacao", "vitrine-estoque", "receituario-lentes", "financeiro-crediario", "pos-venda-suporte"] as const;
export type PromptModule = (typeof PROMPT_MODULES)[number];

const PROMPTS_DIR = path.join(process.cwd(), "lib", "ai", "prompts");
const cache = new Map<PromptModule, string>();

export function promptModulePath(name: PromptModule) {
  return path.join(PROMPTS_DIR, `${name}.md`);
}

/** Texto do módulo (sem espaços nas pontas). Arquivo ausente é erro: a IA não responde sem as regras. */
export function loadPromptModule(name: PromptModule): string {
  const cached = process.env.NODE_ENV === "production" ? cache.get(name) : undefined;
  if (cached !== undefined) return cached;
  const text = readFileSync(promptModulePath(name), "utf8").replace(/\r\n/g, "\n").trim();
  cache.set(name, text);
  return text;
}

/** Estado da conversa que decide os módulos. text: mensagem atual do cliente (com a transcrição do áudio). */
export type PromptState = {
  hasGreetedInSession: boolean;
  text?: string;
  /** Marca ativa da sessão (aiContext.activeBrand). */
  activeBrand?: string;
  /** Cidade da sessão (aiContext.preferredCity). */
  preferredCity?: string;
  /** Categoria da sessão: ARMACAO, SOLAR ou LENTE_CONTATO. */
  category?: string;
  /** Há vitrine/ficha de produto nesta resposta ou na sessão. */
  showcase?: boolean;
  /** Estúdio de IA: regras da empresa (Markdown), skills e trechos da base de conhecimento (RAG). */
  studio?: StudioPromptContext;
  /** Texto da conversa usado para casar as palavras-chave das regras (padrão: text). */
  conversationText?: string;
};

const plain = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const PRESCRIPTION = /\b(receitas?|receituario|graus?\s+(da|do|de\s+minha|de\s+meu)|meus\s+graus|miopia|astigmatismo|hipermetropia|presbiopia|antirreflex[oa]s?|anti[\s-]?reflex[oa]s?|multifoca(l|is)|progressiv[ao]s?|lentes?\s+(de\s+grau|oftalmic[ao]s?)|luz\s+azul|blue\s*cut|fotossensive(l|is)|transitions|esferico|cilindrico|dioptria)\b/;
const FINANCIAL = /\b(boletos?|crediario|carne|segunda\s+via|2a\s+via|parcelas?\s+(em\s+aberto|atrasad[ao]s?|do\s+crediario|vencid[ao]s?))\b/;
const AFTER_SALES = /\b(garantia|ajust(e|ar|ou)|consert(o|ar)|quebr(ou|ado|ada)|soltou|torto|torta|entrega|entregue|status|ordem\s+de\s+servico|minha\s+os|ficou\s+pronto|ja\s+esta\s+pronto|meu\s+pedido|retirar\s+meu|retirar\s+minha)\b/;
const PRICE = /\b(orcamento|quanto\s+(custa|sai|fica)|preco|valor(es)?\s+d[aoe]s?\s+(armac|oculos|modelo)|modelos?|marcas?)\b/;

export function isFinancialTopic(text: string) {
  return isInstallmentQuestion(text) || FINANCIAL.test(plain(text));
}
export function isPrescriptionTopic(text: string) {
  return PRESCRIPTION.test(plain(text));
}
export function isAfterSalesTopic(text: string) {
  return AFTER_SALES.test(plain(text));
}

/** Módulos compatíveis com o estágio/intenção, na ordem em que entram no prompt. */
export function selectPromptModules(state: PromptState): PromptModule[] {
  const text = state.text ?? "";
  const financial = isFinancialTopic(text);
  const prescription = isPrescriptionTopic(text);
  const afterSales = !financial && isAfterSalesTopic(text);
  // Interesse em produto: pedido de óculos/marca nesta mensagem ou marca/categoria ativa na sessão.
  const browsing = isProductBrowseRequest(text) || PRICE.test(plain(text));
  const sessionProduct = !!state.activeBrand || !!state.category || !!state.showcase;
  // Pagamento e pós-venda não carregam vitrine, a menos que o cliente fale de produto nesta mesma mensagem.
  const productInterest = financial || afterSales ? isProductBrowseRequest(text) && !financial : browsing || sessionProduct;
  const modules: PromptModule[] = ["core"];
  if (!state.hasGreetedInSession) modules.push("saudacao");
  if (productInterest && (!state.preferredCity || !state.category)) modules.push("qualificacao");
  if (productInterest || prescription) modules.push("vitrine-estoque");
  if (prescription && skillEnabled(state.studio?.skills, "calculo_lentes")) modules.push("receituario-lentes");
  if (financial && skillEnabled(state.studio?.skills, "crediario_aprovacao")) modules.push("financeiro-crediario");
  if (afterSales) modules.push("pos-venda-suporte");
  return modules;
}

/**
 * Prompt dos módulos escolhidos, separados por linha em branco, seguido do que o time edita no Estúdio de IA:
 * regras da empresa ligadas ao assunto da conversa (ou "sempre incluir"), skills e trechos do RAG.
 */
export function composeSystemPrompt(state: PromptState): string {
  const studio = state.studio;
  return [
    ...selectPromptModules(state).map(loadPromptModule),
    studio?.rules ? businessRulesBlock(selectBusinessRules(studio.rules, state.conversationText ?? state.text ?? "")) : "",
    skillsPromptBlock(studio?.skills),
    knowledgePromptBlock(studio?.knowledge ?? []),
    semanticMemoryBlock(studio?.memory, (studio?.knowledge ?? []).map((hit) => hit.content)),
  ].filter(Boolean).join("\n\n");
}
