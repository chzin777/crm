import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { chatError, requireChatActor } from "@/lib/chat/access";
import { addAudit } from "@/lib/chat/conversation";

type Context = { params: Promise<{ id: string }> };

const body = z.object({ userId: z.string().min(1) });

export async function POST(request: Request, context: Context) {
  const guard = await requireChatActor("chat.queues", ["filas"]);
  if (guard.response) return guard.response;
  const { id } = await context.params;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return chatError("Dados inválidos.", 400);

  const queue = await prisma.chatQueue.findFirst({ where: { id, archivedAt: null }, select: { id: true } });
  if (!queue) return chatError("Fila não encontrada.", 404);
  await prisma.chatQueueMember.upsert({
    where: { userId_queueId: { userId: parsed.data.userId, queueId: id } },
    create: { userId: parsed.data.userId, queueId: id },
    update: {},
  });
  await addAudit({ userId: guard.actor.id, action: "queue.member.add", targetId: id, after: parsed.data });
  return NextResponse.json({ ok: true }, { status: 201 });
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
