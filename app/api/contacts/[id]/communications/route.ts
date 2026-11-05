import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });

  const { id } = await context.params;

  const [sentMessages, inboundMessages, contact] = await Promise.all([
    prisma.campaignMessage.findMany({
      where: { contactId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        status: true,
        sentAt: true,
        deliveredAt: true,
        readAt: true,
        repliedAt: true,
        failedAt: true,
        failureReason: true,
        createdAt: true,
      },
    }),
    prisma.inboundMessage.findMany({
      where: { contactId: id },
      orderBy: { receivedAt: "desc" },
      take: 20,
      select: {
        id: true,
        text: true,
        mediaType: true,
        receivedAt: true,
      },
    }),
    prisma.contact.findUnique({
      where: { id },
      select: { phone: true, email: true },
    }),
  ]);

  return Response.json({
    data: {
      whatsapp: sentMessages.map((msg) => ({
        id: msg.id,
        status: msg.status,
        sentAt: msg.sentAt?.toISOString() ?? null,
        deliveredAt: msg.deliveredAt?.toISOString() ?? null,
        readAt: msg.readAt?.toISOString() ?? null,
        repliedAt: msg.repliedAt?.toISOString() ?? null,
        failedAt: msg.failedAt?.toISOString() ?? null,
        failureReason: msg.failureReason ?? null,
        createdAt: msg.createdAt.toISOString(),
      })),
      inbound: inboundMessages.map((msg) => ({
        id: msg.id,
        text: msg.text ?? "",
        mediaType: msg.mediaType ?? null,
        receivedAt: msg.receivedAt.toISOString(),
      })),
      emails: [] as { id: string; subject: string; status: string; sentAt: string | null }[],
      contactPhone: contact?.phone ?? "",
      contactEmail: contact?.email ?? "",
    },
  });
}