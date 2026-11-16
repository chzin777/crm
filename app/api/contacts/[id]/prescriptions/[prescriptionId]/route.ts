import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { parsePrescriptionInput, serializePrescription } from "@/lib/prescriptions";

type Context = RouteContext<"/api/contacts/[id]/prescriptions/[prescriptionId]">;

/** Receita do contato da URL (nunca de outro contato). */
async function findOwned(context: Context) {
  const { id, prescriptionId } = await context.params;
  return prisma.customerPrescription.findFirst({ where: { id: prescriptionId, contactId: id }, select: { id: true } });
}

/** Corrige graus extraídos pela IA ou marca/desmarca "Conferido". */
export async function PATCH(request: Request, context: Context) {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const parsed = parsePrescriptionInput(await request.json().catch(() => null), true);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  if (!Object.keys(parsed.data).length) return Response.json({ error: "Nada para alterar." }, { status: 400 });
  const owned = await findOwned(context);
  if (!owned) return Response.json({ error: "Receita não encontrada." }, { status: 404 });
  const row = await prisma.customerPrescription.update({ where: { id: owned.id }, data: parsed.data });
  return Response.json({ prescription: serializePrescription(row) });
}

/** Remove receita inválida ou duplicada. */
export async function DELETE(_request: Request, context: Context) {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const owned = await findOwned(context);
  if (!owned) return Response.json({ error: "Receita não encontrada." }, { status: 404 });
  await prisma.customerPrescription.delete({ where: { id: owned.id } });
  return Response.json({ ok: true });
}
