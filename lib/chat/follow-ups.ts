import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { FollowUpItem, ScheduledMessageItem } from "@/lib/chat/types";

export const followUpSelect = {
  id: true,
  dueAt: true,
  note: true,
  status: true,
  completedAt: true,
  userId: true,
  user: { select: { name: true } },
} satisfies Prisma.FollowUpSelect;

type FollowUpRow = Prisma.FollowUpGetPayload<{ select: typeof followUpSelect }>;

export function serializeFollowUp(row: FollowUpRow, actorId: string): FollowUpItem {
  return {
    id: row.id,
    dueAt: row.dueAt.toISOString(),
    note: row.note,
    status: row.status,
    completedAt: row.completedAt?.toISOString() ?? null,
    userName: row.user.name,
    mine: row.userId === actorId,
  };
}

export const scheduledSelect = {
  id: true,
  text: true,
  scheduledFor: true,
  status: true,
  failureReason: true,
  user: { select: { name: true } },
} satisfies Prisma.ScheduledMessageSelect;

type ScheduledRow = Prisma.ScheduledMessageGetPayload<{ select: typeof scheduledSelect }>;

export function serializeScheduled(row: ScheduledRow): ScheduledMessageItem {
  return {
    id: row.id,
    text: row.text,
    scheduledFor: row.scheduledFor.toISOString(),
    status: row.status,
    failureReason: row.failureReason,
    userName: row.user.name,
  };
}
