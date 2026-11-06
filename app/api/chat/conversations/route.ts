import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireChatActor, scopeWhere, type ChatActor } from "@/lib/chat/access";
import { conversationInclude, serializeConversation } from "@/lib/chat/serialize";

const PAGE_SIZE = 40;
const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
const OPEN: Prisma.ChatConversationWhereInput = { closedAt: null };

function tabWhere(tab: string, actor: ChatActor): Prisma.ChatConversationWhereInput {
  if (tab === "queue") return { status: "waiting", closedAt: null };
  if (tab === "mine") return { assigneeId: actor.id, ...OPEN };
  if (tab === "closed") return { status: "closed" };
  return OPEN;
}

function searchWhere(search: string): Prisma.ChatConversationWhereInput[] {
  return search.split(/\s+/).filter(Boolean).map((token) => {
    const digits = token.replace(/\D/g, "").replace(/^55(?=\d{10})/, "");
    return {
      OR: [
        { contact: { name: { contains: token, mode: "insensitive" } } },
        { subject: { contains: token, mode: "insensitive" } },
        { tags: { has: token } },
        { messages: { some: { internal: false, text: { contains: token, mode: "insensitive" } } } },
        ...(digits ? [{ phone: { contains: digits } }] : []),
      ],
    };
  });
}

export async function GET(request: Request) {
  const guard = await requireChatActor();
  if (guard.response) return guard.response;
  const { actor } = guard;

  const url = new URL(request.url);
  const tab = url.searchParams.get("tab") ?? "queue";
  const queueId = url.searchParams.get("queueId");
  const priority = PRIORITIES.find((item) => item === url.searchParams.get("priority"));
  const search = (url.searchParams.get("search") ?? "").trim();
  const offset = Math.max(0, Number(url.searchParams.get("cursor")) || 0);

  const filters: Prisma.ChatConversationWhereInput[] = [
    scopeWhere(actor),
    ...(queueId ? [{ queueId }] : []),
    ...(priority ? [{ priority }] : []),
    ...searchWhere(search),
  ];

  const orderBy: Prisma.ChatConversationOrderByWithRelationInput[] = tab === "closed"
    ? [{ closedAt: "desc" }]
    : [{ waitingSince: { sort: "asc", nulls: "last" } }, { lastMessageAt: { sort: "desc", nulls: "last" } }];

  const [rows, queue, mine, all, closed] = await Promise.all([
    prisma.chatConversation.findMany({
      where: { AND: [tabWhere(tab, actor), ...filters] },
      include: conversationInclude,
      orderBy: [...orderBy, { id: "asc" }],
      skip: offset,
      take: PAGE_SIZE + 1,
    }),
    prisma.chatConversation.count({ where: { AND: [tabWhere("queue", actor), ...filters] } }),
    prisma.chatConversation.count({ where: { AND: [tabWhere("mine", actor), ...filters] } }),
    prisma.chatConversation.count({ where: { AND: [tabWhere("all", actor), ...filters] } }),
    prisma.chatConversation.count({ where: { AND: [tabWhere("closed", actor), ...filters] } }),
  ]);

  return NextResponse.json({
    items: rows.slice(0, PAGE_SIZE).map(serializeConversation),
    nextCursor: rows.length > PAGE_SIZE ? offset + PAGE_SIZE : null,
    counts: { queue, mine, all, closed },
  });
}
