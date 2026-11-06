import "server-only";
import type { ChatConversation } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { ChatActor } from "@/lib/chat/access";
import { addAudit, addSystemMessage, isWindowOpen, readChatSettings } from "@/lib/chat/conversation";
import { ChatRuleError, sendAutomaticMessage } from "@/lib/chat/outbound";
import { fillVariables } from "@/lib/chat/text";

export const openCount = (userId: string) => prisma.chatConversation.count({ where: { assigneeId: userId, closedAt: null } });

async function assertCanReceive(userId: string) {
  const agent = await prisma.chatAgent.findUnique({ where: { userId } });
  if (agent?.paused) throw new ChatRuleError("Esta pessoa está pausada e não recebe conversas novas.", 409);
  if (agent && agent.capacity === 0) throw new ChatRuleError("Esta pessoa está fora do atendimento (capacidade 0).", 409);
  if (agent && (await openCount(userId)) >= agent.capacity) throw new ChatRuleError("Esta pessoa já está no limite de conversas.", 409);
}

export async function transferConversation(actor: ChatActor, conversation: ChatConversation, input: { queueId: string; assigneeId?: string; reason: string }) {
  const queue = await prisma.chatQueue.findFirst({ where: { id: input.queueId, archivedAt: null } });
  if (!queue) throw new ChatRuleError("Fila não encontrada.", 404);

  let assigneeName = "";
  if (input.assigneeId) {
    const member = await prisma.chatQueueMember.findUnique({
      where: { userId_queueId: { userId: input.assigneeId, queueId: queue.id } },
      select: { user: { select: { name: true } } },
    });
    if (!member) throw new ChatRuleError("Esta pessoa não faz parte da fila escolhida.", 422);
    await assertCanReceive(input.assigneeId);
    assigneeName = member.user.name;
  }

  const updated = await prisma.chatConversation.updateMany({
    where: { id: conversation.id, closedAt: null },
    data: {
      queueId: queue.id,
      assigneeId: input.assigneeId ?? null,
      status: input.assigneeId ? "in_progress" : "waiting",
      waitingSince: input.assigneeId ? null : new Date(),
    },
  });
  if (updated.count === 0) throw new ChatRuleError("Conversa encerrada não pode ser transferida.", 409);

  const destination = assigneeName ? `${queue.name} (${assigneeName})` : queue.name;
  await addSystemMessage(conversation.id, `${actor.name} transferiu para ${destination}${input.reason ? `. Motivo: ${input.reason}` : ""}`);
  await addAudit({
    userId: actor.id,
    action: "conversation.transfer",
    targetId: conversation.id,
    before: { queueId: conversation.queueId, assigneeId: conversation.assigneeId },
    after: { queueId: queue.id, assigneeId: input.assigneeId ?? null, reason: input.reason },
  });
  if (input.assigneeId && input.assigneeId !== actor.id) {
    await prisma.chatNotification.create({
      data: { userId: input.assigneeId, conversationId: conversation.id, type: "transfer", title: "Conversa transferida para você", detail: `${actor.name}${input.reason ? `: ${input.reason}` : ""}`, href: `/chat?c=${conversation.id}` },
    });
  }
}

/** Atribuição do menu: sem a pessoa disponível, a conversa cai na fila em vez de ficar parada. */
export async function assignFromMenu(conversation: ChatConversation, userId: string | null, menuState: Prisma.InputJsonValue) {
  const user = userId ? await prisma.user.findFirst({ where: { id: userId, banned: false }, select: { id: true, name: true } }) : null;
  let available = Boolean(user);
  if (user) {
    try {
      await assertCanReceive(user.id);
    } catch (error) {
      if (!(error instanceof ChatRuleError)) throw error;
      available = false;
    }
  }

  await prisma.chatConversation.updateMany({
    where: { id: conversation.id, closedAt: null },
    data: {
      assigneeId: available ? user?.id : null,
      status: available ? "in_progress" : "waiting",
      waitingSince: available ? null : new Date(),
      menuState,
    },
  });
  if (!user || !available) {
    await addSystemMessage(conversation.id, `Menu automático não conseguiu atribuir${user ? ` a ${user.name}` : ""}. A conversa foi para a fila.`);
    return;
  }
  await addSystemMessage(conversation.id, `Menu automático atribuiu a ${user.name}`);
  await prisma.chatNotification.create({
    data: { userId: user.id, conversationId: conversation.id, type: "transfer", title: "Conversa atribuída a você", detail: "Menu automático", href: `/chat?c=${conversation.id}` },
  });
}

/** Grava o encerramento antes da despedida: falha no envio não deixa a conversa aberta. */
export async function closeConversation(conversation: ChatConversation, actor: ChatActor | null, systemText: string, farewell?: string) {
  const updated = await prisma.chatConversation.updateMany({
    where: { id: conversation.id, closedAt: null },
    data: { status: "closed", closedAt: new Date(), waitingSince: null, openKey: null },
  });
  if (updated.count === 0) throw new ChatRuleError("Esta conversa já está encerrada.", 409);

  await addSystemMessage(conversation.id, systemText);
  await addAudit({ userId: actor?.id ?? null, action: "conversation.close", targetId: conversation.id, before: { status: conversation.status } });
  const text = farewell ?? (await readChatSettings()).farewellText;
  if (text.trim() && isWindowOpen(conversation.lastInboundAt)) {
    const contact = await prisma.contact.findUnique({ where: { id: conversation.contactId }, select: { name: true } });
    await sendAutomaticMessage(conversation, fillVariables(text, { customer: contact?.name, agent: actor?.name }));
  }
}

export async function reopenConversation(actor: ChatActor, conversation: ChatConversation) {
  if (!conversation.closedAt) throw new ChatRuleError("Esta conversa já está aberta.", 409);
  const other = await prisma.chatConversation.findUnique({ where: { openKey: conversation.contactId }, select: { id: true } });
  if (other) throw new ChatRuleError("Este contato já tem outra conversa aberta.", 409, other.id);

  try {
    await prisma.chatConversation.update({
      where: { id: conversation.id },
      data: { status: "in_progress", assigneeId: actor.id, closedAt: null, openKey: conversation.contactId, waitingSince: null, menuState: Prisma.DbNull },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ChatRuleError("Este contato acabou de abrir outra conversa.", 409);
    }
    throw error;
  }
  await addSystemMessage(conversation.id, `${actor.name} reabriu a conversa`);
  await addAudit({ userId: actor.id, action: "conversation.reopen", targetId: conversation.id });
}
