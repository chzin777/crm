import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";

const select = { marketingOptOut: true, marketingOptOutAt: true, marketingOptOutReason: true } as const;

/** Situação de opt-out de campanhas do contato. */
export async function GET(_request: Request, context: RouteContext<"/api/contacts/[id]/marketing">) {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await context.params;
  const contact = await prisma.contact.findUnique({ where: { id }, select });
  if (!contact) return Response.json({ error: "Contato não encontrado." }, { status: 404 });
  return Response.json(contact);
}

/** Alteração manual (cliente pediu pelo telefone/balcão). */
export async function PATCH(request: Request, context: RouteContext<"/api/contacts/[id]/marketing">) {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { optOut?: unknown } | null;
  if (typeof body?.optOut !== "boolean") return Response.json({ error: "Informe optOut (true/false)." }, { status: 400 });
  const { id } = await context.params;
  const exists = await prisma.contact.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return Response.json({ error: "Contato não encontrado." }, { status: 404 });
  const contact = await prisma.contact.update({
    where: { id },
    data: body.optOut
      ? { marketingOptOut: true, marketingOptOutAt: new Date(), marketingOptOutReason: `Manual: ${user.name ?? user.email}`.slice(0, 200) }
      : { marketingOptOut: false, marketingOptOutAt: null, marketingOptOutReason: null },
    select,
  });
  console.log(`[contacts] opt-out de campanhas ${body.optOut ? "ativado" : "removido"} no contato ${id} por ${user.email}`);
  return Response.json(contact);
}
