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

  const rawTokens = q.split(/\s+/).filter(Boolean);
  const strictTokens = rawTokens.filter((t) => t.length >= 2);
  const shortTokens = rawTokens.filter((t) => t.length === 1);

  // Busca sem termo: retorna lista paginada ordenada por nome
  if (rawTokens.length === 0) {
    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        select: {
          id: true, name: true, phone: true, email: true, category: true,
          segment: true, store: true, purchases: true, totalSpent: true,
          lastPurchaseDate: true, birthDate: true,
        },
        orderBy: { name: "asc" },
        skip,
        take: limit,
      }),
      prisma.contact.count(),
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
        iniciais: c.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase(),
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  }

  // Construção do WHERE com Prisma Client padrão (AND entre tokens)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const andConditions: Array<{ OR: Array<Record<string, any>> }> = [];

  // Tokens estritos (>=2 chars): buscam em name, phone, segment (não em email para evitar ruído de domínio)
  for (const token of strictTokens) {
    const pattern = `%${token}%`;
    andConditions.push({
      OR: [
        { name: { contains: token, mode: "insensitive" } },
        { phone: { contains: token, mode: "insensitive" } },
        { segment: { contains: token, mode: "insensitive" } },
      ],
    });
  }

  // Tokens curtos (1 char): apenas prefixo do nome
  for (const token of shortTokens) {
    andConditions.push({
      OR: [
        { name: { startsWith: token, mode: "insensitive" } },
      ],
    });
  }

  const whereClause = andConditions.length > 0 ? { AND: andConditions } : {};

  // Buscar todos os resultados que casam (sem paginação no banco — será feita em memória após ordenação)
  // Limitamos a um teto razoável para evitar sobrecarga
  const MAX_FETCH = 2000;

  const [allMatches, total] = await Promise.all([
    prisma.contact.findMany({
      where: whereClause,
      select: {
        id: true, name: true, phone: true, email: true, category: true,
        segment: true, store: true, purchases: true, totalSpent: true,
        lastPurchaseDate: true, birthDate: true,
      },
      take: MAX_FETCH,
    }),
    prisma.contact.count({ where: whereClause }),
  ]);

  // Ordenação por relevância em memória
  const primaryToken = (strictTokens[0] || shortTokens[0] || "").toLowerCase();

  const ranked = allMatches.map((c) => {
    const nameLower = c.name.toLowerCase();
    let score = 3; // default: outros

    if (primaryToken && nameLower.startsWith(primaryToken)) {
      score = 0; // nome começa exatamente com o primeiro token
    } else if (primaryToken) {
      // Verifica se alguma palavra do nome começa com o token
      const words = nameLower.split(/\s+/);
      if (words.some((w) => w.startsWith(primaryToken))) {
        score = 1; // alguma palavra do nome começa com o token
      } else if (c.phone && c.phone.toLowerCase().includes(primaryToken)) {
        score = 2; // match apenas no telefone
      }
    }

    return { ...c, _score: score };
  });

  ranked.sort((a, b) => {
    if (a._score !== b._score) return a._score - b._score;
    return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
  });

  // Paginação em memória
  const paged = ranked.slice(skip, skip + limit);

  return NextResponse.json({
    data: paged.map((c) => ({
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