import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { brDay } from "@/lib/br-time";
import { retryInboundMedia } from "@/lib/chat/inbound";
import { conversationEngaged, customerInteracted } from "@/lib/chat/noise-db";
import { planInactivity } from "@/lib/chat/inactivity";
import { resolveChatCapabilities } from "@/lib/permissions";
import { closeConversation } from "@/lib/chat/actions";
import { firstDispatch, isWindowOpen, readChatSettings } from "@/lib/chat/conversation";
import { readMenuState, saveMenuState, sendMenu } from "@/lib/chat/menu";
import { expireSurveys, isSurveyMessage, resendSurvey } from "@/lib/chat/nps";
import { isConnectFailure, sendText } from "@/lib/meta-whatsapp";
import { silenceFarewell } from "@/lib/chat/settings";
import { ChatRuleError, resendAutomatic, sendAutomaticMessage } from "@/lib/chat/outbound";
import { dispatchScheduledMessages, notifyDueFollowUps } from "@/lib/chat/operations";
import { planQueuePositions } from "@/lib/chat/queue-rules";
import { listDispatchJobs, runCampaignFollowUps } from "@/lib/campaign-dispatch";
import { distributeWaiting } from "@/lib/chat/distribution";
import { penalizeUnreadCampaigns } from "@/lib/engagement";
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
// Avisos/despedidas de inatividade em sequência: rajada de dezenas de envios em segundos faz a Meta
// recusar parte deles com (#131000) Something went wrong.
const SILENCE_SEND_GAP_MS = 1_500;
// Erro genérico e passageiro da Meta: a mensagem automática é reenviada uma vez pelo relógio.
const isTransientMetaFailure = (reason: string | null) => !!reason && reason.includes("(#131000)");
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
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

  // A posição é guardada só para uso interno (painel de /filas e destaque no /chat).
  // Nenhuma mensagem é enviada ao cliente quando a posição muda.
  await block("posição na fila", async () => {
    // Conversas em atendimento pela IA ficam de fora: regra em lib/chat/queue-rules.
    const rows = await prisma.chatConversation.findMany({
      where: { status: "waiting", closedAt: null, queueId: { not: null } },
      orderBy: { waitingSince: "asc" },
      include: { queue: { select: { name: true } } },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const updates = planQueuePositions(
      rows.map((row) => ({ ...row, queueName: row.queue?.name ?? null })),
      { now: new Date(now) },
    );
    for (const update of updates) {
      const row = byId.get(update.id)!;
      const state = readMenuState(row.menuState);
      state.notifiedPosition = update.position;
      state.positionSince = update.positionSince;
      await saveMenuState(row.id, state);
      summary.positions += 1;
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
    const askMs = settings.silenceAskMinutes * MINUTE;
    const closeMs = settings.silenceCloseMinutes * MINUTE;
    // Menu/IA (status bot, sem dono) e atendimentos com operador. Cliente esperando na fila (waiting sem dono)
    // fica de fora: quem espera é ele. A regra de quem escreveu por último está em lib/chat/inactivity.
    const rows = await prisma.chatConversation.findMany({
      where: {
        closedAt: null,
        lastMessageAt: { lte: new Date(now - Math.min(askMs, closeMs)) },
        OR: [{ status: "bot", assigneeId: null }, { assigneeId: { not: null } }, { status: "in_progress" }],
      },
    });
    for (const row of rows) {
      const last = await prisma.chatMessage.findFirst({
        where: { conversationId: row.id, internal: false, author: { not: "system" } },
        orderBy: { createdAt: "desc" },
        select: { author: true, createdAt: true },
      });
      const state = readMenuState(row.menuState);
      if (row.status === "bot" && !row.assigneeId && state.closeAt) continue;
      const action = planInactivity({
        lastAuthor: last ? (last.author as "customer" | "agent" | "bot") : null,
        lastAt: last?.createdAt ?? null,
        warnedAt: state.warnedAt ? new Date(state.warnedAt) : null,
        now: new Date(now),
        askMs,
        closeMs,
      });
      if (action === "none") continue;
      if (action === "reset") {
        state.warnedAt = null;
        await saveMenuState(row.id, state);
        continue;
      }
      if (action === "warn") {
        // Só com interação real do cliente: conversa que tem apenas o disparo da campanha não recebe aviso.
        if (!isWindowOpen(row.lastInboundAt) || !(await customerInteracted(row.id))) continue;
        // Menu/IA: "oi"/"quero aproveitar"/ruído depois do disparo não conta como atendimento engajado.
        if (!row.assigneeId && row.status !== "in_progress" && !(await conversationEngaged(row))) continue;
        // Trava no banco: duas execuções do relógio ao mesmo tempo nunca mandam o aviso duas vezes para o mesmo silêncio.
        if (!(await firstDispatch(`silence-warn:${row.id}:${last!.createdAt.toISOString()}`))) continue;
        await sendAutomaticMessage(row, settings.silenceAskText.replaceAll("{minutos}", String(settings.silenceCloseMinutes)));
        // Gravado depois do envio: o próprio aviso não conta como "equipe escreveu depois do aviso".
        state.warnedAt = new Date().toISOString();
        await saveMenuState(row.id, state);
        summary.silenceAsked += 1;
        await sleep(SILENCE_SEND_GAP_MS);
        continue;
      }
      if (!(await firstDispatch(`silence-close:${row.id}:${state.warnedAt}`))) continue;
      state.warnedAt = null;
      await saveMenuState(row.id, state);
      // Sem pesquisa: o cliente parou de responder.
      try {
        await closeConversation(row, null, "Conversa encerrada por inatividade do cliente", silenceFarewell(settings));
        summary.silenceClosed += 1;
        await sleep(SILENCE_SEND_GAP_MS);
      } catch (error) {
        // Já encerrada por outra execução ou pelo atendente: segue para as próximas.
        if (!(error instanceof ChatRuleError)) throw error;
      }
    }
  });

  // Disparo de campanha interrompido por deploy/reinício volta sozinho (sem depender de alguém abrir /campanhas).
  // A trava de 3 min sem progresso evita retomar em paralelo com a outra cor do blue/green.
  await block("disparos de campanha", async () => {
    await listDispatchJobs();
  });

  // Filas em rodízio: quem entrou na fila pela IA, menu ou transferência é atribuído sem esperar nova mensagem.
  await block("rodízio das filas", async () => {
    await distributeWaiting();
  });

  // Score de engajamento: −5 por campanha que passou 72 h sem leitura nem resposta.
  await block("score de engajamento", async () => {
    await penalizeUnreadCampaigns(new Date(now));
  });

  // Follow-up das campanhas para quem não respondeu nem comprou (auto-cancelado por resposta ou venda no VMSet).
  await block("follow-up de campanhas", async () => {
    const result = await runCampaignFollowUps(new Date(now));
    if (result.sent || result.cancelled || result.failed) console.log(`[campaign-followup] ${result.sent} enviados, ${result.cancelled} cancelados, ${result.failed} falhas`);
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
        OR: [{ failureReason: { startsWith: "Não foi possível conectar" } }, { failureReason: { contains: "(#131000)" } }],
        createdAt: { gte: new Date(now - RESEND_WINDOW_MINUTES * MINUTE), lte: new Date(now - MINUTE) },
      },
      include: { conversation: true },
      orderBy: { createdAt: "asc" },
      take: 60,
    });
    for (const row of rows) {
      if (!isWindowOpen(row.conversation.lastInboundAt)) continue;
      if (isTransientMetaFailure(row.failureReason)) {
        // Uma única nova tentativa por mensagem (nunca fica reenviando em loop).
        if (!(await firstDispatch(`resend-131000:${row.id}`))) continue;
      } else if (!isConnectFailure(row.failureReason)) continue;
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
