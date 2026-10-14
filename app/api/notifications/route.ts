import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";

export async function GET() {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });

  const [contacts, responses] = await Promise.all([
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
  ]);

  const data = [
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
