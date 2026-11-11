import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { chatError, findScopedConversation, requireChatActor } from "@/lib/chat/access";
import { addAudit } from "@/lib/chat/conversation";
import { followUpSelect, serializeFollowUp } from "@/lib/chat/follow-ups";

type Context = { params: Promise<{ followUpId: string }> };

const body = z.union([
  z.object({ status: z.enum(["COMPLETED", "CANCELLED"]) }),
  z.object({ dueAt: z.string().datetime({ offset: true }) }),
]);

/** Concluir, cancelar ou adiar um lembrete pendente. */
export async function PATCH(request: Request, context: Context) {
  const guard = await requireChatActor("chat.assume");
  if (guard.response) return guard.response;
  const { followUpId } = await context.params;

  const current = await prisma.followUp.findUnique({ where: { id: followUpId }, select: { conversationId: true, status: true } });
  if (!current || !(await findScopedConversation(guard.actor, current.conversationId))) return chatError("Lembrete não encontrado.", 404);
  if (current.status !== "PENDING") return chatError("Este lembrete já foi concluído ou cancelado.", 409);

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return chatError("Dados inválidos.", 400);

  let data: { status: "COMPLETED" | "CANCELLED"; completedAt: Date } | { dueAt: Date; notifiedAt: null };
  if ("status" in parsed.data) {
    data = { status: parsed.data.status, completedAt: new Date() };
  } else {
    const dueAt = new Date(parsed.data.dueAt);
    if (dueAt.getTime() < Date.now() - 60_000) return chatError("Escolha uma data e hora no futuro.", 400);
    data = { dueAt, notifiedAt: null };
  }

  const updated = await prisma.followUp.update({ where: { id: followUpId }, data, select: followUpSelect });
  await addAudit({ userId: guard.actor.id, action: "followup.update", targetId: current.conversationId, after: { followUpId, ...parsed.data } });
  return NextResponse.json(serializeFollowUp(updated, guard.actor.id));
}
