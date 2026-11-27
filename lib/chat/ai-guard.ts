import "server-only";
import { prisma } from "@/lib/prisma";
import { aiConversationMode } from "@/lib/chat/queue-rules";

/**
 * Guarda única dos envios automáticos em nome da IA (resposta ao cliente, Acompanhamento automático, automações).
 * Conversa com atendente humano nunca recebe mensagem da IA. Sempre lida do banco NA HORA do envio: o estado de
 * quando o job foi planejado (horas antes) não vale.
 */

/** Marca da mensagem de sistema da transferência feita pela IA. */
export const AI_HANDOFF_MARK = "IA transferiu o atendimento";
/** Ação de auditoria "Devolver para a IA": a partir dela a IA volta a atender (transbordo e respostas anteriores não contam). */
export const AI_RESUME_ACTION = "conversation.ai_resume";

type GuardConversation = { status: string; assigneeId: string | null; closedAt: Date | null; menuState?: unknown };

/** Humano está com a conversa: atendente atribuído, em atendimento ou encerrada. */
export function humanAttending(conversation: GuardConversation): boolean {
  return !!conversation.closedAt || !!conversation.assigneeId || conversation.status === "in_progress";
}

/** Início do trecho que vale para a IA: reabertura da conversa ou devolução para a IA, o que for mais recente. */
async function aiPeriodStart(conversationId: string): Promise<Date | null> {
  const last = await prisma.chatAudit.findFirst({
    where: { targetId: conversationId, action: { in: ["conversation.reopen", AI_RESUME_ACTION] } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return last?.createdAt ?? null;
}

/** Transbordo feito pela IA neste trecho e se o atendente já escreveu ao cliente depois dele. */
export async function handoffFlags(conversationId: string) {
  const start = await aiPeriodStart(conversationId);
  const mark = await prisma.chatMessage.findFirst({
    where: { conversationId, author: "system", text: { startsWith: AI_HANDOFF_MARK }, ...(start ? { createdAt: { gt: start } } : {}) },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (!mark) return { handedOff: false, humanReplied: false, since: null as Date | null };
  const human = await prisma.chatMessage.findFirst({ where: { conversationId, author: "agent", internal: false, createdAt: { gt: mark.createdAt } }, select: { id: true } });
  return { handedOff: true, humanReplied: !!human, since: mark.createdAt as Date | null };
}

/** A IA pode mandar mensagem nesta conversa agora? (relido do banco; humano assumiu, transbordo ou pausa = não). */
export async function canAiRespondToConversation(conversationId: string): Promise<boolean> {
  const conversation = await prisma.chatConversation.findUnique({ where: { id: conversationId }, select: { status: true, assigneeId: true, closedAt: true, menuState: true } });
  if (!conversation || humanAttending(conversation)) return false;
  return aiConversationMode(conversation, await handoffFlags(conversationId)) === "exclusive";
}
