import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { invalidateCache } from "@/lib/cache";

const contactSchema = z.object({
  nome: z.string().trim().min(1).max(200),
  telefone: z.string().trim().max(40).default(""),
  email: z.string().trim().email().or(z.literal("")).default(""),
  dataNascimento: z.string().trim().max(32).default(""),
  categoria: z.enum(["cliente", "lead", "nps", "inativo"]),
  segmento: z.string().trim().max(200).default(""),
});

export async function PATCH(request: Request, context: RouteContext<"/api/contacts/[id]">) {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const parsed = contactSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Revise os dados do contato." }, { status: 400 });

  const { id } = await context.params;
  const values = parsed.data;
  const contact = await prisma.contact.update({
    where: { id },
    data: {
      name: values.nome,
      phone: values.telefone || null,
      email: values.email || null,
      birthDate: values.dataNascimento || null,
      category: values.categoria,
      segment: values.segmento || null,
    },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      birthDate: true,
      category: true,
      segment: true,
      store: true,
      npsResponses: { select: { rating: true } },
      lastPurchaseDate: true,
      purchases: true,
      totalSpent: true,
    },
  });
  await invalidateCache("dashboard", "audience:store:");
  return Response.json({
    data: {
      id: contact.id,
      nome: contact.name,
      telefone: contact.phone ?? "",
      email: contact.email ?? "",
      dataNascimento: contact.birthDate ?? "",
      categoria: contact.category,
      segmento: contact.segment ?? "",
      loja: contact.store ?? "",
      npsRatings: contact.npsResponses.map((response) => response.rating),
      ultimoContato: contact.lastPurchaseDate ?? "",
      compras: contact.purchases,
      totalGasto: contact.totalSpent.toNumber(),
      iniciais: contact.name.split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase(),
    },
  });
}
