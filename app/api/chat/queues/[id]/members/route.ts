import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { chatError, requireChatActor } from "@/lib/chat/access";
import { addAudit } from "@/lib/chat/conversation";

type Context = { params: Promise<{ id: string }> };

const body = z.object({ userIds: z.array(z.string().min(1)).min(1).max(200) });

export async function POST(request: Request, context: Context) {
  const guard = await requireChatActor("chat.queues", ["filas"]);
  if (guard.response) return guard.response;
  const { id } = await context.params;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return chatError("Selecione ao menos uma pessoa.", 400);

  const queue = await prisma.chatQueue.findFirst({ where: { id, archivedAt: null }, select: { id: true } });
  if (!queue) return chatError("Fila não encontrada.", 404);

  const users = await prisma.user.findMany({ where: { id: { in: parsed.data.userIds }, banned: false }, select: { id: true } });
  const added = await prisma.chatQueueMember.createMany({
    data: users.map((user) => ({ userId: user.id, queueId: id })),
    skipDuplicates: true,
  });
  await addAudit({ userId: guard.actor.id, action: "queue.member.add", targetId: id, after: { userIds: users.map((user) => user.id) } });
  return NextResponse.json({ added: added.count }, { status: 201 });
}

export async function DELETE(request: Request, context: Context) {
  const guard = await requireChatActor("chat.queues", ["filas"]);
  if (guard.response) return guard.response;
  const { id } = await context.params;
  const userId = new URL(request.url).searchParams.get("userId");
  if (!userId) return chatError("Dados inválidos.", 400);
  await prisma.chatQueueMember.deleteMany({ where: { userId, queueId: id } });
  await addAudit({ userId: guard.actor.id, action: "queue.member.remove", targetId: id, before: { userId } });
  return NextResponse.json({ ok: true });
}
