import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { chatError, requireChatActor } from "@/lib/chat/access";
import { addAudit } from "@/lib/chat/conversation";

const body = z.object({ phone: z.string().trim().min(8).max(20), reason: z.string().trim().max(300).default("") });

export async function GET() {
  const guard = await requireChatActor("chat.queues", ["filas"]);
  if (guard.response) return guard.response;
  return NextResponse.json({ data: await prisma.chatBlockedNumber.findMany({ orderBy: { createdAt: "desc" } }) });
}

export async function POST(request: Request) {
  const guard = await requireChatActor("chat.queues", ["filas"]);
  if (guard.response) return guard.response;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return chatError("Telefone inválido.", 400);
  const phone = parsed.data.phone.replace(/\D/g, "");
  await prisma.chatBlockedNumber.upsert({
    where: { phone },
    create: { phone, reason: parsed.data.reason, createdBy: guard.actor.id },
    update: { reason: parsed.data.reason },
  });
  await addAudit({ userId: guard.actor.id, action: "number.block", targetId: phone, after: { reason: parsed.data.reason } });
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: Request) {
  const guard = await requireChatActor("chat.queues", ["filas"]);
  if (guard.response) return guard.response;
  const phone = new URL(request.url).searchParams.get("phone");
  if (!phone) return chatError("Dados inválidos.", 400);
  await prisma.chatBlockedNumber.deleteMany({ where: { phone } });
  await addAudit({ userId: guard.actor.id, action: "number.unblock", targetId: phone });
  return NextResponse.json({ ok: true });
}
