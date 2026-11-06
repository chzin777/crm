import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";

export async function GET() {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });

  const [contacts, responses, chatNotices] = await Promise.all([
    prisma.contact.findMany({
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    }),
    prisma.npsResponse.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { contact: { select: { name: true } } },
    }),
    prisma.chatNotification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  const data = [
    ...chatNotices.map((notice) => ({
      id: `chat-${notice.id}`,
      tipo: "chat" as const,
      titulo: notice.title,
      descricao: notice.detail,
      createdAt: notice.createdAt,
      href: notice.href,
      lida: notice.readAt !== null,
    })),
    ...contacts.map((contact) => ({
      id: `contact-${contact.id}`,
      tipo: "lead" as const,
      titulo: contact.createdAt.getTime() === contact.updatedAt.getTime() ? "Novo contato" : "Contato atualizado",
      descricao: contact.name,
      createdAt: contact.updatedAt,
    })),
    ...responses.map((response) => ({
      id: `nps-${response.id}`,
      tipo: "nps" as const,
      titulo: `Resposta NPS · ${response.surveyKey === "atendimento" ? "Atendimento" : "Produto"}`,
      descricao: `${response.contact?.name ?? "Contato removido"} · Nota ${response.rating}${response.comment ? ` · ${response.comment}` : ""}`,
      createdAt: response.createdAt,
    })),
  ].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()).slice(0, 8);

  return Response.json({ data });
}

/** Abrir a lista dá os avisos do atendimento como lidos. */
export async function PATCH() {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  await prisma.chatNotification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  return Response.json({ ok: true });
}
