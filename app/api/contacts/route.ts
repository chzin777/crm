import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { invalidateCache } from "@/lib/cache";

const contactSchema = z.object({
  nome: z.string().trim().min(1).max(200),
  telefone: z.string().trim().max(40).default(""),
  email: z.union([z.string().trim().email(), z.literal("")]).transform((v) => v.trim()).default(""),
  dataNascimento: z.union([z.string().trim().max(32), z.literal("")]).transform((v) => (typeof v === "string" ? v.trim() : "")).default(""),
  categoria: z.enum(["cliente", "lead", "nps", "inativo"]),
  segmento: z.string().trim().max(200).default(""),
});

const toContact = (contact: {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  birthDate: string | null;
  category: string;
  segment: string | null;
  store: string | null;
  cpf: string | null;
  gender: string | null;
  occupation: string | null;
  city: string | null;
  neighborhood: string | null;
  state: string | null;
  npsResponses?: { rating: number }[];
  lastPurchaseDate: string | null;
  prescriptionExpiry: string | null;
  createdAt: Date;
  purchases: number;
  totalSpent: { toNumber(): number };
}) => ({
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
  npsRatings: contact.npsResponses?.map((response) => response.rating) ?? [],
  ultimoContato: contact.lastPurchaseDate ?? "",
  ultimaCompra: contact.lastPurchaseDate ?? "",
  prescricaoValidade: contact.prescriptionExpiry ?? "",
  criadoEm: contact.createdAt.toISOString(),
  compras: contact.purchases,
  totalGasto: contact.totalSpent.toNumber(),
  iniciais: contact.name.split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase(),
});

export async function GET(request: Request) {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize")) || 50));
  const search = url.searchParams.get("search")?.trim() || "";
  const category = url.searchParams.get("category") || "";
  const sortByRaw = url.searchParams.get("sortBy") || "lastPurchaseDate";
  const sortOrderRaw = url.searchParams.get("sortOrder") || "desc";

  const allowedSortFields: Record<string, string> = {
    nome: "name",
    name: "name",
    telefone: "phone",
    phone: "phone",
    email: "email",
    categoria: "category",
    category: "category",
    segmento: "segment",
    segment: "segment",
    ultimoContato: "lastPurchaseDate",
    lastPurchaseDate: "lastPurchaseDate",
    dataNascimento: "birthDate",
    birthDate: "birthDate",
    compras: "purchases",
    purchases: "purchases",
    totalGasto: "totalSpent",
    totalSpent: "totalSpent",
  };
  const sortField = allowedSortFields[sortByRaw] ?? "lastPurchaseDate";
  const sortOrder = sortOrderRaw === "asc" ? "asc" : "desc";

  const where: Record<string, unknown> = {};
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { phone: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }
  if (category && ["cliente", "lead", "nps", "inativo"].includes(category)) {
    where.category = category;
  }

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      orderBy: { [sortField]: sortOrder },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
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
        lastPurchaseDate: true,
        prescriptionExpiry: true,
        createdAt: true,
        purchases: true,
        totalSpent: true,
      },
    }),
    prisma.contact.count({ where }),
  ]);

  return Response.json({
    data: contacts.map(toContact),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}

export async function POST(request: Request) {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const parsed = contactSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Revise os dados do contato." }, { status: 400 });

  const values = parsed.data;
  const contact = await prisma.contact.create({
    data: {
      sourceKey: `manual:${randomUUID()}`,
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
    },
  });
  await invalidateCache("dashboard", "audience:store:");
  return Response.json({ data: toContact(contact) }, { status: 201 });
}
