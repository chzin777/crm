/**
 * Postura de consultora de vendas ópticas: localização antes de ofertar estoque, orçamento como filtro real
 * e redação livre (sem aberturas fixas). Funções puras, usadas pelo agente e pelos testes.
 */
import { extractBudget, isProductBrowseRequest, wantsCheap, type Budget } from "@/lib/ai/catalog-context";
import { iconicModel, expandModelNicknames } from "@/lib/ai/product-names";
import { classifySearch } from "@/lib/ai/stock-showcase";

export const SALES_CONSULTANT_RULES = [
  "CONSULTORA DE VENDAS (regra fixa): você é uma consultora de óculos experiente, não um buscador. Seu objetivo é ajudar o cliente a escolher bem e chegar à loja.",
  "- REGRA DE OURO GEOGRÁFICA: nunca ofereça modelos que só existem em lojas de outra cidade ou estado. Lista de produtos só depois de saber a cidade do cliente; a busca usa sempre essa cidade.",
  "- ESPELHE O ESTILO: cliente curto e direto → respostas objetivas e ágeis; cliente caloroso ou inseguro → acolhedora e didática.",
  "- ARGUMENTE COMO VENDEDORA: ao sugerir 2 ou 3 opções, destaque em poucas palavras o diferencial prático de cada uma (leveza do acetato no dia a dia, discrição e resistência do metal, ótimo custo-benefício) e conduza ao próximo passo: provar na loja mais próxima ou mandar a receita para orçar as lentes junto.",
  "- SEM INTERROGATÓRIO: no máximo 1 ou 2 perguntas leves por mensagem, sempre ligadas a escolher o óculos certo (cidade, faixa de valor, estilo, uso).",
  "- REDAÇÃO ÚNICA: escreva cada abertura do zero, conectada ao que o cliente disse; não repita a estrutura das suas mensagens anteriores.",
  "- PROIBIDO clichê de robô: \"Como posso ajudá-lo hoje?\", \"Aguarde um instante enquanto verifico...\", \"Aqui estão os detalhes desse modelo!\" repetido, \"Em que mais posso ser útil?\".",
].join("\n");

/** Cidade desconhecida: pergunta antes de listar (e o orçamento, se o pedido foi genérico). */
export function cityFirstBlock(askBudget: boolean) {
  return [
    "CIDADE DESCONHECIDA (regra desta resposta): o cliente quer ver produtos, mas ainda não sabemos a cidade dele.",
    "NÃO consulte nem liste produtos agora. Responda de forma calorosa e natural, com suas palavras, perguntando de qual cidade (ou bairro/região) ele fala para separar modelos disponíveis pertinho dele.",
    askBudget ? "Como o pedido foi genérico, aproveite a mesma pergunta leve para entender a faixa de valor (ex.: \"até uns R$ 200, R$ 300?\") e, se couber, o estilo que ele curte. No máximo 2 perguntas." : "",
  ].filter(Boolean).join("\n");
}

/** Orçamento dito na conversa vira filtro da ferramenta (o modelo não precisa lembrar). */
export function budgetBlock(budget: Budget, cheap: boolean) {
  const parts = [
    budget.maxPrice ? `maxPrice ${budget.maxPrice}` : "",
    budget.minPrice ? `minPrice ${budget.minPrice}` : "",
    cheap ? "sortBy \"price_asc\"" : "",
  ].filter(Boolean);
  return parts.length ? `ORÇAMENTO DO CLIENTE: use em consultarEstoqueProduto ${parts.join(", ")}. Mostre só opções dentro disso.` : "";
}

/** Orçamento e "barata" ditos nesta mensagem ou antes (o mais recente vale). */
export function conversationBudget(texts: string[]): { budget: Budget; cheap: boolean } {
  let budget: Budget = {};
  for (const text of texts) {
    const found = extractBudget(text);
    if (found.maxPrice || found.minPrice) budget = found;
  }
  return { budget, cheap: texts.some(wantsCheap) };
}

/** Pedido de modelo específico (referência, apelido ou ícone): vale o fluxo de ficha, não a vitrine. */
export function asksSpecificModel(text: string) {
  const withoutMoney = text.replace(/(?:r\$\s*)?\d{2,5}(?:[.,]\d{2,3})*\s*(?:reais|real|conto|contos)?/gi, " ");
  return !!iconicModel(withoutMoney) || expandModelNicknames(withoutMoney) !== withoutMoney || /\b[a-z]{0,4}\d{3,}[a-z]?\b/i.test(withoutMoney);
}

/** A IA deve perguntar a cidade antes de listar produtos. */
export function needsCityFirst(input: { knownCity: string; text: string; photo: boolean; selectedProduct: boolean; queued: boolean }) {
  if (input.knownCity || input.photo || input.selectedProduct || input.queued) return false;
  return isProductBrowseRequest(input.text) && !asksSpecificModel(input.text);
}

/** Busca ampla (vitrine) sem cidade conhecida: a ferramenta não lista nada de outra cidade/estado. */
export function isGatedStockCall(args: Record<string, unknown>, input: { knownCity: string; fixedProduct: boolean }) {
  if (input.knownCity || input.fixedProduct || args._photo) return false;
  const term = typeof args.termoBusca === "string" ? args.termoBusca : "";
  const budgetOnly = typeof args.maxPrice === "number" || typeof args.minPrice === "number" || typeof args.sortBy === "string" || typeof args.tipo === "string";
  return (budgetOnly && !asksSpecificModel(term)) || classifySearch(term, args.tipoBusca) === "marca_ampla";
}

export function gatedStockResult(askBudget: boolean) {
  return {
    tipoBusca: "marca_ampla" as const,
    cenario: "cidade_desconhecida" as const,
    produtos: [] as [],
    modelos: [] as [],
    vitrineFormatada: null,
    orientacao: `Ainda não sabemos a cidade do cliente: NÃO liste produtos. ${cityFirstBlock(askBudget)}`,
  };
}

/** Preenche orçamento/tipo que o cliente já disse quando o modelo esquece de passar. */
export function withBudgetArgs(args: Record<string, unknown>, input: { budget: Budget; cheap: boolean; category: string }) {
  const next = { ...args };
  if (next.maxPrice === undefined && input.budget.maxPrice) next.maxPrice = input.budget.maxPrice;
  if (next.minPrice === undefined && input.budget.minPrice) next.minPrice = input.budget.minPrice;
  if (next.sortBy === undefined && input.cheap) next.sortBy = "price_asc";
  if (next.tipo === undefined && (next.maxPrice || next.minPrice || next.sortBy)) {
    const tipo = input.category === "ARMACAO" ? "grau" : input.category === "SOLAR" ? "sol" : input.category === "LENTE_CONTATO" ? "lente_contato" : "";
    if (tipo) next.tipo = tipo;
  }
  return next;
}

/**
 * Busca de catálogo já feita pelo código (correção de marca, cidade nova): a vitrine/ficha sai exatamente como veio,
 * mas a abertura é a que o modelo escreveu (sem prefixos fixos). Se ele já copiou o conteúdo, vale a resposta dele.
 */
export function mergeProactiveReply(llmReply: string, content: string) {
  const reply = llmReply.trim();
  const firstItem = content.split("\n").find((line) => /^\s*1[.)]\s/.test(line) || /^🕶️|^👓|^👁️/.test(line.trim()));
  if (reply && firstItem && reply.includes(firstItem.trim())) return reply;
  const opening = reply.split(/\s*(?:---SPLIT---|\[SPLIT\])\s*/i)[0].trim();
  // Só uma frase de abertura: nada de lista ou preço inventado pelo modelo antes da vitrine real.
  const usable = opening && opening.length <= 220 && !/\n\s*\d[.)]\s|R\$/.test(opening);
  return usable ? `${opening}\n${content}` : content;
}
