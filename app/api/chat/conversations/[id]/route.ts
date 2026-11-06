import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { chatError, findScopedConversation, requireChatActor, scopeWhere, conversationNotFound } from "@/lib/chat/access";
import { addAudit, isBlocked } from "@/lib/chat/conversation";
import { conversationInclude, serializeConversation } from "@/lib/chat/serialize";

type Context = { params: Promise<{ id: string }> };

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

export async function GET(_request: Request, context: Context) {
  const guard = await requireChatActor();
  if (guard.response) return guard.response;
  const { id } = await context.params;

  const row = await prisma.chatConversation.findFirst({
    where: { AND: [{ id }, scopeWhere(guard.actor)] },
    include: conversationInclude,
  });
  if (!row) return conversationNotFound();

  const [blocked, previous] = await Promise.all([
    isBlocked(row.phone),
    prisma.chatConversation.findMany({
      where: { AND: [{ contactId: row.contactId, id: { not: row.id } }, scopeWhere(guard.actor)] },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, status: true, subject: true, createdAt: true, closedAt: true, queue: { select: { name: true } } },
    }),
  ]);

  return NextResponse.json({ ...serializeConversation(row), blocked, previous });
}
