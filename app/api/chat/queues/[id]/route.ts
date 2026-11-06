import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { chatError, requireChatActor } from "@/lib/chat/access";
import { addAudit } from "@/lib/chat/conversation";

type Context = { params: Promise<{ id: string }> };

const patch = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(300).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  hours: z.string().trim().max(120).optional(),
  firstResponseSlaMin: z.number().int().min(1).max(1440).optional(),
  order: z.number().int().min(0).max(999).optional(),
  archived: z.boolean().optional(),
});

export async function PATCH(request: Request, context: Context) {
  const guard = await requireChatActor("chat.queues", ["filas"]);
  if (guard.response) return guard.response;
  const { id } = await context.params;
  const parsed = patch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return chatError("Confira os dados da fila.", 400);

  const { archived, ...fields } = parsed.data;
  if (archived) {
    const open = await prisma.chatConversation.count({ where: { queueId: id, closedAt: null } });
    if (open > 0) return chatError(`Esta fila tem ${open} conversa(s) aberta(s). Transfira antes de arquivar.`, 409);
  }
  const updated = await prisma.chatQueue.updateMany({
    where: { id },
    data: { ...fields, ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }) },
  });
  if (updated.count === 0) return chatError("Fila não encontrada.", 404);
  await addAudit({ userId: guard.actor.id, action: "queue.update", targetId: id, after: parsed.data });
  return NextResponse.json({ ok: true });
}
