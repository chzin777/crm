export type MenuOption = {
  id: string;
  label: string;
  action: "submenu" | "reply" | "queue";
  text: string;
  queueId: string | null;
  options: MenuOption[];
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
  silenceCloseText: string;
  options: MenuOption[];
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
  silenceCloseText: "Encerrei esta conversa por falta de resposta. Quando precisar, é só mandar uma mensagem.",
  options: [],
};

export function mergeChatSettings(stored: unknown): ChatMenuSettings {
  const value = typeof stored === "object" && stored !== null && !Array.isArray(stored) ? (stored as Partial<ChatMenuSettings>) : {};
  return { ...DEFAULT_CHAT_SETTINGS, ...value };
}
