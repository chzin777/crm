import "server-only";
import type { ChatConversation } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { readChatSettings } from "@/lib/chat/conversation";
import { sendAutomaticMessage } from "@/lib/chat/outbound";
import type { ChatMenuSettings, MenuOption } from "@/lib/chat/settings";
import { fillVariables } from "@/lib/chat/text";

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

function optionsAt(settings: ChatMenuSettings, path: string[]): MenuOption[] {
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

/** Onde estiver {menu} entra a lista; sem a marca, ela vai no fim. */
export function composeWithMenu(settings: ChatMenuSettings, path: string[], parts: string[]) {
  const list = menuText(settings, path);
  const filled = parts.filter((part) => part.trim());
  return filled.some((part) => part.includes("{menu}"))
    ? filled.map((part) => part.replaceAll("{menu}", list)).join("\n\n")
    : [...filled, list].join("\n\n");
}

function choiceFrom(text: string, count: number) {
  if (!/^\d{1,2}$/.test(text)) return null;
  const value = Number(text);
  return value === 0 || value <= count ? value : null;
}

type Entry = { conversation: ChatConversation; customerName: string; text: string; firstMessage: boolean };

/** Devolve true quando o menu respondeu a mensagem. Todo estado fica no banco. */
export async function attendByMenu({ conversation, customerName, text: rawText, firstMessage }: Entry) {
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
  const show = (parts: string[]) => say(composeWithMenu(settings, state.path, parts));

  if (firstMessage && state.path.length === 0) {
    await show([settings.greeting]);
    await saveMenuState(conversation.id, state);
    return true;
  }

  const options = optionsAt(settings, state.path);
  const choice = choiceFrom(text, options.length);

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

  await say(option.text);
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
