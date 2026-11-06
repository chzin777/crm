import type { ChatMessageItem } from "@/lib/chat/types";

const TEMPORARY_PREFIX = "temp-";
const ECHO_WINDOW_MS = 5000;

const timeOf = (message: ChatMessageItem) => new Date(message.createdAt).getTime();
const byDate = (a: ChatMessageItem, b: ChatMessageItem) => timeOf(a) - timeOf(b);

/** A mensagem gravada pode voltar pela sincronização antes da resposta do envio que a criou. */
function isEcho(temporary: ChatMessageItem, saved: ChatMessageItem) {
  return temporary.id.startsWith(TEMPORARY_PREFIX)
    && saved.author === "agent"
    && temporary.internal === saved.internal
    && temporary.text.trim() === saved.text.trim()
    && (temporary.attachment?.kind ?? null) === (saved.attachment?.kind ?? null)
    && Math.abs(timeOf(temporary) - timeOf(saved)) <= ECHO_WINDOW_MS;
}

export function mergeMessages(current: ChatMessageItem[], incoming: ChatMessageItem[]) {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    if (!byId.has(message.id)) {
      // Cada mensagem gravada absorve só uma temporária: textos iguais enviados em sequência continuam separados.
      const echo = [...byId.values()].find((item) => isEcho(item, message));
      if (echo) byId.delete(echo.id);
    }
    byId.set(message.id, message);
  }
  return [...byId.values()].sort(byDate);
}

export function replaceMessage(current: ChatMessageItem[], temporaryId: string, saved: ChatMessageItem) {
  return [...current.filter((item) => item.id !== temporaryId && item.id !== saved.id), saved].sort(byDate);
}
