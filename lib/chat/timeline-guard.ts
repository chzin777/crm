import type { ChatMessageItem } from "@/lib/chat/types";

/**
 * Blindagem da timeline do /chat: nada de outro cliente entra na conversa aberta.
 * - scopeToTimeline: só fica mensagem da conversa aberta ou de atendimentos do MESMO contato (sessões devolvidas
 *   pelo servidor). Mensagem sem conversationId (temporária do envio otimista) passa.
 * - createActiveConversation: cada abertura gera um bilhete; resposta que chega depois de trocar de conversa
 *   (bilhete vencido) é descartada em vez de entrar na tela.
 */
export function scopeToTimeline<T extends Pick<ChatMessageItem, "conversationId">>(items: T[], conversationId: string, sessionIds: Iterable<string> = []): T[] {
  const allowed = new Set<string>([conversationId, ...sessionIds]);
  return items.filter((item) => !item.conversationId || allowed.has(item.conversationId));
}

export type ConversationTicket = { id: string; isCurrent: () => boolean };

export function createActiveConversation() {
  let current: string | null = null;
  let generation = 0;
  return {
    open(id: string): ConversationTicket {
      current = id;
      generation += 1;
      const mine = generation;
      return { id, isCurrent: () => mine === generation && current === id };
    },
    close() {
      current = null;
      generation += 1;
    },
    get current() {
      return current;
    },
  };
}
