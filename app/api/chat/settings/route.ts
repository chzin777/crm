import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { chatError, requireChatActor } from "@/lib/chat/access";
import { addAudit, readChatSettings } from "@/lib/chat/conversation";

const option: z.ZodType = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    label: z.string().trim().min(1).max(120),
    action: z.enum(["submenu", "reply", "queue"]),
    text: z.string().max(4096),
    queueId: z.string().nullable(),
    options: z.array(option).max(20),
  }),
);

const settings = z.object({
  enabled: z.boolean(),
  greeting: z.string().max(4096),
  footer: z.string().max(500),
  closingText: z.string().max(1000),
  closingDelaySeconds: z.number().int().min(0).max(3600),
  repeatMenu: z.boolean(),
  acceptFreeText: z.boolean(),
  invalidOptionText: z.string().max(1000),
  farewellText: z.string().max(1000),
  notifyQueuePosition: z.boolean(),
  silenceEnabled: z.boolean(),
  silenceAskMinutes: z.number().int().min(1).max(1440),
  silenceCloseMinutes: z.number().int().min(1).max(1440),
  silenceAskText: z.string().max(1000),
  silenceCloseText: z.string().max(1000),
  options: z.array(option).max(20),
});

export async function GET() {
  const guard = await requireChatActor("chat.queues", ["filas"]);
  if (guard.response) return guard.response;
  return NextResponse.json({ data: await readChatSettings() });
}

export async function PUT(request: Request) {
  const guard = await requireChatActor("chat.queues", ["filas"]);
  if (guard.response) return guard.response;
  const parsed = settings.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return chatError("Confira os dados do menu.", 400);
  const menu = parsed.data as unknown as Prisma.InputJsonValue;
  await prisma.chatSettings.upsert({ where: { id: "default" }, create: { id: "default", menu }, update: { menu } });
  await addAudit({ userId: guard.actor.id, action: "settings.update", targetId: "default", after: parsed.data });
  return NextResponse.json({ ok: true });
}
