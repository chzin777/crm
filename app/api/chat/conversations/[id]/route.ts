import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { deleteFile } from "@/lib/minio";
import { chatError, findScopedConversation, requireChatActor, scopeWhere, conversationNotFound } from "@/lib/chat/access";
import { campaignOrigins, discardCampaignReplies } from "@/lib/chat/campaign-origin";
import { addAudit, isBlocked } from "@/lib/chat/conversation";
import type { ChatAttachment } from "@/lib/chat/media-rules";
import { conversationInclude, serializeConversation } from "@/lib/chat/serialize";

type Context = { params: Promise<{ id: string }> };

const attachmentKey = (attachment: unknown) => (attachment as ChatAttachment | null)?.key;

/** Apaga os arquivos que nenhuma outra mensagem usa. Falha aqui não desfaz a exclusão. */
async function removeAttachmentFiles(keys: string[]) {
  if (keys.length === 0) return;
  try {
    const stillUsed = await prisma.chatMessage.findMany({
      where: { OR: keys.map((key) => ({ attachment: { path: ["key"], equals: key } })) },
      select: { attachment: true },
    });
    const used = new Set(stillUsed.map((message) => attachmentKey(message.attachment)));
    const results = await Promise.allSettled(keys.filter((key) => !used.has(key)).map((key) => deleteFile(key)));
    const failed = results.filter((result) => result.status === "rejected").length;
    if (failed > 0) console.error(`[chat] ${failed} arquivo(s) não removido(s) ao excluir conversa.`);
  } catch (error) {
    console.error("[chat] falha ao remover arquivos da conversa:", error);
  }
}

const patchBody = z.object({
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  subject: z.string().trim().max(200).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
});

export async function PATCH(request: Request, context: Context) {
  const guard = await requireChatActor("chat.assume");
  if (guard.response) return guard.response;
  const { id } = await context.params;
  const conversation = await findScopedConversation(guard.actor, id);
  if (!conversation) return conversationNotFound();

  const parsed = patchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return chatError("Dados inválidos.", 400);

  await prisma.chatConversation.update({ where: { id }, data: parsed.data });
  await addAudit({
    userId: guard.actor.id,
    action: "conversation.update",
    targetId: id,
    before: { priority: conversation.priority, subject: conversation.subject, tags: conversation.tags },
    after: parsed.data,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, context: Context) {
  const guard = await requireChatActor();
  if (guard.response) return guard.response;
  if (!guard.actor.isAdmin) return chatError("Apenas administradores podem excluir conversas.", 403);
  const { id } = await context.params;
  const conversation = await findScopedConversation(guard.actor, id);
  if (!conversation) return conversationNotFound();
  // Motivo "Não é resposta da campanha" (ex.: robô respondeu ao disparo): limpa a resposta das métricas e evita nova marcação.
  const reason = new URL(request.url).searchParams.get("motivo") === "nao_resposta_campanha" ? "nao_resposta_campanha" : null;
  const discardedReplies = reason ? await discardCampaignReplies(conversation) : 0;

  const [messageCount, withAttachment] = await Promise.all([
    prisma.chatMessage.count({ where: { conversationId: id } }),
    prisma.chatMessage.findMany({ where: { conversationId: id, attachment: { not: Prisma.DbNull } }, select: { attachment: true } }),
  ]);

  // As mensagens saem por cascata (ChatMessage.conversation onDelete: Cascade); a auditoria permanece.
  await prisma.$transaction(async (tx) => {
    await tx.chatNotification.deleteMany({ where: { conversationId: id } });
    await tx.chatConversation.deleteMany({ where: { id } });
    await addAudit({
      userId: guard.actor.id,
      action: "conversation.delete",
      targetId: id,
      before: { contactId: conversation.contactId, phone: conversation.phone, status: conversation.status, queueId: conversation.queueId, assigneeId: conversation.assigneeId, subject: conversation.subject, messageCount, campaignId: conversation.campaignId },
      ...(reason ? { after: { motivo: reason, respostasDescontadas: discardedReplies } } : {}),
    }, tx);
  });

  const keys = withAttachment.map((message) => attachmentKey(message.attachment)).filter((key): key is string => !!key?.startsWith("chat/"));
  await removeAttachmentFiles([...new Set(keys)]);
  return NextResponse.json({ ok: true, discardedReplies });
}

export async function GET(_request: Request, context: Context) {
  const guard = await requireChatActor();
  if (guard.response) return guard.response;
  const { id } = await context.params;

  const row = await prisma.chatConversation.findFirst({
    where: { AND: [{ id }, scopeWhere(guard.actor)] },
    include: conversationInclude,
  });
  if (!row) return conversationNotFound();

  const [blocked, campaigns, previous] = await Promise.all([
    isBlocked(row.phone),
    campaignOrigins(row.contactId, row.phone),
    prisma.chatConversation.findMany({
      where: { AND: [{ contactId: row.contactId, id: { not: row.id } }, scopeWhere(guard.actor)] },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, status: true, subject: true, createdAt: true, closedAt: true, queue: { select: { name: true } } },
    }),
  ]);

  return NextResponse.json({ ...serializeConversation(row), blocked, campaigns, previous });
}
