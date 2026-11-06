import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { chatError, requireChatActor } from "@/lib/chat/access";
import { addAudit } from "@/lib/chat/conversation";
import { loadQueueBoard } from "@/lib/chat/team";

const queueBody = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).default(""),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#002187"),
  hours: z.string().trim().max(120).default(""),
  firstResponseSlaMin: z.number().int().min(1).max(1440).default(15),
  order: z.number().int().min(0).max(999).default(0),
});

export async function GET() {
  const guard = await requireChatActor(undefined, ["chat", "filas"]);
  if (guard.response) return guard.response;
  return NextResponse.json({ data: await loadQueueBoard() });
}

export async function POST(request: Request) {
  const guard = await requireChatActor("chat.queues", ["filas"]);
  if (guard.response) return guard.response;
  const parsed = queueBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return chatError("Confira os dados da fila.", 400);
  const queue = await prisma.chatQueue.create({ data: parsed.data });
  await addAudit({ userId: guard.actor.id, action: "queue.create", targetId: queue.id, after: parsed.data });
  return NextResponse.json({ id: queue.id }, { status: 201 });
}
