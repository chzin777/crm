import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/api-auth";
import { createTrackedLink, shortUrl } from "@/lib/tracked-links";

/** Links rastreados gerados (mais recentes), com cliques e contato. */
export async function GET() {
  const guard = await requireModule("pontuacao", "campanhas", "automacoes");
  if (guard.response) return guard.response;
  const links = await prisma.trackedLink.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  const contacts = await prisma.contact.findMany({ where: { id: { in: links.map((link) => link.contactId).filter((id): id is string => !!id) } }, select: { id: true, name: true } });
  const names = new Map(contacts.map((contact) => [contact.id, contact.name]));
  return Response.json({ links: links.map((link) => ({ ...link, shortUrl: shortUrl(link.slug), contactName: link.contactId ? names.get(link.contactId) ?? null : null })) });
}

/** Gera um link curto rastreado (com ou sem contato) para colar em mensagens e campanhas. */
export async function POST(request: Request) {
  const guard = await requireModule("pontuacao", "campanhas", "automacoes");
  if (guard.response) return guard.response;
  const body = (await request.json().catch(() => null)) as { url?: unknown; contactId?: unknown; label?: unknown } | null;
  const contactId = typeof body?.contactId === "string" && body.contactId ? body.contactId : null;
  if (contactId && !(await prisma.contact.findUnique({ where: { id: contactId }, select: { id: true } }))) return Response.json({ error: "Contato não encontrado." }, { status: 404 });
  try {
    const link = await createTrackedLink({ url: String(body?.url ?? ""), contactId, source: "manual", label: String(body?.label ?? "") });
    return Response.json({ link }, { status: 201 });
  } catch {
    return Response.json({ error: "Informe um link válido (http ou https)." }, { status: 400 });
  }
}
