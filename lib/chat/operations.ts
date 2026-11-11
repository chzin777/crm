import "server-only";
import type { ChatConversation } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveChatCapabilities } from "@/lib/permissions";
import type { ChatActor } from "@/lib/chat/access";
import { AUTO_REPLY_COOLDOWN_MS, GLOBAL_HOURS_SCOPE, OFF_HOURS_TAG, autoReplyText, isOpenAt, sanitizeSchedule, type HoursRule } from "@/lib/chat/hours";
import { readMenuState, saveMenuState } from "@/lib/chat/menu";
import { ChatRuleError, sendAgentMessage, sendAutomaticMessage } from "@/lib/chat/outbound";

const SCHEDULED_BATCH = 20;
const FOLLOW_UP_BATCH = 50;

function toRule(row: { enabled: boolean; schedule: unknown; autoReplyMessage: string }): HoursRule {
  return { enabled: row.enabled, schedule: sanitizeSchedule(row.schedule), autoReplyMessage: row.autoReplyMessage };
}

/** Regra da fila quando ligada; senão a geral. Sem nenhuma ligada, devolve null (sempre aberto). */
export async function hoursFor(queueId: string | null): Promise<HoursRule | null> {
  const rows = await prisma.operatingHours.findMany({ where: { scope: { in: queueId ? [queueId, GLOBAL_HOURS_SCOPE] : [GLOBAL_HOURS_SCOPE] }, enabled: true } });
  const row = rows.find((item) => item.scope === queueId) ?? rows.find((item) => item.scope === GLOBAL_HOURS_SCOPE);
  return row ? toRule(row) : null;
}

/**
 * Mensagem recebida fora do expediente: responde com o horário (no máximo uma vez a cada 12h por conversa),
 * deixa a conversa em "Aguardando" com prioridade alta e a etiqueta "fora do horário" para a triagem da manhã.
 * Devolve true quando tratou a mensagem (o menu não roda).
 */
export async function handleOffHours(conversation: ChatConversation, receivedAt = new Date()) {
  const rule = await hoursFor(conversation.queueId);
  if (!rule || isOpenAt(rule, receivedAt)) return false;

  const text = autoReplyText(rule);
  const recent = await prisma.chatMessage.findFirst({
    where: { conversationId: conversation.id, author: "bot", text, createdAt: { gte: new Date(Date.now() - AUTO_REPLY_COOLDOWN_MS) } },
    select: { id: true },
  });
  if (!recent) await sendAutomaticMessage(conversation, text);

  // Quem escreveu fora do horário espera um atendente: o menu não volta a aparecer na abertura.
  const state = readMenuState(conversation.menuState);
  if (!state.stopped) {
    state.stopped = true;
    await saveMenuState(conversation.id, state);
  }

  const priority = conversation.priority === "urgent" ? "urgent" : "high";
  await prisma.chatConversation.update({
    where: { id: conversation.id },
    data: {
      status: "waiting",
      waitingSince: conversation.waitingSince ?? receivedAt,
      priority,
      ...(conversation.tags.includes(OFF_HOURS_TAG) ? {} : { tags: { push: OFF_HOURS_TAG } }),
    },
  });
  console.log(`[bot] ${conversation.id}: fora do horário de atendimento${recent ? " (aviso já enviado nas últimas 12h)" : ""}`);
  return true;
}

/** Quem agendou envia pelo relógio com as próprias permissões, como se tivesse clicado em Enviar. */
async function actorFor(userId: string): Promise<ChatActor | null> {
  const record = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, role: true, banned: true, roleRef: { select: { permissions: true } }, chatQueues: { select: { queueId: true } } },
  });
  if (!record || record.banned) return null;
  return {
    id: userId,
    name: record.name,
    isAdmin: false,
    capabilities: resolveChatCapabilities(record.role, record.roleRef?.permissions),
    queueIds: record.chatQueues.map((item) => item.queueId),
  };
}

const failureOf = (error: unknown) => (error instanceof ChatRuleError || error instanceof Error ? error.message : "Falha ao enviar.").slice(0, 500);

/** Mensagens agendadas que venceram. A reserva (SCHEDULED -> SENT) impede dois relógios de enviarem a mesma. */
export async function dispatchScheduledMessages(now = new Date()) {
  const due = await prisma.scheduledMessage.findMany({
    where: { status: "SCHEDULED", scheduledFor: { lte: now } },
    orderBy: { scheduledFor: "asc" },
    take: SCHEDULED_BATCH,
  });
  let sent = 0;
  let failed = 0;
  for (const item of due) {
    const claimed = await prisma.scheduledMessage.updateMany({ where: { id: item.id, status: "SCHEDULED" }, data: { status: "SENT", sentAt: now } });
    if (claimed.count === 0) continue;
    const fail = async (reason: string) => {
      failed += 1;
      await prisma.scheduledMessage.update({ where: { id: item.id }, data: { status: "FAILED", failureReason: reason } });
    };
    try {
      const [actor, conversation] = await Promise.all([actorFor(item.userId), prisma.chatConversation.findUnique({ where: { id: item.conversationId } })]);
      if (!conversation) {
        await fail("Conversa não encontrada.");
        continue;
      }
      if (!actor || !actor.capabilities["chat.assume"]) {
        await fail("Quem agendou não tem mais permissão para responder.");
        continue;
      }
      const message = await sendAgentMessage(actor, conversation, { text: item.text, internal: false });
      if (message.delivery === "failed") {
        await prisma.scheduledMessage.update({ where: { id: item.id }, data: { status: "FAILED", failureReason: message.failureReason ?? "Falha no envio.", messageId: message.id } });
        failed += 1;
      } else {
        await prisma.scheduledMessage.update({ where: { id: item.id }, data: { messageId: message.id } });
        sent += 1;
      }
    } catch (error) {
      if (!(error instanceof ChatRuleError)) console.error(`[chat] falha na mensagem agendada ${item.id}:`, error);
      await fail(failureOf(error));
    }
  }
  return { sent, failed };
}

/** Avisa uma vez o atendente quando o lembrete de retorno vence. */
export async function notifyDueFollowUps(now = new Date()) {
  const due = await prisma.followUp.findMany({
    where: { status: "PENDING", notifiedAt: null, dueAt: { lte: now } },
    include: { contact: { select: { name: true } } },
    orderBy: { dueAt: "asc" },
    take: FOLLOW_UP_BATCH,
  });
  for (const item of due) {
    const claimed = await prisma.followUp.updateMany({ where: { id: item.id, notifiedAt: null }, data: { notifiedAt: now } });
    if (claimed.count === 0) continue;
    await prisma.chatNotification.create({
      data: {
        userId: item.userId,
        conversationId: item.conversationId,
        type: "followup",
        title: `Retorno agendado: ${item.contact.name}`,
        detail: item.note || "Hora de falar com o cliente de novo.",
        href: `/chat?c=${item.conversationId}`,
      },
    });
  }
  return due.length;
}
