import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/api-auth";

/** Edita rótulo e opções (a chave e o tipo ficam: automações e IA dependem deles). */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireModule("contatos");
  if (guard.response) return guard.response;
  const { id } = await context.params;
  const current = await prisma.contactFieldDef.findUnique({ where: { id } });
  if (!current) return Response.json({ error: "Campo não encontrado." }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { label?: unknown; options?: unknown } | null;
  const label = typeof body?.label === "string" && body.label.trim() ? body.label.trim().slice(0, 80) : current.label;
  const options = Array.isArray(body?.options) ? [...new Set(body.options.map((item) => String(item).trim().slice(0, 80)).filter(Boolean))].slice(0, 50) : undefined;
  if (current.type === "select" && options && options.length < 2) return Response.json({ error: "Campo de seleção precisa de ao menos 2 opções." }, { status: 400 });
  const updated = await prisma.contactFieldDef.update({ where: { id }, data: { label, ...(options ? { options } : {}) } });
  return Response.json({ definition: updated });
}

/** Exclui a definição (os valores já gravados nos contatos ficam guardados, mas deixam de aparecer). */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireModule("contatos");
  if (guard.response) return guard.response;
  const { id } = await context.params;
  await prisma.contactFieldDef.delete({ where: { id } }).catch(() => null);
  return Response.json({ ok: true });
}
