import { isProductBrowseRequest } from "@/lib/ai/catalog-context";
import { isInstallmentQuestion } from "@/lib/ai/installments";
import { skillEnabled, type AiSkill, type StudioPromptContext } from "@/lib/ai/studio";

/**
 * Estado/intenção da conversa → condições "@..." que os módulos sob demanda de /ia usam como gatilho. Aqui não há
 * nenhum texto de prompt: só a detecção do assunto (o conteúdo vem todo dos módulos Markdown do banco).
 */

/** Estado da conversa. text: mensagem atual do cliente (com a transcrição do áudio). */
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
  /** Estúdio de IA: skills e trechos da base de conhecimento (RAG). */
  studio?: StudioPromptContext;
  /** Texto da conversa usado para casar as palavras-chave dos módulos (padrão: text). */
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

/** Condições de assunto deste turno: @produto, @qualificar, @receita, @financeiro, @pos_venda. */
export function promptConditions(state: Partial<PromptState>): string[] {
  const text = state.text ?? "";
  const financial = isFinancialTopic(text);
  const prescription = isPrescriptionTopic(text);
  const afterSales = !financial && isAfterSalesTopic(text);
  // Interesse em produto: pedido de óculos/marca nesta mensagem ou marca/categoria ativa na sessão.
  const browsing = isProductBrowseRequest(text) || PRICE.test(plain(text));
  const sessionProduct = !!state.activeBrand || !!state.category || !!state.showcase;
  // Pagamento e pós-venda não carregam vitrine, a menos que o cliente fale de produto nesta mesma mensagem.
  const productInterest = financial || afterSales ? isProductBrowseRequest(text) && !financial : browsing || sessionProduct;
  const conditions: string[] = [];
  if (productInterest && (!state.preferredCity || !state.category)) conditions.push("@qualificar");
  if (productInterest || prescription) conditions.push("@produto");
  if (prescription && skillEnabled(state.studio?.skills, "calculo_lentes")) conditions.push("@receita");
  if (financial && skillEnabled(state.studio?.skills, "crediario_aprovacao")) conditions.push("@financeiro");
  if (afterSales) conditions.push("@pos_venda");
  return conditions;
}

/** Skills: "@skill_<slug>" para cada ativa, "@skills_ativas" se houver alguma, "@skill_off_<slug>" das nativas desligadas. */
export function skillConditions(skills: AiSkill[] | undefined): string[] {
  if (!skills?.length) return [];
  const conditions = skills.filter((skill) => skill.isActive).map((skill) => `@skill_${skill.slug}`);
  if (conditions.length) conditions.push("@skills_ativas");
  for (const key of ["estoque_cidade", "leitura_receita", "calculo_lentes", "crediario_aprovacao"] as const) if (!skillEnabled(skills, key)) conditions.push(`@skill_off_${key}`);
  return conditions;
}
