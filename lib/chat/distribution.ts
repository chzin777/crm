import "server-only";
import { prisma } from "@/lib/prisma";
import { effectivePresence } from "@/lib/chat/presence-status";
import { addSystemMessage } from "@/lib/chat/conversation";
import { pickRoundRobin } from "@/lib/chat/queue-rules";

type Candidate = { id: string; name: string; store: string | null; stores: string[]; load: number; capacity: number };

/** Atendentes da fila que podem receber agora: online, sem pausa e com vaga (capacidade > carga). Ordem da fila. */
async function eligibleMembers(queueId: string): Promise<Candidate[]> {
  const members = await prisma.chatQueueMember.findMany({
    where: { queueId, user: { banned: false } },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { user: { select: { id: true, name: true, chatAgent: { select: { lastSeenAt: true, lastActivityAt: true, paused: true, presenceStatus: true, capacity: true, store: true, stores: true } } } } },
  });
  const ids = members.map((member) => member.user.id);
  if (ids.length === 0) return [];
  const loads = await prisma.chatConversation.groupBy({ by: ["assigneeId"], where: { assigneeId: { in: ids }, closedAt: null }, _count: { _all: true } });
  const load = new Map(loads.map((row) => [row.assigneeId, row._count._all]));
  return members.flatMap(({ user }) => {
    const agent = user.chatAgent;
    // Só quem está Online (escolha do operador) e com o CRM aberto; Ausente/Offline ficam fora do rodízio.
    if (!agent || effectivePresence(agent) !== "ONLINE") return [];
    const current = load.get(user.id) ?? 0;
    if (agent.capacity <= current) return [];
    return [{ id: user.id, name: user.name, store: agent.store?.trim() || null, stores: agent.stores.map((code) => code.trim()).filter(Boolean), load: current, capacity: agent.capacity }];
  });
}

/** Próxima posição do rodízio da fila (atômica entre as duas cores do blue/green). */
async function nextCursor(queueId: string) {
  const rows = await prisma.$queryRaw<{ rrCursor: number }[]>`
    UPDATE "ChatQueue" SET "rrCursor" = "rrCursor" + 1 WHERE "id" = ${queueId} RETURNING "rrCursor"`;
  return (rows[0]?.rrCursor ?? 1) - 1;
}

/**
 * Atribui as conversas esperando nas filas em modo rodízio. Chamado depois de cada mensagem recebida e pelo
 * relógio a cada minuto (pega quem entrou na fila pela IA, menu ou transferência). A gravação é condicional
 * (só se ainda estiver sem dono), então duas execuções simultâneas nunca atribuem a mesma conversa duas vezes.
 */
export async function distributeWaiting() {
  const queues = await prisma.chatQueue.findMany({ where: { distribution: "round_robin", archivedAt: null }, select: { id: true, name: true, storePriority: true } });
  let assigned = 0;
  for (const queue of queues) {
    const waiting = await prisma.chatConversation.findMany({
      where: { queueId: queue.id, status: "waiting", assigneeId: null, closedAt: null },
      orderBy: { waitingSince: { sort: "asc", nulls: "last" } },
      take: 50,
      select: { id: true, contact: { select: { store: true } } },
    });
    if (waiting.length === 0) continue;
    const pool = await eligibleMembers(queue.id);
    for (const conversation of waiting) {
      const free = pool.filter((member) => member.load < member.capacity);
      if (free.length === 0) break;
      const choice = pickRoundRobin(free, await nextCursor(queue.id), conversation.contact.store?.trim() || null, queue.storePriority);
      if (!choice) break;
      const updated = await prisma.chatConversation.updateMany({
        where: { id: conversation.id, assigneeId: null, closedAt: null, status: "waiting" },
        data: { assigneeId: choice.pick.id, status: "in_progress", waitingSince: null },
      });
      if (updated.count === 0) continue;
      choice.pick.load += 1;
      assigned += 1;
      await addSystemMessage(conversation.id, `Rodízio da fila ${queue.name} atribuiu a ${choice.pick.name}${choice.byStore ? " (loja do cliente)" : ""}`);
      await prisma.chatNotification.create({
        data: { userId: choice.pick.id, conversationId: conversation.id, type: "transfer", title: "Nova conversa para você", detail: `Rodízio da fila ${queue.name}`, href: `/chat?c=${conversation.id}` },
      });
    }
  }
  return assigned;
}
