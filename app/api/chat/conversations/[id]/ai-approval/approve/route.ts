import { NextResponse } from "next/server";
import { chatError, conversationNotFound, findScopedConversation, requireChatActor } from "@/lib/chat/access";
import { isWindowOpen } from "@/lib/chat/conversation";
import { sendAutomaticMessage } from "@/lib/chat/outbound";
import { AI_AUTHOR } from "@/lib/ai/agent";
import { approveFinancial } from "@/lib/ai/installments-db";

type Context = { params: Promise<{ id: string }> };

/** Operador confere e envia (com o texto editado, se quiser): a mensagem sai pelo WhatsApp oficial e fica auditada. */
export async function POST(request: Request, context: Context) {
  const guard = await requireChatActor("chat.assume");
  if (guard.response) return guard.response;
  const { id } = await context.params;
  const conversation = await findScopedConversation(guard.actor, id);
  if (!conversation) return conversationNotFound();
  if (conversation.closedAt) return chatError("Conversa encerrada. Reabra para responder.", 409);
  if (!isWindowOpen(conversation.lastInboundAt)) return chatError("Faz mais de 24h desde a última mensagem do cliente. Envie um modelo aprovado.", 422);
  const body = (await request.json().catch(() => null)) as { actionId?: unknown; message?: unknown } | null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (typeof body?.actionId !== "string" || !message) return chatError("Informe a mensagem a enviar.", 400);
  if (message.length > 4000) return chatError("Mensagem longa demais.", 400);
  try {
    const result = await approveFinancial({
      actionId: body.actionId,
      conversationId: conversation.id,
      actor: guard.actor,
      message,
      // Sai como resposta da IA (a conversa segue com ela); a aprovação do operador fica no histórico e na auditoria.
      send: async (text) => sendAutomaticMessage(conversation, text, undefined, undefined, AI_AUTHOR),
    });
    if (!result.ok) return chatError(result.error, 409);
    return NextResponse.json({ ok: true, messageId: result.messageId });
  } catch (error) {
    console.error(`[ai][parcelas] envio aprovado falhou (${conversation.id})`, error);
    return chatError("Não foi possível enviar ao WhatsApp. Tente de novo.", 502);
  }
}
