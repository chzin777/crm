import "server-only";
import { prisma } from "@/lib/prisma";
import { resolveChatCapabilities } from "@/lib/permissions";
import { closeConversation } from "@/lib/chat/actions";
import { firstDispatch, isWindowOpen, readChatSettings } from "@/lib/chat/conversation";
import { readMenuState, saveMenuState } from "@/lib/chat/menu";
import { composeWithMenu, silenceFarewell } from "@/lib/chat/settings";
import { sendAutomaticMessage } from "@/lib/chat/outbound";

const MINUTE = 60_000;
const PRIORITY_STEP = { low: "normal", normal: "high", high: "urgent", urgent: "urgent" } as const;
const DISPATCH_RETENTION_DAYS = 30;

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
  const summary = { closings: 0, wait3: 0, wait8: 0, positions: 0, queueFull: 0, silenceAsked: 0, silenceClosed: 0, cleaned: 0, errors: [] as string[] };
  const block = async (name: string, action: () => Promise<void>) => {
    try {
      await action();
    } catch (error) {
      summary.errors.push(`${name}: ${error instanceof Error ? error.message : "falhou"}`);
    }
  };

  const settings = await readChatSettings();
  const now = Date.now();

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
      const text = settings.repeatMenu ? composeWithMenu(settings, state.path, [phrase]) : phrase.trim();
      if (text) await sendAutomaticMessage(row, text);
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

  await block("posição na fila", async () => {
    if (!settings.notifyQueuePosition) return;
    const rows = await prisma.chatConversation.findMany({
      where: { status: "waiting", closedAt: null, queueId: { not: null } },
      orderBy: { waitingSince: "asc" },
      include: { queue: { select: { name: true } } },
    });
    const positions = new Map<string, number>();
    for (const row of rows) {
      const position = (positions.get(row.queueId!) ?? 0) + 1;
      positions.set(row.queueId!, position);
      const state = readMenuState(row.menuState);
      const last = state.notifiedPosition ?? null;
      if (last === position) continue;
      state.notifiedPosition = position;
      await saveMenuState(row.id, state);
      if (last !== null && position < last && isWindowOpen(row.lastInboundAt)) {
        await sendAutomaticMessage(row, `Você avançou na fila: agora é o ${position}º da fila ${row.queue?.name ?? ""}. Obrigado por aguardar.`);
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
      const open = await prisma.chatConversation.count({ where: { queueId: queue.id, closedAt: null } });
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
      if (!state.warnedAt) {
        if (!isWindowOpen(row.lastInboundAt)) continue;
        state.warnedAt = new Date(now).toISOString();
        await saveMenuState(row.id, state);
        await sendAutomaticMessage(row, settings.silenceAskText.replaceAll("{minutos}", String(settings.silenceCloseMinutes)));
        summary.silenceAsked += 1;
      } else if (now - new Date(state.warnedAt).getTime() >= settings.silenceCloseMinutes * MINUTE) {
        await closeConversation(row, null, "Conversa encerrada por falta de resposta", silenceFarewell(settings));
        summary.silenceClosed += 1;
      }
    }
  });

  await block("faxina", async () => {
    if (!(await firstDispatch(`cleanup:${new Date(now).toISOString().slice(0, 10)}`))) return;
    const removed = await prisma.chatDispatch.deleteMany({ where: { createdAt: { lt: new Date(now - DISPATCH_RETENTION_DAYS * 24 * 60 * MINUTE) } } });
    summary.cleaned = removed.count;
  });

  return summary;
}
