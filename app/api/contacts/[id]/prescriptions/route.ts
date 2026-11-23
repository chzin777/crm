import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { parsePrescriptionInput, serializePrescription, sortPrescriptions } from "@/lib/prescriptions";
import { forbidUnless } from "@/lib/api-auth";

/** Receituário do contato: mais recente primeiro (data da receita; sem data, a criação). */
export async function GET(_request: Request, context: RouteContext<"/api/contacts/[id]/prescriptions">) {
  const forbidden = await forbidUnless("contacts/[id]/prescriptions", "GET");
  if (forbidden) return forbidden;
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await context.params;
  const rows = await prisma.customerPrescription.findMany({ where: { contactId: id }, orderBy: [{ dataReceita: "desc" }, { createdAt: "desc" }], take: 100 });
  return Response.json({ prescriptions: sortPrescriptions(rows.map(serializePrescription)) });
}

/** Receita lançada pelo atendente (origem "manual", já conferida por quem digitou). */
export async function POST(request: Request, context: RouteContext<"/api/contacts/[id]/prescriptions">) {
  const forbidden = await forbidUnless("contacts/[id]/prescriptions", "POST");
  if (forbidden) return forbidden;
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const parsed = parsePrescriptionInput(await request.json().catch(() => null));
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  const { id } = await context.params;
  const contact = await prisma.contact.findUnique({ where: { id }, select: { id: true } });
  if (!contact) return Response.json({ error: "Contato não encontrado." }, { status: 404 });
  const row = await prisma.customerPrescription.create({ data: { ...parsed.data, contactId: id, origem: "manual", conferidoPorHumano: parsed.data.conferidoPorHumano ?? true } });
  return Response.json({ prescription: serializePrescription(row) }, { status: 201 });
}
