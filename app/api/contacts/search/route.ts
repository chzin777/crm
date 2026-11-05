import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";

export async function GET(request: Request) {
  const user = await requireApiSession();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() || url.searchParams.get("search")?.trim() || "";
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit")) || 50));
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const skip = (page - 1) * limit;

  // Busca composta por tokens: cada palavra digitada deve casar em pelo menos um campo.
  // Ex.: "Michel Gerente" encontra contato com nome "Michel" e segmento "Gerente".
  const tokens = q.split(/\s+/).filter(Boolean);
  const where = tokens.length
    ? {
        AND: tokens.map((token) => ({
          OR: [
            { name: { contains: token, mode: "insensitive" as const } },
            { phone: { contains: token, mode: "insensitive" as const } },
            { email: { contains: token, mode: "insensitive" as const } },
            { segment: { contains: token, mode: "insensitive" as const } },
            { category: { contains: token, mode: "insensitive" as const } },
          ],
        })),
      }
    : {};

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        category: true,
        segment: true,
        store: true,
        purchases: true,
        totalSpent: true,
        lastPurchaseDate: true,
        birthDate: true,
      },
      orderBy: { name: "asc" },
      skip,
      take: limit,
    }),
    prisma.contact.count({ where }),
  ]);

  return NextResponse.json({
    data: contacts.map((c) => ({
      id: c.id,
      nome: c.name,
      telefone: c.phone ?? "",
      email: c.email ?? "",
      categoria: c.category,
      segmento: c.segment ?? "",
      loja: c.store ?? "",
      compras: c.purchases,
      totalGasto: Number(c.totalSpent),
      ultimoContato: c.lastPurchaseDate ?? "",
      dataNascimento: c.birthDate ?? "",
      iniciais: c.name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase(),
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}