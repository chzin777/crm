import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { chatError, conversationNotFound, findScopedConversation, requireChatActor } from "@/lib/chat/access";
import { addAudit, isBlocked, WINDOW_MS } from "@/lib/chat/conversation";
import { scheduledSelect, serializeScheduled } from "@/lib/chat/follow-ups";

type Context = { params: Promise<{ id: string }> };

const FAILED_VISIBLE_MS = 24 * 60 * 60 * 1000;
const body = z.object({ text: z.string().trim().min(1).max(4096), scheduledFor: z.string().datetime({ offset: true }) });

const timeLabel = (date: Date) => date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

/** Agendadas pendentes e as que falharam nas últimas 24h (para o atendente ver o motivo). */
export async function GET(_request: Request, context: Context) {
  const guard = await requireChatActor();
  if (guard.response) return guard.response;
  const { id } = await context.params;
  const conversation = await findScopedConversation(guard.actor, id);
  if (!conversation) return conversationNotFound();

  const rows = await prisma.scheduledMessage.findMany({
    where: {
      conversationId: id,
      OR: [{ status: "SCHEDULED" }, { status: "FAILED", updatedAt: { gte: new Date(Date.now() - FAILED_VISIBLE_MS) } }],
    },
    orderBy: { scheduledFor: "asc" },
    select: scheduledSelect,
  });
  return NextResponse.json({ items: rows.map(serializeScheduled) });
}

export async function POST(request: Request, context: Context) {
  const guard = await requireChatActor("chat.assume");
  if (guard.response) return guard.response;
  const { id } = await context.params;
  const conversation = await findScopedConversation(guard.actor, id);
  if (!conversation) return conversationNotFound();
  if (conversation.closedAt) return chatError("Conversa encerrada. Reabra para agendar mensagens.", 409);
  if (await isBlocked(conversation.phone)) return chatError("Este número está bloqueado e não recebe mensagens.", 422);

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return chatError("Escreva a mensagem e escolha data e hora válidas.", 400);
  const scheduledFor = new Date(parsed.data.scheduledFor);
  if (scheduledFor.getTime() < Date.now() + 60_000) return chatError("Agende para pelo menos 1 minuto à frente.", 400);

  // Texto livre só sai com a janela de 24h aberta; depois dela a Meta exige modelo aprovado.
  const windowEnd = conversation.lastInboundAt ? new Date(conversation.lastInboundAt.getTime() + WINDOW_MS) : null;
  if (!windowEnd || scheduledFor >= windowEnd) {
    return chatError(
      windowEnd && windowEnd.getTime() > Date.now()
        ? `A janela de 24h do cliente fecha em ${timeLabel(windowEnd)}. Agende antes disso ou use um modelo aprovado.`
        : "A janela de 24h está fechada: só modelos aprovados podem ser enviados.",
      422,
      { code: "window_closed" },
    );
  }

  const created = await prisma.scheduledMessage.create({
    data: { conversationId: id, userId: guard.actor.id, text: parsed.data.text, scheduledFor },
    select: scheduledSelect,
  });
  await addAudit({ userId: guard.actor.id, action: "scheduled.create", targetId: id, after: { scheduledId: created.id, scheduledFor } });
  return NextResponse.json(serializeScheduled(created), { status: 201 });
}
