import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  if (!(await requireApiSession())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const url = new URL(request.url);
  const contactId = url.searchParams.get("contactId");
  if (!contactId) return NextResponse.json({ error: "contactId obrigatório" }, { status: 400 });

  const contact = await prisma.contact.findUnique({ where: { id: contactId }, select: { id: true, phone: true } });
  if (!contact?.phone) return NextResponse.json([]);

  // Mensagens recebidas
  const inbound = await prisma.inboundMessage.findMany({
    where: { contactId },
    orderBy: { receivedAt: "asc" },
    select: { id: true, text: true, mediaType: true, receivedAt: true, whatsappMsgId: true },
  });

  // Mensagens enviadas (campanhas)
  const outbound = await prisma.campaignMessage.findMany({
    where: { contactId },
    orderBy: { createdAt: "asc" },
    select: { id: true, status: true, sentAt: true, deliveredAt: true, readAt: true, repliedAt: true, createdAt: true, whatsappMsgId: true },
  });

  // Unifica em timeline única
  type TimelineItem = {
    id: string;
    direction: "in" | "out";
    text: string | null;
    mediaType: string | null;
    timestamp: Date;
    status: string | null;
  };

  const timeline: TimelineItem[] = [
    ...inbound.map((m): TimelineItem => ({
      id: m.id,
      direction: "in",
      text: m.text ?? (m.mediaType ? `[${m.mediaType}]` : null),
      mediaType: m.mediaType,
      timestamp: m.receivedAt,
      status: null,
    })),
    ...outbound.map((m): TimelineItem => ({
      id: m.id,
      direction: "out",
      text: "[mensagem enviada]",
      mediaType: null,
      timestamp: m.sentAt ?? m.createdAt,
      status: m.status,
    })),
  ];

  timeline.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  return NextResponse.json(timeline);
}