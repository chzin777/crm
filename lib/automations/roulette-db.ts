import "server-only";
import { prisma } from "@/lib/prisma";
import { isOnline } from "@/lib/chat/team";
import { hoursFor } from "@/lib/chat/operations";
import { isOpenAt } from "@/lib/chat/hours";
import { pickSeller, type DistributeConfig, type SellerCandidate } from "@/lib/automations/nodes";

/** Cursor do rodízio por nó, atômico entre os containers Blue/Green (cada chamada avança 1). */
async function nextCursor(flowId: string, nodeId: string) {
  const rows = await prisma.$queryRaw<{ rrCursor: number }[]>`
    INSERT INTO "AutomationNodeStat" ("flowId", "nodeId", "rrCursor", "updatedAt") VALUES (${flowId}, ${nodeId}, 1, now())
    ON CONFLICT ("flowId", "nodeId") DO UPDATE SET "rrCursor" = "AutomationNodeStat"."rrCursor" + 1, "updatedAt" = now()
    RETURNING "rrCursor"`;
  return (rows[0]?.rrCursor ?? 1) - 1;
}

/** Vendedores do pool (fila ou lista escolhida, na ordem configurada) com online, pausa, carga e capacidade. */
export async function loadSellers(rule: DistributeConfig): Promise<SellerCandidate[]> {
  const ids = rule.pool === "queue"
    ? (await prisma.chatQueueMember.findMany({ where: { queueId: rule.queueId }, orderBy: [{ order: "asc" }, { createdAt: "asc" }], select: { userId: true } })).map((row) => row.userId)
    : rule.userIds;
  if (!ids.length) return [];
  const [users, loads] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids }, banned: false }, select: { id: true, name: true, chatAgent: { select: { lastSeenAt: true, paused: true, capacity: true } } } }),
    prisma.chatConversation.groupBy({ by: ["assigneeId"], where: { assigneeId: { in: ids }, closedAt: null }, _count: { _all: true } }),
  ]);
  const load = new Map(loads.map((row) => [row.assigneeId, row._count._all]));
  const byId = new Map(users.map((user) => [user.id, user]));
  return ids.flatMap((id) => {
    const user = byId.get(id);
    if (!user) return [];
    return [{ id, name: user.name, online: isOnline(user.chatAgent?.lastSeenAt), paused: user.chatAgent?.paused ?? false, load: load.get(id) ?? 0, capacity: user.chatAgent?.capacity ?? 0 }];
  });
}

export type DistributeOutcome = { assigned: false; reason: string } | { assigned: true; seller: SellerCandidate; queueId: string | null; queueName: string | null };

/** Decide o vendedor (sem gravar a atribuição): turno da fila, elegibilidade e rodízio/menor carga. */
export async function chooseSeller(flowId: string, nodeId: string, rule: DistributeConfig, now = new Date()): Promise<DistributeOutcome> {
  const queue = rule.queueId ? await prisma.chatQueue.findFirst({ where: { id: rule.queueId, archivedAt: null }, select: { id: true, name: true } }) : null;
  if (rule.queueId && !queue) return { assigned: false, reason: "Fila / loja da roleta não encontrada." };
  if (rule.respectShift) {
    const hours = await hoursFor(queue?.id ?? null);
    if (hours && !isOpenAt(hours, now)) return { assigned: false, reason: `Fora do horário de atendimento${queue ? ` da fila ${queue.name}` : ""}.` };
  }
  const sellers = await loadSellers(rule);
  if (!sellers.length) return { assigned: false, reason: rule.pool === "queue" ? "A fila não tem vendedores." : "Nenhum vendedor ativo na lista." };
  const cursor = rule.mode === "round_robin" ? await nextCursor(flowId, nodeId) : 0;
  const seller = pickSeller(sellers, rule, cursor);
  if (!seller) return { assigned: false, reason: `Nenhum vendedor disponível (${[rule.onlyOnline ? "online" : "", rule.maxActive ? `até ${rule.maxActive} atendimentos` : "dentro da capacidade"].filter(Boolean).join(", ")}).` };
  return { assigned: true, seller, queueId: queue?.id ?? null, queueName: queue?.name ?? null };
}
