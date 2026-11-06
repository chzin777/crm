import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { chatError, requireChatActor } from "@/lib/chat/access";

const body = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1).max(120),
  text: z.string().trim().min(1).max(4096),
  shortcut: z.string().trim().max(40).default(""),
  automatic: z.boolean().default(false),
  triggers: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
  variations: z.array(z.string().trim().min(1).max(4096)).max(10).default([]),
  queueId: z.string().nullable().default(null),
});

export async function GET() {
  const guard = await requireChatActor(undefined, ["chat", "filas"]);
  if (guard.response) return guard.response;
  const data = await prisma.chatQuickReply.findMany({ orderBy: { title: "asc" } });
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const guard = await requireChatActor("chat.queues", ["filas"]);
  if (guard.response) return guard.response;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return chatError("Confira os dados da resposta.", 400);
  const { id, ...data } = parsed.data;
  const saved = id
    ? await prisma.chatQuickReply.update({ where: { id }, data })
    : await prisma.chatQuickReply.create({ data });
  return NextResponse.json({ id: saved.id }, { status: id ? 200 : 201 });
}

export async function DELETE(request: Request) {
  const guard = await requireChatActor("chat.queues", ["filas"]);
  if (guard.response) return guard.response;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return chatError("Dados inválidos.", 400);
  await prisma.chatQuickReply.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
