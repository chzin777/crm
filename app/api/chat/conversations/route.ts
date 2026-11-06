import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { requireApiSession } from "@/lib/api-auth";
import { hasInboundSchema } from "@/lib/chat-inbound";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 50;

type Activity = { lastAt: Date; unreadCount: number; hasSent: boolean };

type ContactRow = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  segment: string | null;
  category: string;
};

function searchCondition(token: string) {
  const like = `%${token.replace(/[\\%_]/g, "\\$&")}%`;
  const digits = token.replace(/\D/g, "").replace(/^55(?=\d{10})/, "");
  return digits
    ? Prisma.sql`(c.name ILIKE ${like} OR c.phone LIKE ${`%${digits}%`})`
    : Prisma.sql`c.name ILIKE ${like}`;
}

// Última atividade de todos os contatos com mensagens, usada para ordenar e filtrar a base.
async function loadActivity(hasInbound: boolean) {
  const activity = new Map<string, Activity>();

  const sent = await prisma.campaignMessage.groupBy({
    by: ["contactId"],
    where: { contactId: { not: null } },
    _max: { createdAt: true },
  });
  for (const row of sent) {
    if (row.contactId && row._max.createdAt) {
      activity.set(row.contactId, { lastAt: row._max.createdAt, unreadCount: 0, hasSent: true });
    }
  }

  if (!hasInbound) return activity;

  // Não lidas: mensagens recebidas depois do repliedAt da última mensagem enviada ao contato.
  const inbound = await prisma.$queryRaw<Array<{ contactId: string; lastAt: Date; unreadCount: bigint }>>`
    SELECT
      i."contactId" AS "contactId",
      MAX(i."receivedAt") AS "lastAt",
      COUNT(*) FILTER (WHERE i."receivedAt" > COALESCE(s."repliedAt", 'epoch'::timestamp)) AS "unreadCount"
    FROM "InboundMessage" i
    LEFT JOIN (
      SELECT DISTINCT ON ("contactId") "contactId", "repliedAt"
      FROM "CampaignMessage"
      ORDER BY "contactId", "createdAt" DESC
    ) s ON s."contactId" = i."contactId"
    WHERE i."contactId" IS NOT NULL
    GROUP BY i."contactId"
  `;
  for (const row of inbound) {
    const current = activity.get(row.contactId);
    activity.set(row.contactId, {
      lastAt: current && current.lastAt > row.lastAt ? current.lastAt : row.lastAt,
      unreadCount: Number(row.unreadCount),
      hasSent: current?.hasSent ?? false,
    });
  }

  return activity;
}

export async function GET(request: Request) {
  if (!(await requireApiSession())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const url = new URL(request.url);
  const tokens = (url.searchParams.get("search") ?? "").trim().split(/\s+/).filter(Boolean);
  const filter = url.searchParams.get("filter") ?? "all"; // all | unread | attending
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);

  const hasInbound = await hasInboundSchema();
  const activity = await loadActivity(hasInbound);

  const ranked = [...activity.entries()]
    .filter(([, item]) => {
      if (filter === "unread") return item.unreadCount > 0;
      if (filter === "attending") return item.hasSent;
      return true;
    })
    .map(([id, item]) => ({ id, at: item.lastAt.toISOString() }));

  const conditions = [
    Prisma.sql`c.phone IS NOT NULL`,
    Prisma.sql`c.phone <> ''`,
    ...tokens.map(searchCondition),
    ...(filter === "all" ? [] : [Prisma.sql`lm.id IS NOT NULL`]),
  ];

  // Contatos com mensagens primeiro (mais recentes no topo); os demais em ordem alfabética.
  const rows = await prisma.$queryRaw<ContactRow[]>(Prisma.sql`
    SELECT c.id, c.name, c.phone, c.email, c.segment, c.category
    FROM "Contact" c
    LEFT JOIN jsonb_to_recordset(${JSON.stringify(ranked)}::jsonb) AS lm(id text, at timestamptz) ON lm.id = c.id
    WHERE ${Prisma.join(conditions, " AND ")}
    ORDER BY lm.at DESC NULLS LAST, c.name ASC, c.id ASC
    LIMIT ${PAGE_SIZE + 1} OFFSET ${offset}
  `);

  const hasMore = rows.length > PAGE_SIZE;
  const contacts = rows.slice(0, PAGE_SIZE);
  const activeIds = contacts.filter((contact) => activity.has(contact.id)).map((contact) => contact.id);

  const [lastInbounds, lastSents] = await Promise.all([
    hasInbound && activeIds.length > 0
      ? prisma.inboundMessage.findMany({
          where: { contactId: { in: activeIds } },
          distinct: ["contactId"],
          orderBy: [{ contactId: "asc" }, { receivedAt: "desc" }],
          select: { contactId: true, text: true, mediaType: true, receivedAt: true },
        })
      : [],
    activeIds.length > 0
      ? prisma.campaignMessage.findMany({
          where: { contactId: { in: activeIds } },
          distinct: ["contactId"],
          orderBy: [{ contactId: "asc" }, { createdAt: "desc" }],
          select: { contactId: true, status: true, sentAt: true, createdAt: true },
        })
      : [],
  ]);

  const inboundByContact = new Map(lastInbounds.map((message) => [message.contactId, message]));
  const sentByContact = new Map(lastSents.map((message) => [message.contactId, message]));

  const items = contacts.map((contact) => {
    const lastInbound = inboundByContact.get(contact.id);
    const lastSent = sentByContact.get(contact.id);
    const inboundTime = lastInbound?.receivedAt.getTime() ?? 0;
    const sentTime = lastSent?.createdAt.getTime() ?? 0;

    let lastMessageText: string | null = null;
    let lastMessageTime: Date | null = null;
    let lastMessageDirection: "in" | "out" | null = null;
    let lastMessageStatus: string | null = null;
    let lastMessageMediaType: string | null = null;

    if (lastInbound && inboundTime >= sentTime) {
      lastMessageText = lastInbound.text ?? (lastInbound.mediaType ? `[${lastInbound.mediaType}]` : null);
      lastMessageTime = lastInbound.receivedAt;
      lastMessageDirection = "in";
      lastMessageMediaType = lastInbound.mediaType;
    } else if (lastSent) {
      lastMessageText = "[mensagem enviada]";
      lastMessageTime = lastSent.sentAt ?? lastSent.createdAt;
      lastMessageDirection = "out";
      lastMessageStatus = lastSent.status;
    }

    return {
      contactId: contact.id,
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      segment: contact.segment,
      category: contact.category,
      lastMessageText,
      lastMessageTime,
      lastMessageDirection,
      lastMessageStatus,
      lastMessageMediaType,
      unreadCount: activity.get(contact.id)?.unreadCount ?? 0,
    };
  });

  return NextResponse.json({ items, hasMore });
}
