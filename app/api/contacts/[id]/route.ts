import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { invalidateCache } from "@/lib/cache";
import { forbidUnless } from "@/lib/api-auth";

const contactSchema = z.object({
  nome: z.string().trim().min(1).max(200),
  telefone: z.string().trim().max(40).default(""),
  email: z.union([z.string().trim().email(), z.literal("")]).transform((v) => v.trim()).default(""),
  dataNascimento: z.union([z.string().trim().max(32), z.literal("")]).transform((v) => (typeof v === "string" ? v.trim() : "")).default(""),
  categoria: z.enum(["cliente", "lead", "nps", "inativo"]),
  segmento: z.string().trim().max(200).default(""),
});

const CONTACT_SELECT = {
  id: true,
  name: true,
  phone: true,
  email: true,
  birthDate: true,
  category: true,
  segment: true,
  store: true,
  cpf: true,
  gender: true,
  occupation: true,
  city: true,
  neighborhood: true,
  state: true,
  npsResponses: { select: { rating: true } },
  lastPurchaseDate: true,
  prescriptionExpiry: true,
  createdAt: true,
  purchases: true,
  totalSpent: true,
} satisfies Prisma.ContactSelect;

/** Formato do contato usado pela ficha de /contatos e pelo modal de /clientes-vip. */
function toContact(contact: Prisma.ContactGetPayload<{ select: typeof CONTACT_SELECT }>) {
  return {
    id: contact.id,
    nome: contact.name,
    telefone: contact.phone ?? "",
    email: contact.email ?? "",
    dataNascimento: contact.birthDate ?? "",
    categoria: contact.category,
    segmento: contact.segment ?? "",
    loja: contact.store ?? "",
    cpf: contact.cpf ?? "",
    genero: contact.gender ?? "",
    ocupacao: contact.occupation ?? "",
    cidade: contact.city ?? "",
    bairro: contact.neighborhood ?? "",
    estado: contact.state ?? "",
    npsRatings: contact.npsResponses.map((response) => response.rating),
    ultimoContato: contact.lastPurchaseDate ?? "",
    ultimaCompra: contact.lastPurchaseDate ?? "",
    prescricaoValidade: contact.prescriptionExpiry ?? "",
    criadoEm: contact.createdAt.toISOString(),
    compras: contact.purchases,
    totalGasto: contact.totalSpent.toNumber(),
    iniciais: contact.name.split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase(),
  };
}

/** Ficha completa de um contato (abre o modal a partir de outras telas, ex.: /clientes-vip). */
export async function GET(_request: Request, context: RouteContext<"/api/contacts/[id]">) {
  const forbidden = await forbidUnless("contacts/[id]", "GET");
  if (forbidden) return forbidden;
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await context.params;
  const contact = await prisma.contact.findUnique({ where: { id }, select: CONTACT_SELECT });
  if (!contact) return Response.json({ error: "Contato não encontrado." }, { status: 404 });
  return Response.json({ data: toContact(contact) });
}

export async function PATCH(request: Request, context: RouteContext<"/api/contacts/[id]">) {
  const forbidden = await forbidUnless("contacts/[id]", "PATCH");
  if (forbidden) return forbidden;
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
    select: CONTACT_SELECT,
  });
  await invalidateCache("dashboard", "audience:store:");
  return Response.json({ data: toContact(contact) });
}
