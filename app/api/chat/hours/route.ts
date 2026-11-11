import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { chatError, requireChatActor } from "@/lib/chat/access";
import { addAudit } from "@/lib/chat/conversation";
import { GLOBAL_HOURS_SCOPE, sanitizeSchedule } from "@/lib/chat/hours";

const body = z.object({
  scope: z.string().min(1).max(64),
  enabled: z.boolean(),
  schedule: z.array(z.object({ day: z.number().int().min(0).max(6), open: z.string(), close: z.string() })).max(7),
  autoReplyMessage: z.string().max(1000),
});

/** Horário geral e por fila. Quem atende lê; só quem gerencia filas altera. */
export async function GET() {
  const guard = await requireChatActor();
  if (guard.response) return guard.response;
  const rows = await prisma.operatingHours.findMany();
  return NextResponse.json({
    items: rows.map((row) => ({ scope: row.scope, enabled: row.enabled, schedule: sanitizeSchedule(row.schedule), autoReplyMessage: row.autoReplyMessage })),
  });
}

export async function PUT(request: Request) {
  const guard = await requireChatActor("chat.queues");
  if (guard.response) return guard.response;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return chatError("Dados inválidos.", 400);
  const { scope, enabled, autoReplyMessage } = parsed.data;

  if (scope !== GLOBAL_HOURS_SCOPE && !(await prisma.chatQueue.findUnique({ where: { id: scope }, select: { id: true } }))) {
    return chatError("Fila não encontrada.", 404);
  }
  const schedule = sanitizeSchedule(parsed.data.schedule);
  if (schedule.length !== parsed.data.schedule.length) return chatError("Confira os horários: a abertura precisa ser antes do fechamento (HH:MM).", 400);
  if (enabled && schedule.length === 0) return chatError("Marque pelo menos um dia de atendimento.", 400);

  const data = { enabled, schedule: schedule as unknown as Prisma.InputJsonValue, autoReplyMessage: autoReplyMessage.trim() };
  const before = await prisma.operatingHours.findUnique({ where: { scope } });
  const saved = await prisma.operatingHours.upsert({ where: { scope }, create: { scope, ...data }, update: data });
  await addAudit({ userId: guard.actor.id, action: "hours.update", targetId: scope, before, after: saved });
  return NextResponse.json({ scope: saved.scope, enabled: saved.enabled, schedule, autoReplyMessage: saved.autoReplyMessage });
}
