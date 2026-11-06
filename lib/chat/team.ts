import "server-only";
import { prisma } from "@/lib/prisma";

const ONLINE_MS = 2 * 60 * 1000;

export const isOnline = (lastSeenAt: Date | null | undefined) => !!lastSeenAt && Date.now() - lastSeenAt.getTime() < ONLINE_MS;

/** Filas com membros, carga e espera atual: base do painel e do modal de transferência. */
export async function loadQueueBoard() {
  const [queues, loads, waiting] = await Promise.all([
    prisma.chatQueue.findMany({
      where: { archivedAt: null },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      include: { members: { orderBy: { order: "asc" }, include: { user: { select: { id: true, name: true, chatAgent: true } } } } },
    }),
    prisma.chatConversation.groupBy({ by: ["assigneeId"], where: { assigneeId: { not: null }, closedAt: null }, _count: { _all: true } }),
    prisma.chatConversation.groupBy({ by: ["queueId"], where: { status: "waiting", closedAt: null }, _count: { _all: true }, _min: { waitingSince: true } }),
  ]);

  const loadByUser = new Map(loads.map((row) => [row.assigneeId, row._count._all]));
  const waitingByQueue = new Map(waiting.map((row) => [row.queueId, row]));

  return queues.map((queue) => ({
    id: queue.id,
    name: queue.name,
    description: queue.description,
    color: queue.color,
    hours: queue.hours,
    firstResponseSlaMin: queue.firstResponseSlaMin,
    order: queue.order,
    waiting: waitingByQueue.get(queue.id)?._count._all ?? 0,
    oldestWaiting: waitingByQueue.get(queue.id)?._min.waitingSince ?? null,
    members: queue.members.map((member) => ({
      userId: member.user.id,
      name: member.user.name,
      online: isOnline(member.user.chatAgent?.lastSeenAt),
      open: loadByUser.get(member.user.id) ?? 0,
      capacity: member.user.chatAgent?.capacity ?? 0,
      paused: member.user.chatAgent?.paused ?? false,
    })),
  }));
}
