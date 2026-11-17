/**
 * Postura de consultora de vendas ópticas: localização antes de ofertar estoque, orçamento como filtro real
 * e redação livre (sem aberturas fixas). Funções puras, usadas pelo agente e pelos testes.
 */
import { cityQuestion, extractBudget, isProductBrowseRequest, wantsCheap, type Budget } from "@/lib/ai/catalog-context";
import { explicitBrand, mentionsKids } from "@/lib/ai/catalog-search";
import { BUBBLE_SPLIT, splitBubbles } from "@/lib/ai/bubbles";
import { parseShowcase } from "@/lib/ai/showcase-choice";
import { iconicModel, expandModelNicknames } from "@/lib/ai/product-names";
import { classifySearch } from "@/lib/ai/stock-showcase";

export const SALES_CONSULTANT_RULES = [
  "CONSULTORA DE VENDAS (regra fixa): você é uma consultora de óculos experiente, não um buscador. Seu objetivo é ajudar o cliente a escolher bem e chegar à loja.",
  "- REGRA DE OURO GEOGRÁFICA: nunca ofereça modelos que só existem em lojas de outra cidade ou estado. Lista de produtos só depois de saber a cidade do cliente; a busca usa sempre essa cidade.",
  "- ESPELHE O ESTILO: cliente curto e direto → respostas objetivas e ágeis; cliente caloroso ou inseguro → acolhedora e didática.",
  "- ARGUMENTE COMO VENDEDORA: ao sugerir 2 ou 3 opções, destaque em poucas palavras o diferencial prático de cada uma (leveza do acetato no dia a dia, discrição e resistência do metal, ótimo custo-benefício) e conduza ao próximo passo: provar na loja mais próxima ou mandar a receita para orçar as lentes junto.",
  "- FECHAMENTO ATIVO (regra fixa): depois de recomendar armações/óculos, termine SEMPRE com UMA pergunta direta e leve que avance a venda. PROIBIDO fechar de forma passiva com \"Se quiser, posso te ajudar...\", \"Se quiser, posso...\", \"Qualquer coisa estou à disposição\" ou \"Fico à disposição\". Exemplos: \"Qual desses estilos combinou mais com você? Se já tiver a receita, pode me mandar foto aqui que eu calculo as lentes junto!\" ou \"Quer que eu verifique em qual loja de <CIDADE> fica mais fácil pra você provar?\" (troque <CIDADE> pela cidade do cliente).",
  "- PÚBLICO ADULTO POR PADRÃO: não sugira linhas infantis/juvenis (Kids, Infantil, Junior, Teen) a menos que o cliente fale de criança, filho(a), neto(a), idade juvenil ou peça infantil.",
  "- GRAU OU SOL: se o cliente pedir \"óculos\" sem dizer se é de grau ou de sol (ex.: \"quero um óculos mais em conta\"), pergunte isso de forma leve junto com a cidade/faixa de valor, numa mensagem curta, antes de consultar o estoque; nunca despeje uma mistura de sol e grau.",
  "- TRANSPARÊNCIA DE PREÇO: ao mostrar valores de armações de grau, deixe claro com naturalidade que o valor é da armação e que as lentes de grau são orçadas à parte conforme a receita (grau e tratamentos), convidando a mandar foto da receita para o orçamento completo. Em óculos de sol (sem grau), reforce que o valor já é da peça completa, pronta pra usar.",
  "- SEM INTERROGATÓRIO: no máximo 1 ou 2 perguntas leves por mensagem, sempre ligadas a escolher o óculos certo (cidade, faixa de valor, estilo, uso).",
  "- REDAÇÃO ÚNICA: escreva cada abertura do zero, conectada ao que o cliente disse; não repita a estrutura das suas mensagens anteriores.",
  "- PROIBIDO clichê de robô: \"Como posso ajudá-lo hoje?\", \"Aguarde um instante enquanto verifico...\", \"Aqui estão os detalhes desse modelo!\" repetido, \"Em que mais posso ser útil?\".",
].join("\n");

/** Cidade desconhecida: pergunta antes de listar (e o orçamento, se o pedido foi genérico). */
export function cityFirstBlock(askBudget: boolean, askType = false) {
  return [
    "CIDADE DESCONHECIDA (regra desta resposta): o cliente quer ver produtos, mas ainda não sabemos a cidade dele.",
    "NÃO consulte nem liste produtos agora. Responda de forma calorosa e natural, com suas palavras, perguntando de qual cidade (ou bairro/região) ele fala para separar modelos disponíveis pertinho dele.",
    askType ? "Ele pediu \"óculos\" sem dizer o tipo: na MESMA mensagem curta, pergunte também se procura óculos de grau ou de sol (não misture os dois)." : "",
    askBudget ? "Como o pedido foi genérico, aproveite a mesma pergunta leve para entender a faixa de valor (ex.: \"até uns R$ 200, R$ 300?\")." : "",
    "Tudo numa mensagem só, leve e natural.",
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

export function gatedStockResult(askBudget: boolean, askType = false) {
  return {
    tipoBusca: "marca_ampla" as const,
    cenario: "cidade_desconhecida" as const,
    produtos: [] as [],
    modelos: [] as [],
    vitrineFormatada: null,
    orientacao: `Ainda não sabemos a cidade do cliente: NÃO liste produtos. ${cityFirstBlock(askBudget, askType)}`,
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

/** Fechamento passivo que não avança a venda ("Se quiser, posso te ajudar...", "Fico à disposição"). */
const PASSIVE_CLOSING = /^(se (quiser|preferir|precisar)|caso (queira|prefira|precise)|qualquer (coisa|d[uú]vida)|(fico|estou|sigo|fica) (a|à) (sua )?disposi[cç][aã]o|posso te ajudar (com|em) (mais )?(alguma|algo))/i;

/** CTA de avanço na venda: estilo + receita, ou a loja da cidade para provar. */
export function activeCta(input: { city?: string | null; variant?: number }) {
  const options = [
    "Qual desses estilos combinou mais com você? Se já tiver a receita, pode me mandar foto aqui que eu calculo as lentes junto!",
    input.city ? `Quer que eu verifique em qual loja de ${input.city} fica mais fácil pra você provar?` : "Quer que eu verifique qual loja fica mais fácil pra você provar?",
    "Qual deles você quer ver de pertinho primeiro? Se tiver a receita, me manda foto que eu já calculo as lentes junto!",
  ];
  return options[Math.abs(input.variant ?? 0) % options.length];
}

/**
 * Recomendação de produtos sempre termina com pergunta direta de avanço: a frase final passiva é trocada
 * pelo CTA e, sem pergunta no fim, o CTA entra como última bolha.
 */
export function activeClosing(reply: string, input: { city?: string | null; variant?: number }) {
  const parts = splitBubbles(reply);
  if (!parts.length) return reply;
  const last = parts[parts.length - 1];
  const cta = activeCta(input);
  if (parseShowcase(last).length) return [...parts, cta].join(`\n${BUBBLE_SPLIT}\n`);
  // Última frase do último balão (depois de . ! ? … ou quebra de linha).
  const body = last.trimEnd();
  let start = 0;
  for (const match of body.slice(0, -1).matchAll(/[.!?…]\s+|\n+/g)) start = (match.index ?? 0) + match[0].length;
  const sentence = body.slice(start).replace(/^[*_~\s]+/, "");
  if (PASSIVE_CLOSING.test(sentence)) {
    const kept = body.slice(0, start).trimEnd();
    return [...parts.slice(0, -1), kept ? `${kept} ${cta}` : cta].join(`\n${BUBBLE_SPLIT}\n`);
  }
  if (/\?\s*\S{0,4}$/u.test(body)) return reply;
  return [...parts.slice(0, -1), `${body} ${cta}`].join(`\n${BUBBLE_SPLIT}\n`);
}

/** O cliente falou de criança/adolescente em algum momento da conversa. */
export function conversationWantsKids(texts: string[]) {
  return texts.some((text) => mentionsKids(text));
}

const plainText = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** "Quero um óculos mais em conta", "tem óculos barato?": óculos sem dizer se é de grau ou de sol. */
export function isGenericGlassesRequest(text: string) {
  const source = plainText(text);
  return /\boculos\b/.test(source) && !/\b(grau|sol|solar|solares|escuros?|receita|armac(ao|oes)|lentes?|leitura|multifoca(l|is)|bifoca(l|is)|perto|longe)\b/.test(source) && !explicitBrand(text);
}

/**
 * Tipo (grau ou sol) ainda desconhecido num pedido genérico de óculos: pergunta antes de consultar o estoque,
 * para não misturar sol e grau. Vale enquanto o cliente não disser o tipo (a categoria da sessão fica vazia).
 */
export function needsTypeFirst(input: { category: string; brand: string; texts: string[]; photo: boolean; selectedProduct: boolean; queued: boolean }) {
  if (input.category || input.brand || input.photo || input.selectedProduct || input.queued) return false;
  return input.texts.some((text) => isGenericGlassesRequest(text) && !asksSpecificModel(text));
}

/** A resposta já pergunta se é de grau ou de sol. */
export function asksGlassesType(reply: string) {
  const source = plainText(reply);
  return /\bgrau\b[^?]{0,60}\bsol\b|\bsol\b[^?]{0,60}\bgrau\b/.test(source);
}

/** Qualificação numa mensagem curta: cidade, grau ou sol e faixa de valor (só o que falta). */
export function qualifyQuestion(input: { askCity: boolean; askType: boolean; askBudget: boolean; variant?: number }) {
  if (input.askCity && !input.askType) return cityQuestion({ askBudget: input.askBudget, variant: input.variant });
  const index = Math.abs(input.variant ?? 0) % 3;
  const both = [
    "Pra eu separar as melhores opções pertinho de você: de qual cidade você fala, e você procura óculos de grau ou de sol?",
    "Me conta duas coisinhas pra eu acertar na escolha: você é de qual cidade, e o óculos é de grau ou de sol?",
    "Pra já te mostrar o que tem numa loja perto de você: de qual cidade você está falando, e seria óculos de grau ou de sol?",
  ];
  const typeOnly = [
    "Você procura óculos de grau ou de sol?",
    "Seria óculos de grau ou de sol?",
    "Pra eu acertar nas opções: é óculos de grau ou de sol?",
  ];
  const budget = [
    " E tem uma faixa de valor em mente, tipo até uns R$ 200, R$ 300?",
    " E mais ou menos quanto você quer investir?",
    " Ah, e qual faixa de valor fica boa pra você?",
  ];
  return `${(input.askCity ? both : typeOnly)[index]}${input.askBudget ? budget[index] : ""}`;
}

/** Bloco do prompt: tipo desconhecido (e cidade conhecida) → pergunta grau ou sol antes de listar. */
export function typeFirstBlock(askBudget: boolean) {
  return [
    "TIPO DE ÓCULOS DESCONHECIDO (regra desta resposta): o cliente pediu \"óculos\" sem dizer se é de grau ou de sol.",
    "NÃO consulte nem liste produtos ainda (não misture sol e grau). Pergunte de forma leve e natural, em 1 mensagem curta, se ele procura óculos de grau ou de sol.",
    askBudget ? "Aproveite para entender a faixa de valor na mesma mensagem. No máximo 2 perguntas." : "",
  ].filter(Boolean).join("\n");
}

export function typeGatedResult(askBudget: boolean) {
  return {
    tipoBusca: "marca_ampla" as const,
    cenario: "tipo_desconhecido" as const,
    produtos: [] as [],
    modelos: [] as [],
    vitrineFormatada: null,
    orientacao: `O cliente ainda não disse se é óculos de grau ou de sol: NÃO liste produtos. ${typeFirstBlock(askBudget)}`,
  };
}

/** Busca de vitrine (marca/categoria/orçamento), não de um modelo específico. */
export function isBroadStockCall(args: Record<string, unknown>) {
  if (args._photo) return false;
  const term = typeof args.termoBusca === "string" ? args.termoBusca : "";
  const budgetOnly = typeof args.maxPrice === "number" || typeof args.minPrice === "number" || typeof args.sortBy === "string" || typeof args.tipo === "string";
  return (budgetOnly && !asksSpecificModel(term)) || classifySearch(term, args.tipoBusca) === "marca_ampla";
}

/** Notas de transparência comercial: armação de grau sem lentes; óculos de sol já completo. */
export const FRAME_PRICE_NOTE = "Lembrando que esses valores são da armação; as lentes de grau são orçadas à parte, conforme a sua receita (grau e tratamentos que você escolher).";
export const SUN_PRICE_NOTE = "E o valor já é do óculos de sol completo, pronto pra usar.";

/**
 * Valores apresentados: armação de grau (👓 na vitrine ou ficha "Armação de grau") ganha o aviso de que as lentes
 * são orçadas à parte; só óculos de sol ganha o aviso de peça completa. Se a IA já explicou, nada muda.
 */
export function priceTransparency(reply: string) {
  const parts = splitBubbles(reply);
  if (!parts.length) return reply;
  const text = parts.join("\n");
  const showcase = parts.flatMap((part) => part.split("\n").filter((line) => /^\s*\d{1,2}[.)]\s/.test(line) && /R\$/.test(line)));
  const cardPrice = /💵/.test(text);
  const frames = showcase.some((line) => line.includes("👓")) || (cardPrice && /Armação de grau/i.test(text));
  const sun = !frames && (showcase.some((line) => line.includes("🕶️")) || (cardPrice && /Óculos de sol/i.test(text)));
  const plain = plainText(text);
  let note = "";
  if (frames && !/\blentes?\b[^.?!]{0,80}\b(a parte|separad|parte|receita|orcad|orcament)/.test(plain)) note = FRAME_PRICE_NOTE;
  else if (sun && !/\b(completo|pronto pra usar|pronto para usar|peca completa)\b/.test(plain)) note = SUN_PRICE_NOTE;
  if (!note) return reply;
  const lastIndex = parts.length - 1;
  const last = parts[lastIndex];
  // A nota abre a bolha final (antes da pergunta); se a última bolha é a própria vitrine/ficha, vira uma bolha nova.
  if (lastIndex === 0 || showcase.some((line) => last.includes(line)) || /💵/.test(last)) return [...parts, note].join(`\n${BUBBLE_SPLIT}\n`);
  return [...parts.slice(0, -1), `${note} ${last}`].join(`\n${BUBBLE_SPLIT}\n`);
}

/** Pergunta redundante depois da ficha com lojas ("Quer que eu veja em quais lojas de Goiânia tem essa peça?"). */
const STORE_CHECK_QUESTION = /(?:^|(?<=[.!?…]\s)|(?<=\n))[^.!?\n]*\b(?:quer que eu|posso|gostaria que eu|deseja que eu)\s+(?:veja|verifique|confira|consulte|cheque|olhe)\b[^?\n]*\b(?:lojas?|unidades?|filia(?:l|is))\b[^?\n]*\?/giu;

/**
 * A ficha já traz as lojas com estoque (📍): no lugar de oferecer "ver as lojas", a pergunta convida a provar na
 * unidade mais perto ou mandar a receita.
 */
export function withoutRedundantStoreQuestion(reply: string) {
  if (!/📍/.test(reply) || !STORE_CHECK_QUESTION.test(reply)) return reply;
  STORE_CHECK_QUESTION.lastIndex = 0;
  return reply.replace(STORE_CHECK_QUESTION, "Quer passar na unidade mais perto de você pra provar? Se tiver a receita, me manda foto que eu já calculo as lentes junto!");
}
