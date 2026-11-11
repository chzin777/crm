import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { chatError, findScopedConversation, requireChatActor } from "@/lib/chat/access";
import { addAudit } from "@/lib/chat/conversation";

type Context = { params: Promise<{ scheduledId: string }> };

/** Cancela antes do disparo; a falha antiga só some da conversa (fica registrada como cancelada). */
export async function DELETE(_request: Request, context: Context) {
  const guard = await requireChatActor("chat.assume");
  if (guard.response) return guard.response;
  const { scheduledId } = await context.params;

  const current = await prisma.scheduledMessage.findUnique({ where: { id: scheduledId }, select: { conversationId: true } });
  if (!current || !(await findScopedConversation(guard.actor, current.conversationId))) return chatError("Mensagem agendada não encontrada.", 404);

  const cancelled = await prisma.scheduledMessage.updateMany({ where: { id: scheduledId, status: { in: ["SCHEDULED", "FAILED"] } }, data: { status: "CANCELLED" } });
  if (cancelled.count === 0) return chatError("Esta mensagem já foi enviada.", 409);
  await addAudit({ userId: guard.actor.id, action: "scheduled.cancel", targetId: current.conversationId, after: { scheduledId } });
  return NextResponse.json({ ok: true });
}
