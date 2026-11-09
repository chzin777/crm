import "server-only";
import type { ChatConversation } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import { invalidateCache } from "@/lib/cache";
import { prisma } from "@/lib/prisma";
import { assignFromMenu, closeConversation } from "@/lib/chat/actions";
import { readChatSettings } from "@/lib/chat/conversation";
import { sendAutomaticMessage } from "@/lib/chat/outbound";
import { composeWithMenu, optionsAt, type ChatMenuSettings, type MenuOption } from "@/lib/chat/settings";
import { fillVariables, withoutDashes } from "@/lib/chat/text";
import { sendList } from "@/lib/meta-whatsapp";

export type MenuState = {
  path: string[];
  stopped: boolean;
  closeAt: string | null;
  closePhrase: string | null;
  warnedAt: string | null;
  notifiedPosition?: number | null;
};

const EMPTY: MenuState = { path: [], stopped: false, closeAt: null, closePhrase: null, warnedAt: null };

export function readMenuState(raw: unknown): MenuState {
  if (!raw || typeof raw !== "object") return { ...EMPTY };
  const value = raw as Partial<MenuState>;
  return {
    path: Array.isArray(value.path) ? value.path.filter((item) => typeof item === "string") : [],
    stopped: value.stopped === true,
    closeAt: typeof value.closeAt === "string" ? value.closeAt : null,
    closePhrase: typeof value.closePhrase === "string" ? value.closePhrase : null,
    warnedAt: typeof value.warnedAt === "string" ? value.warnedAt : null,
    notifiedPosition: typeof value.notifiedPosition === "number" ? value.notifiedPosition : null,
  };
}

export const saveMenuState = (conversationId: string, state: MenuState) =>
  prisma.chatConversation.update({ where: { id: conversationId }, data: { menuState: state as unknown as Prisma.InputJsonValue } });

function choiceFrom(text: string, count: number) {
  if (!/^\d{1,2}$/.test(text)) return null;
  const value = Number(text);
  return value === 0 || value <= count ? value : null;
}

async function applyTag(conversation: ChatConversation, option: MenuOption) {
  const value = option.tagValue.trim();
  if (!value) return;
  if (option.tagTarget === "segment") {
    await prisma.contact.updateMany({
      where: { id: conversation.contactId, ...(option.tagMode === "remove" ? { segment: value } : {}) },
      data: { segment: option.tagMode === "add" ? value : null },
    });
    await invalidateCache("dashboard", "audience:store:");
    return;
  }
  const others = conversation.tags.filter((tag) => tag !== value);
  await prisma.chatConversation.update({ where: { id: conversation.id }, data: { tags: option.tagMode === "add" ? [...others, value] : others } });
}

const LIST_HEADER = "Óticas Brasil 👓";
const LIST_FOOTER = "Selecione uma opção abaixo";
const LIST_BUTTON = "Ver opções";
const BACK_ROW = "menu_voltar";
const MAX_ROWS = 10;
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * Menu como lista nativa do WhatsApp (mais de 3 opções não cabem em botões).
 * O histórico guarda a versão em texto; acima de 10 linhas a Meta recusa a lista e vai texto mesmo.
 */
export async function sendMenu(conversation: Pick<ChatConversation, "id" | "phone">, settings: ChatMenuSettings, path: string[], parts: string[], customerName?: string) {
  const fill = (value: string) => fillVariables(value, { customer: customerName });
  const text = fill(composeWithMenu(settings, path, parts));
  const rows = [
    ...optionsAt(settings, path).map((option) => ({
      id: `menu_${option.id}`,
      title: clip(option.label, 24),
      ...(option.label.length > 24 ? { description: clip(option.label, 72) } : {}),
    })),
    ...(path.length ? [{ id: BACK_ROW, title: "Voltar" }] : []),
  ];
  if (rows.length === 0 || rows.length > MAX_ROWS) return sendAutomaticMessage(conversation, text);

  const intro = parts.map((part) => part.replaceAll("{menu}", "").trim()).filter(Boolean).join("\n\n");
  const body = clip(withoutDashes(fill(intro)) || "Como podemos ajudar?", 1024);
  return sendAutomaticMessage(conversation, text, () => sendList(conversation.phone, { header: LIST_HEADER, body, footer: LIST_FOOTER, button: LIST_BUTTON, rows }));
}

/** Toque na lista: 0 é Voltar, senão a posição da opção no nível atual. */
function choiceFromList(choiceId: string | null | undefined, options: MenuOption[]) {
  if (!choiceId?.startsWith("menu_")) return null;
  if (choiceId === BACK_ROW) return 0;
  const index = options.findIndex((option) => `menu_${option.id}` === choiceId);
  return index >= 0 ? index + 1 : null;
}

type Entry = { conversation: ChatConversation; customerName: string; text: string; choiceId?: string | null; firstMessage: boolean };

/** Devolve true quando o menu respondeu a mensagem. Todo estado fica no banco. */
export async function attendByMenu({ conversation, customerName, text: rawText, choiceId, firstMessage }: Entry) {
  const settings = await readChatSettings();
  if (!settings.enabled || settings.options.length === 0) return false;

  const state = readMenuState(conversation.menuState);
  if (state.stopped) return false;

  // O cliente escreveu: fechamento marcado e aviso de silêncio perdem o efeito.
  state.closeAt = null;
  state.closePhrase = null;
  state.warnedAt = null;

  const text = rawText.trim();
  const say = (message: string) => sendAutomaticMessage(conversation, fillVariables(message, { customer: customerName }));
  const show = (parts: string[]) => sendMenu(conversation, settings, state.path, parts, customerName);

  if (firstMessage && state.path.length === 0) {
    await show([settings.greeting]);
    await saveMenuState(conversation.id, state);
    return true;
  }

  const options = optionsAt(settings, state.path);
  const choice = choiceFromList(choiceId, options) ?? choiceFrom(text, options.length);

  if (choice === null) {
    if (/^(menu|op[çc][õo]es|voltar|in[íi]cio)$/i.test(text)) {
      state.path = [];
      await show([]);
      await saveMenuState(conversation.id, state);
      return true;
    }
    await saveMenuState(conversation.id, state);
    if (settings.acceptFreeText) return false;
    await show([settings.invalidOptionText]);
    return true;
  }

  if (choice === 0) {
    state.path = state.path.slice(0, -1);
    await show([]);
    await saveMenuState(conversation.id, state);
    return true;
  }

  const option = options[choice - 1];

  if (option.action === "submenu") {
    state.path = [...state.path, option.id];
    await show([option.text]);
    await saveMenuState(conversation.id, state);
    return true;
  }

  if (option.action === "queue") {
    state.stopped = true;
    await prisma.chatConversation.update({
      where: { id: conversation.id },
      data: { status: "waiting", queueId: option.queueId ?? conversation.queueId, waitingSince: new Date(), menuState: state as unknown as Prisma.InputJsonValue },
    });
    if (option.text.trim()) await say(option.text);
    return true;
  }

  if (option.action === "assign") {
    state.stopped = true;
    await assignFromMenu(conversation, option.assigneeId, state as unknown as Prisma.InputJsonValue);
    if (option.text.trim()) await say(option.text);
    return true;
  }

  if (option.action === "close") {
    state.stopped = true;
    await saveMenuState(conversation.id, state);
    await closeConversation(conversation, null, "Menu automático encerrou a conversa", fillVariables(option.text, { customer: customerName }));
    return true;
  }

  if (option.action === "none") {
    await show([settings.invalidOptionText]);
    await saveMenuState(conversation.id, state);
    return true;
  }

  if (option.action === "tag") await applyTag(conversation, option);
  if (option.text.trim()) await say(option.text);
  if (settings.closingDelaySeconds <= 0) {
    if (settings.repeatMenu) await show([settings.closingText]);
    else if (settings.closingText.trim()) await say(settings.closingText);
  } else {
    state.closeAt = new Date(Date.now() + settings.closingDelaySeconds * 1000).toISOString();
    state.closePhrase = settings.closingText;
  }
  await saveMenuState(conversation.id, state);
  return true;
}
