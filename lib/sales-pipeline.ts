/**
 * Oportunidades automáticas no funil de vendas a partir da conversa (IA, receita, produto, loja, venda no ERP).
 * Puro (sem banco): recebe os cards do pipeline (JSON em CrmWorkspaceData "pipeline") e devolve os cards novos.
 *
 * Regra de ouro: evento automático só avança o card, nunca o faz voltar (o vendedor pode ter avançado à mão).
 */
import { STAGE_PROGRESS, orderedStages, type PipelineId, type StageConfig, type StageId } from "@/lib/pipeline-stages";

export const SALES_PIPELINE: PipelineId = "novos";

/** Etapas semânticas do funil → colunas configuradas do pipeline "novos". */
export type SalesStage = "qualificacao" | "orcamento" | "visita" | "ganho";
export const SALES_STAGE_COLUMN: Record<SalesStage, StageId> = { qualificacao: "novo-lead", orcamento: "em-atendimento", visita: "fechamento", ganho: "ganho" };

export type SalesTrigger = "interesse_produto" | "receita_enviada" | "orcamento_lentes" | "transbordo_vendas" | "visita_loja" | "venda_faturada" | "venda_manual";
export type SalesEvent = {
  type: SalesTrigger;
  /** Modelo de interesse ("Ray-Ban Aviator RB3025"). */
  product?: string | null;
  /** Valor estimado (preço do produto/orçamento) ou faturado (venda). */
  value?: number | null;
  /** Loja escolhida para visita/reserva. */
  store?: string | null;
  /** Resumo da receita ou do motivo do transbordo. */
  summary?: string | null;
};

const EVENT_STAGE: Record<SalesTrigger, SalesStage> = {
  interesse_produto: "qualificacao",
  receita_enviada: "orcamento",
  orcamento_lentes: "orcamento",
  transbordo_vendas: "orcamento",
  visita_loja: "visita",
  venda_faturada: "ganho",
  venda_manual: "ganho",
};
const EVENT_REASON: Record<SalesTrigger, string> = {
  interesse_produto: "Cliente demonstrou interesse em modelo específico",
  receita_enviada: "Cliente enviou receita médica",
  orcamento_lentes: "Cliente pediu orçamento de lentes",
  transbordo_vendas: "IA transferiu para a fila de Vendas",
  visita_loja: "Cliente pediu a loja para comprar/reservar",
  venda_faturada: "Venda faturada no ERP",
  venda_manual: "Venda marcada pelo vendedor",
};

export type CustomerType = "novo" | "recorrente";
export type CardNote = { id: string; texto: string; autor: string; criadoEm: string };
export type PurchaseRecord = { produto: string; data: string; valor: string };

/** Card do pipeline (mesmo JSON do Kanban) com os campos da oportunidade automática. */
export type PipelineCard = {
  id: string;
  pipelineId: PipelineId;
  titulo: string;
  cliente: string;
  telefone: string;
  email: string;
  dataNascimento: string;
  ultimasCompras: PurchaseRecord[];
  contactId?: string;
  tag: string;
  tagColor: string;
  valor: string;
  observacoes?: CardNote[];
  progresso: number;
  progressoCor: string;
  diasNaEtapa: string;
  iniciais: string;
  coluna: StageId;
  mensagem: string;
  entrouEmEtapaEm?: string;
  // Oportunidade automática (IA / conversa).
  conversationId?: string;
  customerType?: CustomerType;
  sourceTrigger?: SalesTrigger;
  estimatedValue?: number | null;
  autoMoveEnabled?: boolean;
  aiSummary?: string;
  receitaAnexada?: boolean;
  lojaInteresse?: string;
  produtoInteresse?: string;
  ultimaCompraResumo?: string;
  abertaEm?: string;
  valorFaturado?: number | null;
};

export type ContactInfo = { id: string; name: string; phone: string | null; email: string | null; birthDate?: string | null };
export type Recurrence = { type: CustomerType; lastPurchase: string | null };

export const CUSTOMER_TYPE_LABEL: Record<CustomerType, string> = { novo: "Novo Cliente", recorrente: "Cliente Recorrente" };
export const CUSTOMER_TYPE_COLOR: Record<CustomerType, string> = {
  novo: "bg-[#C4D600]/25 text-[#051647] dark:text-[#C4D600]",
  recorrente: "bg-[#002187]/10 text-[#002187] dark:bg-[#002187]/40 dark:text-white",
};

export const brl = (value: number) => `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** "R$ 1.290,00" → 1290 (preço do card do produto). */
export function parseBrl(value: string | null | undefined): number | null {
  if (!value) return null;
  const number = Number(value.replace(/[^\d,]/g, "").replace(",", "."));
  return Number.isFinite(number) && number > 0 ? number : null;
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "?";

/** Card aberto do contato no funil de vendas (ganho = fechado; outro evento abre um novo). */
export function openSalesCard(cards: PipelineCard[], contactId: string) {
  return cards.find((card) => card.pipelineId === SALES_PIPELINE && card.contactId === contactId && card.coluna !== "ganho") ?? null;
}

/** Posição da coluna no funil, na ordem configurada (coluna fora do funil = -1). */
export function stageRank(column: StageId, configs: Record<StageId, StageConfig>) {
  return orderedStages(SALES_PIPELINE, configs).findIndex((stage) => stage.id === column);
}

/** Resumo vivo do card: modelo, receita, loja e última compra (cada linha substitui a do mesmo tipo). */
function mergeSummary(current: string | undefined, label: string, value: string) {
  const lines = (current ?? "").split("\n").filter((line) => line && !line.startsWith(`${label}:`));
  return [...lines, `${label}: ${value}`].join("\n").slice(0, 1200);
}

export type ApplyResult = { cards: PipelineCard[]; card: PipelineCard | null; created: boolean; moved: boolean; note: string | null };

/**
 * Aplica um evento comercial da conversa: cria (ou atualiza) a oportunidade aberta do contato e avança a etapa
 * quando o evento leva a uma etapa posterior. Nunca regride; com autoMoveEnabled = false, só atualiza o resumo.
 */
export function applySalesEvent(cards: PipelineCard[], input: {
  contact: ContactInfo;
  conversationId?: string | null;
  event: SalesEvent;
  recurrence: Recurrence;
  configs: Record<StageId, StageConfig>;
  now?: Date;
  id?: () => string;
}): ApplyResult {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const newId = input.id ?? (() => crypto.randomUUID());
  const { event } = input;
  const target = SALES_STAGE_COLUMN[EVENT_STAGE[event.type]];
  const existing = openSalesCard(cards, input.contact.id);
  // Venda sem oportunidade aberta: nada a fechar (o sync do relacionamento cuida do pós-venda).
  if (!existing && (event.type === "venda_faturada" || event.type === "venda_manual")) return { cards, card: null, created: false, moved: false, note: null };

  const recurrence = existing?.customerType ? { type: existing.customerType, lastPurchase: existing.ultimaCompraResumo ?? null } : input.recurrence;
  let card: PipelineCard = existing ?? {
    id: newId(),
    pipelineId: SALES_PIPELINE,
    titulo: `${event.product ? event.product : event.type === "receita_enviada" ? "Lentes com receita" : "Oportunidade"} - ${input.contact.name}`.slice(0, 120),
    cliente: input.contact.name,
    telefone: input.contact.phone ?? "",
    email: input.contact.email ?? "",
    dataNascimento: input.contact.birthDate ?? "",
    ultimasCompras: [],
    contactId: input.contact.id,
    tag: CUSTOMER_TYPE_LABEL[recurrence.type],
    tagColor: CUSTOMER_TYPE_COLOR[recurrence.type],
    valor: brl(0),
    observacoes: [],
    progresso: STAGE_PROGRESS[target],
    progressoCor: "bg-[#C4D600]",
    diasNaEtapa: "Novo",
    iniciais: initials(input.contact.name),
    coluna: target,
    mensagem: "",
    entrouEmEtapaEm: nowIso,
    customerType: recurrence.type,
    sourceTrigger: event.type,
    estimatedValue: null,
    autoMoveEnabled: true,
    aiSummary: recurrence.type === "recorrente" && recurrence.lastPurchase ? `Última compra: ${recurrence.lastPurchase}` : "",
    ultimaCompraResumo: recurrence.lastPurchase ?? undefined,
    abertaEm: nowIso,
  };
  const created = !existing;
  card = { ...card, conversationId: input.conversationId ?? card.conversationId, customerType: card.customerType ?? recurrence.type };
  // Card antigo (sync ou manual) ganha o selo Novo/Recorrente na primeira vez que a conversa o toca.
  if (!existing?.customerType && existing) card = { ...card, tag: CUSTOMER_TYPE_LABEL[recurrence.type], tagColor: CUSTOMER_TYPE_COLOR[recurrence.type], ultimaCompraResumo: recurrence.lastPurchase ?? undefined, abertaEm: card.abertaEm ?? nowIso, autoMoveEnabled: card.autoMoveEnabled ?? true };

  // Resumo vivo e valores.
  if (event.product) card = { ...card, produtoInteresse: event.product, aiSummary: mergeSummary(card.aiSummary, "Modelo de interesse", event.product) };
  if (event.store) card = { ...card, lojaInteresse: event.store, aiSummary: mergeSummary(card.aiSummary, "Loja de preferência", event.store) };
  if (event.type === "receita_enviada") card = { ...card, receitaAnexada: true, aiSummary: mergeSummary(card.aiSummary, "Receita", (event.summary ?? "recebida").replace(/^Receita — /, "")) };
  if (event.type === "transbordo_vendas" && event.summary) card = { ...card, aiSummary: mergeSummary(card.aiSummary, "Transbordo", event.summary) };
  const isSale = event.type === "venda_faturada" || event.type === "venda_manual";
  if (isSale && event.value) card = { ...card, valorFaturado: event.value, valor: brl(event.value) };
  else if (event.value && event.value > 0) card = { ...card, estimatedValue: event.value, valor: brl(event.value) };

  // Etapa: só avança (posição na ordem configurada); automação pausada no card não move.
  const currentRank = stageRank(card.coluna, input.configs);
  const targetRank = stageRank(target, input.configs);
  const canMove = !created && card.autoMoveEnabled !== false && targetRank > currentRank;
  let note: string | null = null;
  if (canMove) {
    const title = input.configs[target]?.titulo ?? target;
    note = `🤖 Movido automaticamente para '${title}' — ${EVENT_REASON[event.type]}${event.store ? ` (${event.store})` : ""}`;
    card = { ...card, coluna: target, progresso: STAGE_PROGRESS[target], diasNaEtapa: "Atualizado agora", entrouEmEtapaEm: nowIso };
  } else if (created) {
    note = `🤖 Oportunidade criada automaticamente em '${input.configs[target]?.titulo ?? target}' — ${EVENT_REASON[event.type]} (${CUSTOMER_TYPE_LABEL[recurrence.type]})`;
  }
  if (note) card = { ...card, observacoes: [{ id: newId(), texto: note, autor: "IA", criadoEm: nowIso }, ...(card.observacoes ?? [])] };

  const next = created ? [card, ...cards] : cards.map((item) => (item.id === card.id ? card : item));
  return { cards: next, card, created, moved: canMove, note };
}

/** Mudança de etapa feita pelo vendedor (seletor do /chat): registra no histórico do card. */
export function moveCardManually(cards: PipelineCard[], input: { cardId: string; column: StageId; author: string; configs: Record<StageId, StageConfig>; now?: Date; id?: () => string }): { cards: PipelineCard[]; card: PipelineCard | null } {
  const card = cards.find((item) => item.id === input.cardId);
  if (!card || card.pipelineId !== SALES_PIPELINE || stageRank(input.column, input.configs) < 0) return { cards, card: null };
  if (card.coluna === input.column) return { cards, card };
  const nowIso = (input.now ?? new Date()).toISOString();
  const title = input.configs[input.column]?.titulo ?? input.column;
  const updated: PipelineCard = {
    ...card,
    coluna: input.column,
    progresso: STAGE_PROGRESS[input.column],
    diasNaEtapa: "Atualizado agora",
    entrouEmEtapaEm: nowIso,
    observacoes: [{ id: (input.id ?? (() => crypto.randomUUID()))(), texto: `Movido para '${title}' pelo vendedor no atendimento`, autor: input.author, criadoEm: nowIso }, ...(card.observacoes ?? [])],
  };
  return { cards: cards.map((item) => (item.id === card.id ? updated : item)), card: updated };
}

const plain = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** Pedido de orçamento de lentes / armação + lente. */
const QUOTE = /\b(orcamento|orcar|quanto (fica|sai|custa) (a |as |uma |um )?(lente|lentes|oculos de grau)|lentes? (de grau|multifoca\w*|progressiva\w*|para (perto|longe))|fazer (meus |um )?oculos de grau|armacao (com|e|\+) lentes?)\b/;
/** Ida à loja para comprar/reservar. */
const VISIT = /\b(reserva(r|e)?|separa(r)?( pra mim| para mim)?|vou (ai|la|na loja|passar)|passo (ai|la|na loja)|quero (ir|passar) (na|ai|la)|comprar (na|ai) loja|vou comprar|vou buscar|posso buscar|retirar na loja)\b/;

/**
 * Eventos comerciais deste turno (saudação e dúvida geral não geram nada):
 * receita lida, produto consultado com preço, pedido de orçamento, loja pedida para comprar/reservar.
 */
export function detectSalesEvents(input: {
  pendingText: string;
  prescriptions?: string[];
  product?: { name: string; price: number | null } | null;
  /** Produto já em foco na sessão (ficha enviada antes). */
  anchoredProduct?: string | null;
  locationStore?: string | null;
}): SalesEvent[] {
  const text = plain(input.pendingText);
  const events: SalesEvent[] = [];
  for (const summary of input.prescriptions ?? []) events.push({ type: "receita_enviada", summary });
  if (input.product) events.push({ type: "interesse_produto", product: input.product.name, value: input.product.price });
  if (!input.prescriptions?.length && QUOTE.test(text)) events.push({ type: "orcamento_lentes" });
  const product = input.product?.name ?? input.anchoredProduct ?? null;
  // Loja pedida conta como visita quando há produto em foco (ir comprar) ou o cliente fala em reservar/ir à loja.
  if ((input.locationStore && (product || VISIT.test(text))) || VISIT.test(text)) events.push({ type: "visita_loja", store: input.locationStore ?? null, product });
  return events;
}

/** Fila comercial (transbordo que vira evento de orçamento). */
export const isSalesQueue = (name: string | null | undefined) => !!name && /venda|comercial/i.test(plain(name));

/** Ficha de produto enviada pela IA ("*Prada Linea Rossa | Ref. PS 07RV*" ... "*Valor:* R$ 1.290,00") → interesse. */
export function productFromCard(text: string): { name: string; price: number | null } | null {
  const title = /\*([^*|\n]+?)\s*\|\s*Ref\.\s*([^*\n]+?)\*/.exec(text);
  if (!title) return null;
  const price = /Valor:\*?\s*(R\$\s*[\d.,]+)/i.exec(text);
  return { name: `${title[1].trim()} ${title[2].trim()}`.slice(0, 80), price: parseBrl(price?.[1]) };
}
