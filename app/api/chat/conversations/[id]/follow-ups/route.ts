import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { chatError, conversationNotFound, findScopedConversation, requireChatActor } from "@/lib/chat/access";
import { addAudit } from "@/lib/chat/conversation";
import { followUpSelect, serializeFollowUp } from "@/lib/chat/follow-ups";

type Context = { params: Promise<{ id: string }> };

const DONE_LIMIT = 5;
const body = z.object({ dueAt: z.string().datetime({ offset: true }), note: z.string().trim().max(300).default("") });

export async function GET(_request: Request, context: Context) {
  const guard = await requireChatActor();
  if (guard.response) return guard.response;
  const { id } = await context.params;
  const conversation = await findScopedConversation(guard.actor, id);
  if (!conversation) return conversationNotFound();

  const [pending, done] = await Promise.all([
    prisma.followUp.findMany({ where: { conversationId: id, status: "PENDING" }, orderBy: { dueAt: "asc" }, select: followUpSelect }),
    prisma.followUp.findMany({ where: { conversationId: id, status: { not: "PENDING" } }, orderBy: { updatedAt: "desc" }, take: DONE_LIMIT, select: followUpSelect }),
  ]);
  return NextResponse.json({ items: [...pending, ...done].map((item) => serializeFollowUp(item, guard.actor.id)) });
}

export async function POST(request: Request, context: Context) {
  const guard = await requireChatActor("chat.assume");
  if (guard.response) return guard.response;
  const { id } = await context.params;
  const conversation = await findScopedConversation(guard.actor, id);
  if (!conversation) return conversationNotFound();

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return chatError("Informe data e hora válidas e uma anotação de até 300 caracteres.", 400);
  const dueAt = new Date(parsed.data.dueAt);
  if (dueAt.getTime() < Date.now() - 60_000) return chatError("Escolha uma data e hora no futuro.", 400);

  const created = await prisma.followUp.create({
    data: { conversationId: id, contactId: conversation.contactId, userId: guard.actor.id, dueAt, note: parsed.data.note },
    select: followUpSelect,
  });
  await addAudit({ userId: guard.actor.id, action: "followup.create", targetId: id, after: { followUpId: created.id, dueAt } });
  return NextResponse.json(serializeFollowUp(created, guard.actor.id), { status: 201 });
}
