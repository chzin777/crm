import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireChatActor, scopeWhere } from "@/lib/chat/access";

const SEEN_INTERVAL_MS = 60_000;

export async function GET() {
  const guard = await requireChatActor();
  if (guard.response) return guard.response;
  const { actor } = guard;

  const where = { AND: [{ closedAt: null }, scopeWhere(actor)] };
  const [summary, unread, notifications, agent] = await Promise.all([
    prisma.chatConversation.aggregate({ where, _count: { _all: true }, _max: { updatedAt: true, lastMessageAt: true } }),
    prisma.chatConversation.aggregate({ where, _sum: { unreadCount: true } }),
    prisma.chatNotification.count({ where: { userId: actor.id, readAt: null } }),
    prisma.chatAgent.findUnique({ where: { userId: actor.id }, select: { lastSeenAt: true } }),
  ]);

  if (!agent?.lastSeenAt || Date.now() - agent.lastSeenAt.getTime() >= SEEN_INTERVAL_MS) {
    const now = new Date();
    await prisma.chatAgent.upsert({ where: { userId: actor.id }, create: { userId: actor.id, lastSeenAt: now }, update: { lastSeenAt: now } });
  }

  const open = summary._count._all;
  const mark = [open, summary._max.updatedAt?.toISOString() ?? "", summary._max.lastMessageAt?.toISOString() ?? "", notifications].join("|");

  return NextResponse.json(
    { mark, unread: unread._sum.unreadCount ?? 0, notifications },
    { headers: { "Cache-Control": "no-store" } },
  );
}
