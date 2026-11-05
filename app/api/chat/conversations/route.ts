import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  if (!(await requireApiSession())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const url = new URL(request.url);
  const search = (url.searchParams.get("search") ?? "").trim().toLowerCase();
  const filter = url.searchParams.get("filter") ?? "all"; // all | unread | attending

  // Busca contatos que possuem mensagens (inbound ou outbound)
  const contacts = await prisma.contact.findMany({
    where: {
      phone: { not: null },
      ...(search ? {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { phone: { contains: search, mode: "insensitive" } },
        ],
      } : {}),
    },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      segment: true,
      category: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  // Para cada contato, busca a última mensagem (inbound ou campaign)
  const conversations = await Promise.all(
    contacts.map(async (contact) => {
      if (!contact.phone) return null;

      // Última mensagem recebida
      const lastInbound = await prisma.inboundMessage.findFirst({
        where: { contactId: contact.id },
        orderBy: { receivedAt: "desc" },
        select: { text: true, mediaType: true, receivedAt: true, whatsappMsgId: true },
      });

      // Última mensagem enviada (campaign)
      const lastSent = await prisma.campaignMessage.findFirst({
        where: { contactId: contact.id },
        orderBy: { createdAt: "desc" },
        select: { status: true, sentAt: true, deliveredAt: true, readAt: true, repliedAt: true, createdAt: true },
      });

      // Determina a última mensagem entre inbound e sent
      const inboundTime = lastInbound?.receivedAt?.getTime() ?? 0;
      const sentTime = lastSent?.createdAt?.getTime() ?? 0;

      let lastMessageText: string | null = null;
      let lastMessageTime: Date | null = null;
      let lastMessageDirection: "in" | "out" = "in";
      let lastMessageStatus: string | null = null;
      let lastMessageMediaType: string | null = null;

      if (inboundTime >= sentTime && lastInbound) {
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

      if (!lastMessageTime) return null;

      // Conta mensagens não lidas (inbound sem repliedAt correspondente)
      const unreadCount = await prisma.inboundMessage.count({
        where: {
          contactId: contact.id,
          receivedAt: { gt: lastSent?.repliedAt ?? new Date(0) },
        },
      });

      // Filtro de status
      if (filter === "unread" && unreadCount === 0) return null;
      if (filter === "attending" && !lastSent) return null;

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
        unreadCount,
      };
    })
  );

  // Remove nulos e ordena por data da última mensagem
  const result = conversations
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort((a, b) => b.lastMessageTime.getTime() - a.lastMessageTime.getTime());

  return NextResponse.json(result);
}