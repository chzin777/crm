import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";

export async function GET(request: Request) {
  const user = await requireApiSession();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() || "";
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 20));

  const where = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { phone: { contains: q, mode: "insensitive" as const } },
          { email: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};

  const contacts = await prisma.contact.findMany({
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
    take: limit,
  });

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
  });
}