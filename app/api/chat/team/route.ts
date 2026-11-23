import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveAccess } from "@/lib/permissions";
import { chatError, requireChatActor } from "@/lib/chat/access";
import { openCount } from "@/lib/chat/actions";
import { addAudit } from "@/lib/chat/conversation";
import { isOnline } from "@/lib/chat/team";
import { effectivePresence } from "@/lib/chat/presence-status";
import { storeErpCode } from "@/lib/stores";
import { MAX_AGENT_CAPACITY } from "@/lib/chat/types";

export async function GET() {
  const guard = await requireChatActor("chat.queues", ["filas"]);
  if (guard.response) return guard.response;

  const [users, loads] = await Promise.all([
    prisma.user.findMany({
      where: { banned: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true, roleRef: { select: { permissions: true } }, chatAgent: true, chatQueues: { select: { queueId: true } } },
    }),
    prisma.chatConversation.groupBy({ by: ["assigneeId"], where: { assigneeId: { not: null }, closedAt: null }, _count: { _all: true } }),
  ]);
  const loadByUser = new Map(loads.map((row) => [row.assigneeId, row._count._all]));
  // Lojas para o vínculo do atendente (rodízio por loja): código ERP extraído do nome "LJ 13 ...".
  const storeRows = await prisma.store.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { name: true } });
  const stores = storeRows.flatMap((store) => {
    const code = storeErpCode(store.name);
    return code ? [{ code, name: store.name }] : [];
  });

  return NextResponse.json({
    stores,
    data: users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      hasChatAccess: resolveAccess(user.role, user.roleRef?.permissions).chat,
      capacity: user.chatAgent?.capacity ?? 0,
      paused: user.chatAgent?.paused ?? false,
      store: user.chatAgent?.store ?? null,
      stores: user.chatAgent?.stores ?? [],
      presence: effectivePresence(user.chatAgent),
      online: isOnline(user.chatAgent?.lastSeenAt),
      open: loadByUser.get(user.id) ?? 0,
      queueIds: user.chatQueues.map((item) => item.queueId),
    })),
  });
}

// store: código ERP da loja do atendente ("13"), usado no rodízio por loja; null tira o vínculo.
const patch = z.object({ userId: z.string().min(1), capacity: z.number().int().min(0).max(MAX_AGENT_CAPACITY).optional(), paused: z.boolean().optional(), store: z.string().trim().max(20).nullable().optional(), stores: z.array(z.string().trim().min(1).max(20)).max(50).optional() });

export async function PATCH(request: Request) {
  const guard = await requireChatActor("chat.queues", ["filas"]);
  if (guard.response) return guard.response;
  const parsed = patch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const capacityIssue = parsed.error.issues.some((issue) => issue.path[0] === "capacity");
    return chatError(capacityIssue ? `O limite de conversas simultâneas vai de 0 a ${MAX_AGENT_CAPACITY}.` : "Dados inválidos.", 400);
  }
  const { userId, ...fields } = parsed.data;

  if (fields.capacity !== undefined) {
    const open = await openCount(userId);
    if (fields.capacity < open) return chatError(`Esta pessoa tem ${open} conversa(s) aberta(s); a capacidade não pode ficar abaixo disso.`, 409);
  }
  // Pausar/retomar pelo gestor acompanha o status de presença (Ausente / Online); lojas: lista sem repetição.
  const data = {
    ...fields,
    ...(fields.paused !== undefined ? { presenceStatus: fields.paused ? "AWAY" : "ONLINE", awayAuto: false } : {}),
    ...(fields.stores ? { stores: [...new Set(fields.stores)], store: fields.stores[0] ?? null } : {}),
  };
  await prisma.chatAgent.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  await addAudit({ userId: guard.actor.id, action: "agent.update", targetId: userId, after: fields });
  return NextResponse.json({ ok: true });
}
