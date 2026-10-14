import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { invalidateCache } from "@/lib/cache";

const responseSchema = z.object({
  surveyKey: z.enum(["atendimento", "produto"]),
  contactId: z.string().optional(),
  rating: z.number().int().min(0).max(10),
  comment: z.string().trim().max(2000).optional(),
});

export async function GET() {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const responses = await prisma.npsResponse.findMany({
    orderBy: { createdAt: "desc" },
    include: { contact: { select: { name: true } } },
  });
  return Response.json({ data: responses });
}

export async function POST(request: Request) {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const parsed = responseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Revise os dados da avaliação." }, { status: 400 });
  if (parsed.data.contactId && !await prisma.contact.findUnique({ where: { id: parsed.data.contactId }, select: { id: true } })) {
    return Response.json({ error: "O contato selecionado não existe." }, { status: 404 });
  }
  const response = await prisma.npsResponse.create({
    data: { ...parsed.data, createdBy: user.id },
    include: { contact: { select: { name: true } } },
  });
  await invalidateCache("dashboard");
  return Response.json({ data: response }, { status: 201 });
}
