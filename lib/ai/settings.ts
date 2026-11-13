import { brClock } from "@/lib/br-time";

/**
 * Parâmetros da IA definidos pelo administrador na página Inteligência Artificial (/ia).
 * Puro (sem banco) para ser usado na tela, nas rotas e nos testes.
 */

export type AiKnowledgeTopic = { id: string; title: string; enabled: boolean; content: string };
export type AiScheduleSlot = { day: number; start: string; end: string };

export type AiTone = "acolhedor" | "profissional" | "descontraido" | "objetivo";
export const AI_TONES: { id: AiTone; label: string; hint: string; instruction: string }[] = [
  { id: "acolhedor", label: "Acolhedor", hint: "Próximo e gentil, sem exageros.", instruction: "Tom acolhedor e gentil, próximo do cliente, sem exageros nem intimidade forçada." },
  { id: "profissional", label: "Profissional", hint: "Cordial e formal, trata por senhor(a).", instruction: "Tom profissional e cordial; trate o cliente por senhor ou senhora e evite gírias e emojis." },
  { id: "descontraido", label: "Descontraído", hint: "Leve, com emojis moderados.", instruction: "Tom leve e descontraído, com no máximo um emoji por mensagem, sem perder a clareza." },
  { id: "objetivo", label: "Objetivo", hint: "Curto e direto ao ponto.", instruction: "Tom objetivo: respostas curtas e diretas, no máximo duas frases quando possível." },
];

export type AiSettings = {
  /** Liga o atendimento autônomo (o copiloto do atendente funciona sempre que houver chave). */
  autonomousEnabled: boolean;
  /** Nome com que a IA se apresenta ao cliente. */
  agentName: string;
  /** Tom de voz das respostas ao cliente. */
  tone: AiTone;
  /** Atende na entrada, no lugar do menu automático. */
  attendAtEntry: boolean;
  /** Filas em que a IA atende quem está aguardando, enquanto ninguém assume. */
  queueIds: string[];
  /** Quando atende: sempre, só fora do horário de atendimento ou em faixas próprias. */
  scheduleMode: "always" | "off_hours" | "custom";
  schedule: AiScheduleSlot[];

  // O que a IA pode responder sozinha.
  useStores: boolean;
  useOperatingHours: boolean;
  useCustomerOrders: boolean;
  canQuotePrices: boolean;
  topics: AiKnowledgeTopic[];
  extraInstructions: string;

  // Quando passa para uma pessoa e quando resolve sozinha.
  handoffKeywords: string[];
  handoffOnComplaint: boolean;
  handoffOnPurchaseIntent: boolean;
  handoffWhenUnsure: boolean;
  /** Cliente mandou foto, documento ou áudio (ex.: receita): a IA não lê arquivos, transfere. */
  handoffOnMedia: boolean;
  maxAiReplies: number;
  /** Fila de destino na transferência; vazio mantém a fila atual (ou a IA escolhe, se permitido). */
  handoffQueueId: string;
  aiChoosesQueue: boolean;
  /** Quando usar cada fila (id → texto curto), mostrado à IA na escolha do transbordo; vazio usa a descrição da fila. */
  queueHints: Record<string, string>;
  handoffMessage: string;
  closeWhenResolved: boolean;

  // Custos e créditos.
  model: string;
  /** Criatividade (0 a 1); null usa o padrão do modelo (alguns modelos só aceitam o padrão). */
  temperature: number | null;
  priceInputPerMillionUsd: number;
  priceOutputPerMillionUsd: number;
  usdToBrl: number;
  /** Crédito carregado na OpenAI (US$) e desde quando: o saldo é este valor menos o gasto registrado desde então. */
  creditLoadedUsd: number;
  creditLoadedAt: string;
  monthlyBudgetBrl: number;
};

export const AI_SETTINGS_KEY = "ai-settings";

export const DEFAULT_AI_TOPICS: AiKnowledgeTopic[] = [
  { id: "pagamento", title: "Formas de pagamento", enabled: true, content: "Aceitamos cartão de crédito e de débito, PIX e dinheiro. Parcelamento e condições podem variar por loja; para valores e parcelas exatas, a loja confirma." },
  { id: "exame", title: "Exame de vista", enabled: true, content: "Para fazer óculos de grau é preciso uma receita oftalmológica válida. Se o cliente não tiver receita ou ela tiver mais de 1 ano, oriente a renovar o exame e ofereça ajuda para encontrar a loja mais próxima." },
  { id: "prazo", title: "Prazo de entrega dos óculos", enabled: true, content: "O prazo depende do tipo de lente: lentes prontas costumam ficar prontas em poucos dias; lentes surfaçadas e multifocais levam mais tempo. O prazo exato é informado pela loja no pedido." },
  { id: "garantia", title: "Garantia e trocas", enabled: true, content: "Armações e lentes têm garantia contra defeito de fabricação. Ajustes e consertos simples podem ser feitos em qualquer loja. Casos de troca ou defeito devem ser avaliados por um atendente." },
  { id: "produtos", title: "Produtos", enabled: true, content: "Trabalhamos com óculos de grau, óculos de sol, lentes oftálmicas (visão simples, multifocais/progressivas, filtro de luz azul, fotossensíveis), lentes de contato e acessórios de limpeza." },
];

export const DEFAULT_AI_SETTINGS: AiSettings = {
  autonomousEnabled: false,
  agentName: "Assistente Óticas Brasil",
  tone: "acolhedor",
  attendAtEntry: false,
  queueIds: [],
  scheduleMode: "off_hours",
  schedule: [1, 2, 3, 4, 5].map((day) => ({ day, start: "18:00", end: "23:59" })),
  useStores: true,
  useOperatingHours: true,
  useCustomerOrders: true,
  canQuotePrices: false,
  topics: DEFAULT_AI_TOPICS,
  extraInstructions: "Nunca ofereça descontos nem condições especiais. Não faça diagnóstico de saúde ocular: oriente procurar um oftalmologista.",
  handoffKeywords: ["atendente", "humano", "pessoa", "falar com alguém", "vendedor", "gerente", "reclamação", "procon"],
  handoffOnComplaint: true,
  handoffOnPurchaseIntent: true,
  handoffWhenUnsure: true,
  handoffOnMedia: true,
  maxAiReplies: 8,
  handoffQueueId: "",
  aiChoosesQueue: true,
  queueHints: {},
  handoffMessage: "Vou te passar para um dos nossos atendentes, só um instante! 😊",
  closeWhenResolved: true,
  model: "gpt-5.4-mini",
  temperature: null,
  priceInputPerMillionUsd: 0.25,
  priceOutputPerMillionUsd: 2,
  usdToBrl: 5.5,
  creditLoadedUsd: 0,
  creditLoadedAt: "",
  monthlyBudgetBrl: 0,
};

const isTime = (value: unknown): value is string => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const num = (value: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const parsed = typeof value === "string" ? Number(value.replace(",", ".")) : Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};
/** Dicas de fila: só ids e textos curtos (até 60 filas). */
const hints = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([id, text]) => id.length <= 60 && typeof text === "string" && text.trim()).slice(0, 60).map(([id, text]) => [id, (text as string).trim().slice(0, 300)]));
};
const str = (value: unknown, fallback: string, max = 4000) => (typeof value === "string" ? value.slice(0, max) : fallback);
const bool = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);

/** Normaliza o que veio do banco ou da tela: campo ausente ou inválido volta ao padrão. */
export function sanitizeAiSettings(input: unknown): AiSettings {
  const raw = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const d = DEFAULT_AI_SETTINGS;
  const topics = Array.isArray(raw.topics)
    ? raw.topics
        .map((item, index) => {
          const topic = (item ?? {}) as Record<string, unknown>;
          return { id: str(topic.id, `topico-${index}`, 60) || `topico-${index}`, title: str(topic.title, "", 80).trim(), enabled: bool(topic.enabled, true), content: str(topic.content, "", 2000) };
        })
        .filter((topic) => topic.title)
        .slice(0, 30)
    : d.topics;
  const schedule = Array.isArray(raw.schedule)
    ? raw.schedule
        .map((item) => (item ?? {}) as Record<string, unknown>)
        .filter((slot) => Number.isInteger(slot.day) && Number(slot.day) >= 0 && Number(slot.day) <= 6 && isTime(slot.start) && isTime(slot.end) && String(slot.start) < String(slot.end))
        .map((slot) => ({ day: Number(slot.day), start: String(slot.start), end: String(slot.end) }))
    : d.schedule;
  return {
    autonomousEnabled: bool(raw.autonomousEnabled, d.autonomousEnabled),
    agentName: str(raw.agentName, d.agentName, 60).trim() || d.agentName,
    tone: AI_TONES.some((tone) => tone.id === raw.tone) ? (raw.tone as AiTone) : d.tone,
    attendAtEntry: bool(raw.attendAtEntry, d.attendAtEntry),
    queueIds: Array.isArray(raw.queueIds) ? raw.queueIds.filter((id): id is string => typeof id === "string").slice(0, 50) : d.queueIds,
    scheduleMode: raw.scheduleMode === "always" || raw.scheduleMode === "custom" || raw.scheduleMode === "off_hours" ? raw.scheduleMode : d.scheduleMode,
    schedule,
    useStores: bool(raw.useStores, d.useStores),
    useOperatingHours: bool(raw.useOperatingHours, d.useOperatingHours),
    useCustomerOrders: bool(raw.useCustomerOrders, d.useCustomerOrders),
    canQuotePrices: bool(raw.canQuotePrices, d.canQuotePrices),
    topics,
    extraInstructions: str(raw.extraInstructions, d.extraInstructions),
    handoffKeywords: Array.isArray(raw.handoffKeywords) ? raw.handoffKeywords.map((item) => String(item).trim()).filter(Boolean).slice(0, 50) : d.handoffKeywords,
    handoffOnComplaint: bool(raw.handoffOnComplaint, d.handoffOnComplaint),
    handoffOnPurchaseIntent: bool(raw.handoffOnPurchaseIntent, d.handoffOnPurchaseIntent),
    handoffWhenUnsure: bool(raw.handoffWhenUnsure, d.handoffWhenUnsure),
    handoffOnMedia: bool(raw.handoffOnMedia, d.handoffOnMedia),
    maxAiReplies: Math.round(num(raw.maxAiReplies, d.maxAiReplies, 1, 50)),
    handoffQueueId: str(raw.handoffQueueId, d.handoffQueueId, 60),
    aiChoosesQueue: bool(raw.aiChoosesQueue, d.aiChoosesQueue),
    queueHints: hints(raw.queueHints),
    handoffMessage: str(raw.handoffMessage, d.handoffMessage, 1000),
    closeWhenResolved: bool(raw.closeWhenResolved, d.closeWhenResolved),
    model: str(raw.model, d.model, 60).trim() || d.model,
    temperature: raw.temperature === null || raw.temperature === undefined || raw.temperature === "" ? null : num(raw.temperature, 0.7, 0, 1),
    priceInputPerMillionUsd: num(raw.priceInputPerMillionUsd, d.priceInputPerMillionUsd, 0, 1000),
    priceOutputPerMillionUsd: num(raw.priceOutputPerMillionUsd, d.priceOutputPerMillionUsd, 0, 1000),
    usdToBrl: num(raw.usdToBrl, d.usdToBrl, 0.01, 100),
    creditLoadedUsd: num(raw.creditLoadedUsd, d.creditLoadedUsd, 0, 1_000_000),
    creditLoadedAt: typeof raw.creditLoadedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.creditLoadedAt) ? raw.creditLoadedAt : "",
    monthlyBudgetBrl: num(raw.monthlyBudgetBrl, d.monthlyBudgetBrl, 0, 10_000_000),
  };
}

/** Custo em US$ de uma chamada pelos preços por milhão de tokens. */
export const usageCostUsd = (settings: Pick<AiSettings, "priceInputPerMillionUsd" | "priceOutputPerMillionUsd">, inputTokens: number, outputTokens: number) =>
  {
    const cost = ((Number(inputTokens) || 0) * (Number(settings.priceInputPerMillionUsd) || 0) + (Number(outputTokens) || 0) * (Number(settings.priceOutputPerMillionUsd) || 0)) / 1_000_000;
    return Number.isFinite(cost) && cost > 0 ? cost : 0;
  };

/** Se as faixas próprias da IA cobrem este instante (horário de Brasília). */
export function inAiSchedule(schedule: AiScheduleSlot[], date: Date) {
  const clock = brClock(date);
  const minute = clock.hour * 60 + clock.minute;
  const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  return schedule.some((slot) => slot.day === clock.weekday && minute >= toMinutes(slot.start) && minute <= toMinutes(slot.end));
}

/**
 * A IA assume esta conversa agora? `storeOpen` é o horário de atendimento da fila (null = sem regra, sempre aberto).
 * Entrada (status bot) só com "atender na entrada"; aguardando só nas filas escolhidas.
 */
export function aiShouldAttend(
  settings: AiSettings,
  conversation: { status: string; queueId: string | null; assigneeId: string | null; closedAt: Date | null },
  date: Date,
  storeOpen: boolean,
  /** Já transferida pela IA e aguardando na fila sem atendente: a IA ajuda na espera em qualquer fila. */
  queued = false,
) {
  if (!settings.autonomousEnabled || conversation.assigneeId || conversation.closedAt) return false;
  const inScope =
    (queued && conversation.status === "waiting") ||
    (conversation.status === "bot" && settings.attendAtEntry) ||
    ((conversation.status === "waiting" || conversation.status === "bot") && !!conversation.queueId && settings.queueIds.includes(conversation.queueId));
  if (!inScope) return false;
  if (settings.scheduleMode === "always") return true;
  if (settings.scheduleMode === "off_hours") return !storeOpen;
  return inAiSchedule(settings.schedule, date);
}

const normalize = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Pedido explícito de pessoa (palavras configuradas): transfere sem gastar uma chamada à IA. */
export function asksForHuman(settings: Pick<AiSettings, "handoffKeywords">, text: string) {
  const message = normalize(text);
  return settings.handoffKeywords.some((keyword) => {
    const term = normalize(keyword).trim();
    return term.length > 0 && new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(message);
  });
}

/**
 * Preços de tabela (US$ por 1 milhão de tokens) dos modelos mais usados. Ao trocar o modelo na tela,
 * os preços são preenchidos por aqui; o administrador pode ajustar se a OpenAI mudar a tabela.
 */
export const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  "gpt-5.4-mini": { input: 0.25, output: 2 },
  "gpt-5-mini": { input: 0.25, output: 2 },
  "gpt-5-nano": { input: 0.05, output: 0.4 },
  "gpt-5": { input: 1.25, output: 10 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
};

export const modelPrice = (model: string) => MODEL_PRICES[model.trim().toLowerCase()] ?? null;

const money = (value: number) => (Number.isFinite(value) ? Math.round(value * 100) / 100 : 0);

export type CreditSummary = {
  /** credit: crédito carregado na OpenAI; budget: orçamento mensal; none: nada informado. */
  mode: "credit" | "budget" | "none";
  totalBrl: number;
  spentBrl: number;
  remainingBrl: number;
  /** 0 a 100. */
  percentLeft: number;
  /** Abaixo de 20% do total. */
  low: boolean;
};

/**
 * Saldo exibido no painel: crédito carregado menos o gasto desde a recarga (sem data, todo o gasto registrado);
 * sem crédito informado, usa o orçamento mensal menos o gasto do mês. Nunca devolve NaN nem negativo.
 */
export function creditSummary(input: { creditLoadedUsd: number; spentSinceCreditUsd: number; monthlyBudgetBrl: number; monthSpentUsd: number; usdToBrl: number }): CreditSummary {
  const rate = Number.isFinite(input.usdToBrl) && input.usdToBrl > 0 ? input.usdToBrl : DEFAULT_AI_SETTINGS.usdToBrl;
  const safe = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0);
  const build = (mode: CreditSummary["mode"], totalBrl: number, spentBrl: number): CreditSummary => {
    const remainingBrl = money(Math.max(0, totalBrl - spentBrl));
    const percentLeft = totalBrl > 0 ? Math.round((remainingBrl / totalBrl) * 1000) / 10 : 0;
    return { mode, totalBrl: money(totalBrl), spentBrl: money(spentBrl), remainingBrl, percentLeft, low: totalBrl > 0 && percentLeft < 20 };
  };
  if (safe(input.creditLoadedUsd) > 0) return build("credit", safe(input.creditLoadedUsd) * rate, safe(input.spentSinceCreditUsd) * rate);
  if (safe(input.monthlyBudgetBrl) > 0) return build("budget", safe(input.monthlyBudgetBrl), safe(input.monthSpentUsd) * rate);
  return { ...build("none", 0, safe(input.monthSpentUsd) * rate), remainingBrl: 0 };
}
