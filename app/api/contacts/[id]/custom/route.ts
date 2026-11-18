import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/api-auth";
import { readCustomFields } from "@/lib/contact-fields";
import { listFieldDefinitions, setContactFields } from "@/lib/contact-fields-db";
import { contactRfvp } from "@/lib/rfvp-db";

/** Pontuação, nível, últimas movimentações e campos personalizados do contato (ficha no /chat e em /contatos). */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireModule("contatos", "chat", "pontuacao");
  if (guard.response) return guard.response;
  const { id } = await context.params;
  const [contact, definitions, rfvp, logs] = await Promise.all([
    prisma.contact.findUnique({ where: { id }, select: { score: true, tier: true, scoreUpdatedAt: true, customFields: true } }),
    listFieldDefinitions(),
    contactRfvp(id).catch(() => null),
    prisma.contactScoreLog.findMany({ where: { contactId: id }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, delta: true, scoreAfter: true, tierAfter: true, reason: true, createdAt: true } }),
  ]);
  if (!contact) return Response.json({ error: "Contato não encontrado." }, { status: 404 });
  return Response.json({ score: contact.score, tier: contact.tier, scoreUpdatedAt: contact.scoreUpdatedAt, fields: readCustomFields(contact.customFields), definitions, logs, rfvp });
}

/** Grava os campos personalizados (só chaves definidas; valor vazio limpa). */
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireModule("contatos", "chat");
  if (guard.response) return guard.response;
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { fields?: unknown } | null;
  if (!body?.fields || typeof body.fields !== "object" || Array.isArray(body.fields)) return Response.json({ error: "Envie os campos." }, { status: 400 });
  try {
    const result = await setContactFields(id, body.fields as Record<string, unknown>);
    if (result.rejected.length) return Response.json({ error: result.rejected.map((item) => `${item.key}: ${item.reason}`).join("; "), fields: result.fields }, { status: 422 });
    return Response.json({ fields: result.fields });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível salvar." }, { status: 400 });
  }
}
