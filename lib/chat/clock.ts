import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { brDay } from "@/lib/br-time";
import { retryInboundMedia } from "@/lib/chat/inbound";
import { conversationEngaged } from "@/lib/chat/noise-db";
import { resolveChatCapabilities } from "@/lib/permissions";
import { closeConversation } from "@/lib/chat/actions";
import { firstDispatch, isWindowOpen, readChatSettings } from "@/lib/chat/conversation";
import { readMenuState, saveMenuState, sendMenu } from "@/lib/chat/menu";
import { expireSurveys, isSurveyMessage, resendSurvey } from "@/lib/chat/nps";
import { isConnectFailure, sendText } from "@/lib/meta-whatsapp";
import { silenceFarewell } from "@/lib/chat/settings";
import { resendAutomatic, sendAutomaticMessage } from "@/lib/chat/outbound";
import { dispatchScheduledMessages, notifyDueFollowUps } from "@/lib/chat/operations";
import { planQueuePositions } from "@/lib/chat/queue-rules";
import { syncWonOpportunities } from "@/lib/sales-pipeline-db";
import { reportError } from "@/lib/monitoring/error-reporter";
import { checkInactiveTriggers, resumeDueExecutions } from "@/lib/automations/engine-db";
import { checkConversions, checkErpTriggers } from "@/lib/automations/erp-sync";
import { ensureScoringFlows } from "@/lib/automations/scoring-seed";
import { attributeSales } from "@/lib/automations/attribution";
import { scheduleDailyRfvp } from "@/lib/rfvp-db";

const MINUTE = 60_000;
const PRIORITY_STEP = { low: "normal", normal: "high", high: "urgent", urgent: "urgent" } as const;
const DISPATCH_RETENTION_DAYS = 30;
const RESEND_WINDOW_MINUTES = 15;
const MEDIA_RETRY_HOURS = 48;
const MEDIA_RETRY_BATCH = 5;

async function supervisors() {
  const users = await prisma.user.findMany({ where: { banned: false }, select: { id: true, role: true, roleRef: { select: { permissions: true } } } });
  return users.filter((user) => resolveChatCapabilities(user.role, user.roleRef?.permissions)["chat.viewAll"]).map((user) => user.id);
}

async function queueTeam(queueId: string | null) {
  const [members, chiefs] = await Promise.all([
    queueId ? prisma.chatQueueMember.findMany({ where: { queueId }, select: { userId: true } }) : [],
    supervisors(),
  ]);
  return [...members.map((member) => member.userId), ...chiefs];
}

async function notify(userIds: string[], notice: { conversationId?: string; type: string; title: string; detail: string; href: string }) {
  const targets = [...new Set(userIds)];
  if (targets.length === 0) return;
  await prisma.chatNotification.createMany({ data: targets.map((userId) => ({ ...notice, userId })) });
}

export async function runClock() {
  const summary = { closings: 0, wait3: 0, wait8: 0, positions: 0, queueFull: 0, silenceAsked: 0, silenceClosed: 0, surveysExpired: 0, resent: 0, cleaned: 0, mediaRecovered: 0, scheduledSent: 0, scheduledFailed: 0, followUpsDue: 0, automationsResumed: 0, automationsInactive: 0, automationsErp: 0, automationsConverted: 0, errors: [] as string[] };
  const block = async (name: string, action: () => Promise<void>) => {
    try {
      await action();
    } catch (error) {
      summary.errors.push(`${name}: ${error instanceof Error ? error.message : "falhou"}`);
      void reportError(`cron.${name}`, error);
    }
  };

  const settings = await readChatSettings();
  const now = Date.now();

  await block("mensagens agendadas", async () => {
    const result = await dispatchScheduledMessages(new Date(now));
    summary.scheduledSent = result.sent;
    summary.scheduledFailed = result.failed;
  });

  await block("lembretes de retorno", async () => {
    summary.followUpsDue = await notifyDueFollowUps(new Date(now));
  });

  await block("fechamento do menu", async () => {
    const rows = await prisma.chatConversation.findMany({ where: { closedAt: null, assigneeId: null, status: "bot" } });
    for (const row of rows) {
      const state = readMenuState(row.menuState);
      if (!state.closeAt || new Date(state.closeAt).getTime() > now) continue;
      const phrase = state.closePhrase ?? "";
      state.closeAt = null;
      state.closePhrase = null;
      await saveMenuState(row.id, state);
      if (!isWindowOpen(row.lastInboundAt)) continue;
      if (settings.repeatMenu) await sendMenu(row, settings, state.path, [phrase]);
      else if (phrase.trim()) await sendAutomaticMessage(row, phrase.trim());
      summary.closings += 1;
    }
  });

  await block("espera", async () => {
    const rows = await prisma.chatConversation.findMany({
      where: { status: "waiting", closedAt: null, waitingSince: { lte: new Date(now - 3 * MINUTE) } },
      include: { contact: { select: { name: true } }, queue: { select: { name: true } } },
    });
    for (const row of rows) {
      const since = row.waitingSince!;
      const href = `/chat?c=${row.id}`;
      const detail = `${row.contact.name}${row.queue ? ` na fila ${row.queue.name}` : ""}`;
      if (await firstDispatch(`wait3:${row.id}:${since.toISOString()}`)) {
        await notify(await queueTeam(row.queueId), { conversationId: row.id, type: "wait", title: "Conversa esperando há 3 minutos", detail, href });
        summary.wait3 += 1;
      }
      if (now - since.getTime() >= 8 * MINUTE && (await firstDispatch(`wait8:${row.id}:${since.toISOString()}`))) {
        await prisma.chatConversation.update({ where: { id: row.id }, data: { priority: PRIORITY_STEP[row.priority] } });
        await notify(await supervisors(), { conversationId: row.id, type: "escalation", title: "Conversa esperando há 8 minutos", detail, href });
        summary.wait8 += 1;
      }
    }
  });

  // A posição é guardada sempre (o painel de /filas mostra há quanto tempo o cliente está nela);
  // o aviso ao cliente só sai com a opção ligada.
  await block("posição na fila", async () => {
    // Conversas em atendimento pela IA ficam de fora (nem posição, nem aviso): regra em lib/chat/queue-rules.
    const rows = await prisma.chatConversation.findMany({
      where: { status: "waiting", closedAt: null, queueId: { not: null } },
      orderBy: { waitingSince: "asc" },
      include: { queue: { select: { name: true } } },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const updates = planQueuePositions(
      rows.map((row) => ({ ...row, queueName: row.queue?.name ?? null })),
      { now: new Date(now), notifyEnabled: settings.notifyQueuePosition, windowOpen: isWindowOpen },
    );
    for (const update of updates) {
      const row = byId.get(update.id)!;
      const state = readMenuState(row.menuState);
      state.notifiedPosition = update.position;
      state.positionSince = update.positionSince;
      await saveMenuState(row.id, state);
      // "Você avançou na fila" só para quem entrou na fila de verdade: atendimento engajado (pediu algo além de
      // saudação, interesse genérico, ruído ou resposta automática de outra empresa).
      if (update.notify && (await conversationEngaged(row))) {
        await sendAutomaticMessage(row, update.notify);
        summary.positions += 1;
      }
    }
  });

  await block("fila no limite", async () => {
    const queues = await prisma.chatQueue.findMany({
      where: { archivedAt: null },
      include: { members: { include: { user: { select: { chatAgent: true } } } } },
    });
    const hour = new Date(now).toISOString().slice(0, 13);
    for (const queue of queues) {
      const capacity = queue.members.reduce((total, member) => total + (member.user.chatAgent?.paused ? 0 : member.user.chatAgent?.capacity ?? 0), 0);
      if (capacity === 0) continue;
      // Conversa com a IA (status bot) não ocupa atendente: fica fora da contagem da fila.
      const open = await prisma.chatConversation.count({ where: { queueId: queue.id, closedAt: null, status: { not: "bot" } } });
      if (open < capacity || !(await firstDispatch(`queue-full:${queue.id}:${hour}`))) continue;
      await notify(await supervisors(), { type: "queue", title: "Fila no limite", detail: `${queue.name}: ${open} conversas para capacidade ${capacity}`, href: "/filas" });
      summary.queueFull += 1;
    }
  });

  await block("silêncio", async () => {
    if (!settings.silenceEnabled) return;
    // Só conversa em que nada encaminhou para gente: status bot e sem dono.
    const rows = await prisma.chatConversation.findMany({ where: { status: "bot", closedAt: null, assigneeId: null, lastMessageAt: { lte: new Date(now - settings.silenceAskMinutes * MINUTE) } } });
    for (const row of rows) {
      const last = await prisma.chatMessage.findFirst({ where: { conversationId: row.id, internal: false }, orderBy: { createdAt: "desc" }, select: { author: true } });
      if (last?.author === "customer") continue;
      const state = readMenuState(row.menuState);
      if (state.closeAt) continue;
      // "Você ainda está por aí?" só em atendimento engajado: disparo da campanha + "oi"/"quero aproveitar"/ruído não conta.
      if (!state.warnedAt && !(await conversationEngaged(row))) continue;
      if (!state.warnedAt) {
        if (!isWindowOpen(row.lastInboundAt)) continue;
        state.warnedAt = new Date(now).toISOString();
        await saveMenuState(row.id, state);
        await sendAutomaticMessage(row, settings.silenceAskText.replaceAll("{minutos}", String(settings.silenceCloseMinutes)));
        summary.silenceAsked += 1;
      } else if (now - new Date(state.warnedAt).getTime() >= settings.silenceCloseMinutes * MINUTE) {
        // Sem pesquisa: aqui o cliente só passou pelo menu, nenhum atendente falou com ele.
        await closeConversation(row, null, "Conversa encerrada por falta de resposta", silenceFarewell(settings));
        summary.silenceClosed += 1;
      }
    }
  });

  await block("pesquisa", async () => {
    summary.surveysExpired = await expireSurveys(now);
  });

  // Mensagem automática que caiu por queda de conexão volta a sair sozinha por alguns minutos.
  await block("reenvio", async () => {
    const rows = await prisma.chatMessage.findMany({
      where: {
        author: "bot",
        delivery: "failed",
        failureReason: { startsWith: "Não foi possível conectar" },
        createdAt: { gte: new Date(now - RESEND_WINDOW_MINUTES * MINUTE), lte: new Date(now - MINUTE) },
      },
      include: { conversation: true },
      orderBy: { createdAt: "asc" },
      take: 20,
    });
    for (const row of rows) {
      if (!isConnectFailure(row.failureReason) || !isWindowOpen(row.conversation.lastInboundAt)) continue;
      const sent = isSurveyMessage(row.text)
        ? await resendSurvey(row, row.conversation)
        : await resendAutomatic(row.id, () => sendText(row.conversation.phone, row.text));
      if (sent?.delivery === "sent") summary.resent += 1;
    }
  });

  await block("faxina", async () => {
    if (!(await firstDispatch(`cleanup:${brDay(new Date(now))}`))) return;
    const removed = await prisma.chatDispatch.deleteMany({ where: { createdAt: { lt: new Date(now - DISPATCH_RETENTION_DAYS * 24 * 60 * MINUTE) } } });
    summary.cleaned = removed.count;
  });

  // Mídia recebida que não baixou (rede, certificado do firewall): tenta de novo enquanto a Meta ainda guarda o arquivo.
  await block("mídias pendentes", async () => {
    const rows = await prisma.chatMessage.findMany({
      where: { author: "customer", attachment: { equals: Prisma.DbNull }, metaMedia: { not: Prisma.DbNull }, createdAt: { gte: new Date(now - MEDIA_RETRY_HOURS * 60 * MINUTE) } },
      orderBy: { createdAt: "desc" },
      take: MEDIA_RETRY_BATCH,
      select: { id: true, text: true, metaMedia: true },
    });
    for (const row of rows) {
      if (!(row.metaMedia as { id?: string } | null)?.id) continue;
      if (await retryInboundMedia(row)) summary.mediaRecovered += 1;
    }
  });

  // Venda faturada no ERP depois da abertura da oportunidade → card em "Ganho" (no máximo 1x por hora).
  await block("oportunidades ganhas", async () => {
    await syncWonOpportunities(now);
  });

  // Automações (/automacoes): retoma delays vencidos (reserva atômica, sem duplicar entre Blue/Green) e, de hora
  // em hora, dispara o gatilho "Cliente inativo por tempo".
  await block("automações", async () => {
    // Automações padrão do Lead Score: criadas uma única vez (editáveis em /automacoes).
    await ensureScoringFlows();
    // Matriz RFV-P: recálculo diário a partir das 6h (em segundo plano, numa réplica só).
    await scheduleDailyRfvp(new Date(now)).catch((error: unknown) => console.error("[rfvp] agendamento:", error));
    // Vendas do VMSet atribuídas aos nós por onde o cliente passou (badges do canvas), a cada 5 min.
    await attributeSales(new Date(now)).catch((error: unknown) => console.error("[automacoes] atribuição de vendas:", error));
    summary.automationsResumed = await resumeDueExecutions(new Date(now));
    summary.automationsInactive = await checkInactiveTriggers(new Date(now));
  });

  // Gatilhos do ERP VMSet (vendas, financeiro, OS, aniversário, sem comprar): deduplicados por fluxo + nó + evento.
  await block("automações ERP", async () => {
    summary.automationsErp = await checkErpTriggers(new Date(now));
  });

  // "Cancelar automaticamente se o cliente converter": compra (espelho do VMSet) e título pago (API do VMSet).
  await block("automações conversão", async () => {
    summary.automationsConverted = await checkConversions(new Date(now));
  });

  return summary;
}
