import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveAccess } from "@/lib/permissions";
import { chatError, requireChatActor } from "@/lib/chat/access";
import { openCount } from "@/lib/chat/actions";
import { addAudit } from "@/lib/chat/conversation";
import { isOnline } from "@/lib/chat/team";

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

  return NextResponse.json({
    data: users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      hasChatAccess: resolveAccess(user.role, user.roleRef?.permissions).chat,
      capacity: user.chatAgent?.capacity ?? 0,
      paused: user.chatAgent?.paused ?? false,
      online: isOnline(user.chatAgent?.lastSeenAt),
      open: loadByUser.get(user.id) ?? 0,
      queueIds: user.chatQueues.map((item) => item.queueId),
    })),
  });
}

const patch = z.object({ userId: z.string().min(1), capacity: z.number().int().min(0).max(200).optional(), paused: z.boolean().optional() });

export async function PATCH(request: Request) {
  const guard = await requireChatActor("chat.queues", ["filas"]);
  if (guard.response) return guard.response;
  const parsed = patch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return chatError("Dados inválidos.", 400);
  const { userId, ...fields } = parsed.data;

  if (fields.capacity !== undefined) {
    const open = await openCount(userId);
    if (fields.capacity < open) return chatError(`Esta pessoa tem ${open} conversa(s) aberta(s); a capacidade não pode ficar abaixo disso.`, 409);
  }
  await prisma.chatAgent.upsert({ where: { userId }, create: { userId, ...fields }, update: fields });
  await addAudit({ userId: guard.actor.id, action: "agent.update", targetId: userId, after: fields });
  return NextResponse.json({ ok: true });
}
