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
  notifyQueuePosition: boolean;
  silenceEnabled: boolean;
  silenceAskMinutes: number;
  silenceCloseMinutes: number;
  silenceAskText: string;
  /** Desligado: o encerramento por inatividade herda farewellText. */
  silenceCloseCustom: boolean;
  silenceCloseText: string;
  /** Pesquisa de 1 a 5 depois que um atendente encerra a conversa. */
  npsEnabled: boolean;
  npsPromptText: string;
  npsThanksText: string;
  options: MenuOption[];
  canvas: MenuCanvas;
};

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
  notifyQueuePosition: false,
  silenceEnabled: true,
  silenceAskMinutes: 10,
  silenceCloseMinutes: 3,
  silenceAskText: "Você ainda está por aí? Se não responder, encerro esta conversa em {minutos} minutos.",
  silenceCloseCustom: false,
  silenceCloseText: "",
  npsEnabled: true,
  npsPromptText: "De 1 a 5, como você avalia o atendimento recebido hoje?",
  npsThanksText: "Agradecemos pela sua avaliação! Ela é muito importante para nós.",
  options: [],
  canvas: { positions: {}, drafts: [] },
};

/** Escala fixa: a leitura da nota depende destes rótulos, por isso não são editáveis. */
export const NPS_SCORE_LABELS = ["Muito insatisfeito", "Insatisfeito", "Neutro", "Satisfeito", "Muito satisfeito"];
export const npsScoreLine = (label: string, index: number) => `${index + 1} - ${label}`;
export const NPS_SCALE_TEXT = NPS_SCORE_LABELS.map(npsScoreLine).join("\n");
export const npsPrompt = (settings: ChatMenuSettings) => settings.npsPromptText.trim() || DEFAULT_CHAT_SETTINGS.npsPromptText;

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

/**
 * Lista nativa do WhatsApp, a mesma no envio e no simulador. Título até 24 caracteres
 * (o nome inteiro vai na descrição); null quando não cabe e o menu vai como texto.
 */
export function menuList(settings: ChatMenuSettings, path: string[], parts: string[]): { body: string; rows: MenuListRow[] } | null {
  const rows: MenuListRow[] = [
    ...optionsAt(settings, path).map((option) => ({
      id: `menu_${option.id}`,
      title: clip(option.label, 24),
      ...(option.label.length > 24 ? { description: clip(option.label, 72) } : {}),
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
  const value = typeof stored === "object" && stored !== null && !Array.isArray(stored) ? (stored as Partial<ChatMenuSettings>) : {};
  return {
    ...DEFAULT_CHAT_SETTINGS,
    ...value,
    options: (value.options ?? []).map(withOptionDefaults),
    canvas: {
      positions: value.canvas?.positions ?? {},
      drafts: (value.canvas?.drafts ?? []).map(withOptionDefaults),
    },
  };
}
