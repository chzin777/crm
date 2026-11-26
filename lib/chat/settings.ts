export type MenuOption = {
  id: string;
  label: string;
  /** "none": opção ainda sem destino, criada ou desligada no fluxograma. */
  action: "submenu" | "reply" | "queue" | "assign" | "tag" | "close" | "none";
  text: string;
  queueId: string | null;
  assigneeId: string | null;
  /** Etiqueta fica na conversa; segmento fica no contato. */
  tagTarget: "tag" | "segment";
  tagMode: "add" | "remove";
  tagValue: string;
  options: MenuOption[];
};

/** Só o fluxograma lê: posição dos nós e etapas soltas, fora da árvore que o menu executa. */
export type MenuCanvas = {
  positions: Record<string, { x: number; y: number }>;
  drafts: MenuOption[];
};

export type ChatMenuSettings = {
  enabled: boolean;
  greeting: string;
  footer: string;
  closingText: string;
  closingDelaySeconds: number;
  repeatMenu: boolean;
  acceptFreeText: boolean;
  invalidOptionText: string;
  farewellText: string;
  silenceEnabled: boolean;
  silenceAskMinutes: number;
  silenceCloseMinutes: number;
  silenceAskText: string;
  /** Desligado: o encerramento por inatividade herda farewellText. */
  silenceCloseCustom: boolean;
  silenceCloseText: string;
  /** Pesquisa de 0 a 10 depois que um atendente encerra a conversa. */
  npsEnabled: boolean;
  npsPromptText: string;
  npsThanksText: string;
  /** Convite ao comentário opcional, enviado depois de qualquer nota; vazio, a nota recebe direto o agradecimento. */
  npsCommentText: string;
  options: MenuOption[];
  canvas: MenuCanvas;
};

/** Silêncio do cliente: o "ainda está por aí?" sai no dia seguinte (24 h) e o encerramento outras 24 h depois. */
export const SILENCE_DAY_MINUTES = 24 * 60;
export const SILENCE_ASK_TEXT = "Oi! Passando para saber se ainda posso te ajudar com alguma coisa. Se não tiver retorno, este atendimento será encerrado em {tempo}, mas é só mandar uma mensagem quando quiser.";
const LEGACY_SILENCE_ASK_TEXTS = ["Você ainda está por aí? Em caso de inatividade, este atendimento será encerrado automaticamente em {minutos} minutos."];

export const DEFAULT_CHAT_SETTINGS: ChatMenuSettings = {
  enabled: false,
  greeting: "Olá, {cliente}! Como podemos ajudar?\n\n{menu}",
  footer: "Responda com o número da opção.",
  closingText: "Posso ajudar em mais alguma coisa?",
  closingDelaySeconds: 60,
  repeatMenu: true,
  acceptFreeText: true,
  invalidOptionText: "Não entendi essa opção. Responda com o número de uma das opções abaixo.",
  farewellText: "Atendimento encerrado. Quando precisar, é só mandar uma mensagem.",
  silenceEnabled: true,
  silenceAskMinutes: SILENCE_DAY_MINUTES,
  silenceCloseMinutes: SILENCE_DAY_MINUTES,
  silenceAskText: SILENCE_ASK_TEXT,
  silenceCloseCustom: false,
  silenceCloseText: "",
  npsEnabled: true,
  npsPromptText: "De 0 a 10, que nota você dá para o atendimento recebido hoje?",
  npsThanksText: "Agradecemos pela sua avaliação! Ela é muito importante para nós.",
  npsCommentText: "Obrigado pela nota! Se quiser, conte em poucas palavras o que motivou sua avaliação. O comentário é opcional e nos ajuda muito.",
  options: [],
  canvas: { positions: {}, drafts: [] },
};

/** Escala antiga (1 a 5): só para reconhecer pesquisas antigas no histórico e as respostas pendentes delas. */
export const NPS_SCORE_LABELS = ["Muito insatisfeito", "Insatisfeito", "Neutro", "Satisfeito", "Muito satisfeito"];
export const NPS_SCORE_EMOJIS = ["😡", "🙁", "😐", "🙂", "🤩"];
/** Emoji colado no rótulo em todas as notas: com espaço, "1 - Muito insatisfeito 😡" passa dos 24 da lista. */
export const npsScoreLine = (label: string, index: number) => `${index + 1} - ${label}${NPS_SCORE_EMOJIS[index]}`;
export const npsScoreTitle = npsScoreLine;
/**
 * Escala de 0 a 10 (texto fixo no fim da pesquisa; marca a mensagem como pesquisa no histórico).
 * Sem lista interativa: o WhatsApp aceita no máximo 10 opções e a escala tem 11.
 */
export const NPS_SCALE_TEXT = "Responda com um número de 0 a 10. Sendo 0 a 6 baixa, 7 e 8 boa e 9 e 10 excelente.";
/** Formatos anteriores da escala de 1 a 5: ainda marcam pesquisas antigas no histórico. */
export const NPS_LEGACY_SCALES = [
  NPS_SCORE_LABELS.map(npsScoreLine).join("\n"),
  NPS_SCORE_LABELS.map((label, index) => `${index + 1} - ${label}`).join("\n"),
  NPS_SCORE_LABELS.map((label, index) => `${index + 1} - ${label} ${NPS_SCORE_EMOJIS[index]}`).join("\n"),
];
/** Pergunta salva ainda com "de 1 a 5" passa a falar da escala nova. */
export const npsPrompt = (settings: ChatMenuSettings) =>
  (settings.npsPromptText.trim() || DEFAULT_CHAT_SETTINGS.npsPromptText).replace(/\b(de|entre)\s+1\s+(a|e)\s+5\b/gi, (_match, word: string) => `${word} 0 a 10`);
const LEGACY_NPS_COMMENT = "Sentimos muito que sua experiência não tenha sido ideal. Poderia nos contar brevemente o que podemos melhorar?";
/** Convite ao comentário (qualquer nota). O texto antigo, pensado só para nota baixa, vira o convite novo. */
export const npsCommentPrompt = (settings: ChatMenuSettings) => {
  const text = settings.npsCommentText.trim();
  return text === LEGACY_NPS_COMMENT ? DEFAULT_CHAT_SETTINGS.npsCommentText : text;
};

/** 30 minutos, 1 hora, 24 horas, 2 dias: o tempo por extenso para a mensagem ao cliente. */
export function silenceDurationText(minutes: number) {
  if (minutes < 60 || minutes % 60) return `${minutes} ${minutes === 1 ? "minuto" : "minutos"}`;
  const hours = minutes / 60;
  if (hours <= 24 || hours % 24) return `${hours} ${hours === 1 ? "hora" : "horas"}`;
  return `${hours / 24} dias`;
}

/** {tempo} sai por extenso ("24 horas"); {minutos} continua valendo para textos antigos. */
export const silenceAskMessage = (settings: ChatMenuSettings) =>
  settings.silenceAskText
    .replaceAll("{tempo}", silenceDurationText(settings.silenceCloseMinutes))
    .replaceAll("{minutos}", String(settings.silenceCloseMinutes));

/** Texto personalizado vazio ou desligado cai na despedida padrão. */
export const silenceFarewell = (settings: ChatMenuSettings) =>
  settings.silenceCloseCustom && settings.silenceCloseText.trim() ? settings.silenceCloseText : settings.farewellText;

export const newMenuOption = (overrides: Partial<MenuOption> = {}): MenuOption => ({
  id: crypto.randomUUID(),
  label: "",
  action: "reply",
  text: "",
  queueId: null,
  assigneeId: null,
  tagTarget: "tag",
  tagMode: "add",
  tagValue: "",
  options: [],
  ...overrides,
});

export const updateTree = (options: MenuOption[], id: string, patch: Partial<MenuOption>): MenuOption[] =>
  options.map((option) => (option.id === id ? { ...option, ...patch } : { ...option, options: updateTree(option.options, id, patch) }));

export const removeFromTree = (options: MenuOption[], id: string): MenuOption[] =>
  options.filter((option) => option.id !== id).map((option) => ({ ...option, options: removeFromTree(option.options, id) }));

export function moveInTree(options: MenuOption[], id: string, step: number): MenuOption[] {
  const index = options.findIndex((option) => option.id === id);
  if (index >= 0) {
    const target = index + step;
    if (target < 0 || target >= options.length) return options;
    const next = [...options];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  }
  return options.map((option) => ({ ...option, options: moveInTree(option.options, id, step) }));
}

export const addToTree = (options: MenuOption[], parentId: string, option: MenuOption): MenuOption[] =>
  options.map((item) => (item.id === parentId ? { ...item, options: [...item.options, option] } : { ...item, options: addToTree(item.options, parentId, option) }));

export function optionsAt(settings: ChatMenuSettings, path: string[]): MenuOption[] {
  let list = settings.options;
  for (const id of path) {
    const found = list.find((option) => option.id === id);
    if (!found || found.action !== "submenu") return list;
    list = found.options;
  }
  return list;
}

export function menuText(settings: ChatMenuSettings, path: string[]) {
  const lines = optionsAt(settings, path).map((option, index) => `${index + 1}. ${option.label}`);
  if (path.length) lines.push("0. Voltar");
  return [...lines, "", settings.footer].join("\n").trim();
}

export const MENU_LIST = { footer: "Selecione uma opção abaixo", button: "Ver opções", backId: "menu_voltar", maxRows: 10 };
export type MenuListRow = { id: string; title: string; description?: string };

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

const graphemes = (text: string) => [...new Intl.Segmenter("pt-BR", { granularity: "grapheme" }).segment(text)].map((part) => part.segment);

/**
 * Título da linha da lista (limite de 24 da Meta). Corta em caractere inteiro: cortar no meio
 * de um emoji fazia o WhatsApp mostrar "?". Se só o emoji do fim não couber, ele sai sem reticências.
 */
function rowTitle(label: string, max = 24) {
  if (label.length <= max) return label;
  const parts = graphemes(label);
  const fit = (limit: number) => {
    let text = "";
    for (const part of parts) {
      if (text.length + part.length > limit) break;
      text += part;
    }
    return text;
  };
  const whole = fit(max);
  const rest = parts.slice(graphemes(whole).length).join("");
  if (!/[\p{L}\p{N}]/u.test(rest)) return whole.trimEnd();
  return `${fit(max - 1).trimEnd()}…`;
}

/**
 * Lista nativa do WhatsApp, a mesma no envio e no simulador. Título até 24 caracteres
 * (o nome inteiro vai na descrição); null quando não cabe e o menu vai como texto.
 */
export function menuList(settings: ChatMenuSettings, path: string[], parts: string[]): { body: string; rows: MenuListRow[] } | null {
  const rows: MenuListRow[] = [
    ...optionsAt(settings, path).map((option) => ({
      id: `menu_${option.id}`,
      // Só o título: a descrição aparecia junto na resposta do cliente, repetindo a opção.
      title: rowTitle(option.label),
    })),
    ...(path.length ? [{ id: MENU_LIST.backId, title: "Voltar" }] : []),
  ];
  if (rows.length === 0 || rows.length > MENU_LIST.maxRows) return null;
  const body = parts.map((part) => part.replaceAll("{menu}", "").trim()).filter(Boolean).join("\n\n");
  return { body: clip(body, 1024), rows };
}

/** Onde estiver {menu} entra a lista; sem a marca, ela vai no fim. */
export function composeWithMenu(settings: ChatMenuSettings, path: string[], parts: string[]) {
  const list = menuText(settings, path);
  const filled = parts.filter((part) => part.trim());
  return filled.some((part) => part.includes("{menu}"))
    ? filled.map((part) => part.replaceAll("{menu}", list)).join("\n\n")
    : [...filled, list].join("\n\n");
}

/** Menus gravados antes das ações novas não têm esses campos. */
const OPTION_DEFAULTS: Pick<MenuOption, "assigneeId" | "tagTarget" | "tagMode" | "tagValue"> = { assigneeId: null, tagTarget: "tag", tagMode: "add", tagValue: "" };

const withOptionDefaults = (option: MenuOption): MenuOption => ({
  ...OPTION_DEFAULTS,
  ...option,
  options: (option.options ?? []).map(withOptionDefaults),
});

export function mergeChatSettings(stored: unknown): ChatMenuSettings {
  const raw = typeof stored === "object" && stored !== null && !Array.isArray(stored) ? (stored as Partial<ChatMenuSettings> & { notifyQueuePosition?: unknown }) : {};
  // Aviso de posição na fila ao cliente foi removido do sistema: a chave antiga gravada no banco é descartada.
  const { notifyQueuePosition: _removed, ...value } = raw;
  void _removed;
  // Timers curtos antigos (10 min + 3 min) viram 24 h; o texto padrão antigo ("em 3 minutos") vira o novo.
  const silenceMinutes = (minutes: unknown) => (typeof minutes === "number" && minutes >= 60 ? minutes : SILENCE_DAY_MINUTES);
  return {
    ...DEFAULT_CHAT_SETTINGS,
    ...value,
    silenceAskMinutes: silenceMinutes(value.silenceAskMinutes),
    silenceCloseMinutes: silenceMinutes(value.silenceCloseMinutes),
    silenceAskText: !value.silenceAskText || LEGACY_SILENCE_ASK_TEXTS.includes(value.silenceAskText) ? SILENCE_ASK_TEXT : value.silenceAskText,
    options: (value.options ?? []).map(withOptionDefaults),
    canvas: {
      positions: value.canvas?.positions ?? {},
      drafts: (value.canvas?.drafts ?? []).map(withOptionDefaults),
    },
  };
}
