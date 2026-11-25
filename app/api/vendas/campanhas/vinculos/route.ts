import { requireModule } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

/** Liga (ou desliga, userId null) o vendedor do VMSet ao usuário do CRM que recebe a comemoração. */
export async function PUT(request: Request) {
  const guard = await requireModule("premiacoes", "metas", "lojas", "usuarios");
  if (guard.response) return guard.response;
  const body = (await request.json().catch(() => null)) as { sellerId?: unknown; userId?: unknown } | null;
  if (typeof body?.sellerId !== "string" || (body.userId !== null && typeof body.userId !== "string")) return Response.json({ error: "Informe o vendedor e o usuário." }, { status: 400 });
  const sellerId = body.sellerId;
  const userId = body.userId as string | null;
  if (userId && !(await prisma.user.findUnique({ where: { id: userId }, select: { id: true } }))) return Response.json({ error: "Usuário não encontrado." }, { status: 404 });
  // Um usuário fica ligado a um vendedor só.
  if (userId) await prisma.seller.updateMany({ where: { userId, id: { not: sellerId } }, data: { userId: null } });
  const seller = await prisma.seller.update({ where: { id: sellerId }, data: { userId }, select: { id: true, userId: true } }).catch(() => null);
  return seller ? Response.json({ data: seller }) : Response.json({ error: "Vendedor não encontrado." }, { status: 404 });
}
