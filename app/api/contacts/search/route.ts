import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { getDuplicateContactIds } from "@/lib/contact-duplicates";

/**
 * Variações em dígitos de um termo que parece telefone (só números e máscara, ao menos 4 dígitos), ou null.
 * Tira o 55 do país e, com DDD, aceita o número com e sem o 9 inicial do celular.
 */
function phoneSearchDigits(term: string): string[] | null {
  if (!/^[\d\s()+.\-]+$/.test(term)) return null;
  let digits = term.replace(/\D/g, "");
  if (digits.length < 4) return null;
  if (digits.startsWith("55") && digits.length >= 12) digits = digits.slice(2);
  const variants = new Set([digits]);
  if (digits.length === 11 && digits[2] === "9") variants.add(digits.slice(0, 2) + digits.slice(3));
  if (digits.length === 10) variants.add(`${digits.slice(0, 2)}9${digits.slice(2)}`);
  return [...variants];
}

export async function GET(request: Request) {
  const user = await requireApiSession();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() || url.searchParams.get("search")?.trim() || "";
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit")) || 50));
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const skip = (page - 1) * limit;
  // No SQL, `phone <> ''` também descarta telefones nulos.
  const phoneFilter = url.searchParams.get("withPhone") === "1" ? { phone: { not: "" } } : null;
  // unique=1: esconde cadastros que repetem o telefone de outro contato.
  const duplicateIds = url.searchParams.get("unique") === "1" ? await getDuplicateContactIds() : [];
  const uniqueFilter = duplicateIds.length > 0 ? { id: { notIn: duplicateIds } } : null;

  // Busca por telefone: "(62) 98123-4567", "62981234567" e "+55 62 98123-4567" viram só dígitos (os telefones são gravados assim).
  const phoneDigits = phoneSearchDigits(q);
  if (phoneDigits) {
    const where = {
      AND: [
        { OR: phoneDigits.map((digits) => ({ phone: { contains: digits } })) },
        ...(phoneFilter ? [phoneFilter] : []),
        ...(uniqueFilter ? [uniqueFilter] : []),
      ],
    };
    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        select: {
          id: true, name: true, phone: true, email: true, category: true,
          segment: true, store: true, purchases: true, totalSpent: true,
          lastPurchaseDate: true, birthDate: true,
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
        iniciais: c.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase(),
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  }

  const rawTokens = q.split(/\s+/).filter(Boolean);
  const strictTokens = rawTokens.filter((t) => t.length >= 2);
  const shortTokens = rawTokens.filter((t) => t.length === 1);

  // Busca sem termo: retorna lista paginada ordenada por nome
  if (rawTokens.length === 0) {
    const listWhere = { ...(phoneFilter ?? {}), ...(uniqueFilter ?? {}) };
    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where: listWhere,
        select: {
          id: true, name: true, phone: true, email: true, category: true,
          segment: true, store: true, purchases: true, totalSpent: true,
          lastPurchaseDate: true, birthDate: true,
        },
        orderBy: { name: "asc" },
        skip,
        take: limit,
      }),
      prisma.contact.count({ where: listWhere }),
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

  // Tokens estritos (>=2 chars): buscam em name, phone, segment
  for (const token of strictTokens) {
    andConditions.push({
      OR: [
        { name: { contains: token, mode: "insensitive" } },
        { phone: { contains: token, mode: "insensitive" } },
        { segment: { contains: token, mode: "insensitive" } },
      ],
    });
  }

  // Tokens curtos (1 char): casam com contém em name, segment ou phone
  // A filtragem fina (início de palavra) será feita no ranking em memória
  for (const token of shortTokens) {
    andConditions.push({
      OR: [
        { name: { contains: token, mode: "insensitive" } },
        { segment: { contains: token, mode: "insensitive" } },
        { phone: { contains: token, mode: "insensitive" } },
      ],
    });
  }

  if (phoneFilter) andConditions.push({ OR: [phoneFilter] });
  if (uniqueFilter) andConditions.push({ OR: [uniqueFilter] });

  const whereClause = andConditions.length > 0 ? { AND: andConditions } : {};

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
  const firstToken = (strictTokens[0] || "").toLowerCase();
  const secondToken = (strictTokens[1] || shortTokens[0] || "").toLowerCase();

  const ranked = allMatches.map((c) => {
    const nameLower = c.name.toLowerCase();
    const nameWords = nameLower.split(/\s+/);
    const segmentLower = (c.segment ?? "").toLowerCase();
    const phoneLower = (c.phone ?? "").toLowerCase();

    let score = 3; // default: outros

    // Peso 0: primeiro nome começa com o primeiro termo
    if (firstToken && nameLower.startsWith(firstToken)) {
      // Se há segundo termo, pontue melhor quem também casa o segundo termo
      if (secondToken) {
        const secondMatchesWord = nameWords.slice(1).some((w) => w.startsWith(secondToken));
        const secondMatchesSegment = segmentLower.startsWith(secondToken);
        if (secondMatchesWord || secondMatchesSegment) {
          score = 0; // topo absoluto: primeiro nome + segundo termo casando
        } else {
          score = 0; // ainda topo, mas sem match do segundo termo
        }
      } else {
        score = 0;
      }
    }
    // Peso 1: qualquer palavra do nome começa com o primeiro termo
    else if (firstToken && nameWords.some((w) => w.startsWith(firstToken))) {
      score = 1;
    }
    // Peso 2: casou apenas em telefone ou segmento
    else if (firstToken && (phoneLower.includes(firstToken) || segmentLower.includes(firstToken))) {
      score = 2;
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
/** Contatos de uma lista de IDs (ex.: selecionados no segmento), paginados e com busca restrita a esse subconjunto. */
export async function POST(request: Request) {
  const user = await requireApiSession();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const body = await request.json().catch(() => null) as { ids?: unknown; q?: unknown; page?: unknown; limit?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id): id is string => typeof id === "string").slice(0, 200_000) : [];
  const q = typeof body?.q === "string" ? body.q.trim() : "";
  const limit = Math.min(500, Math.max(1, Number(body?.limit) || 50));
  const page = Math.max(1, Number(body?.page) || 1);
  if (ids.length === 0) return NextResponse.json({ data: [], total: 0, page, limit, totalPages: 0 });

  const phoneDigits = phoneSearchDigits(q);
  const tokens = q.split(/\s+/).filter(Boolean);
  const where = {
    AND: [
      { id: { in: ids } },
      ...(phoneDigits
        ? [{ OR: phoneDigits.map((digits) => ({ phone: { contains: digits } })) }]
        : tokens.map((token) => ({
          OR: [
            { name: { contains: token, mode: "insensitive" as const } },
            { phone: { contains: token, mode: "insensitive" as const } },
            { email: { contains: token, mode: "insensitive" as const } },
            { segment: { contains: token, mode: "insensitive" as const } },
          ],
        }))),
    ],
  };
  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      select: {
        id: true, name: true, phone: true, email: true, category: true,
        segment: true, store: true, purchases: true, totalSpent: true,
        lastPurchaseDate: true, birthDate: true,
      },
      orderBy: { name: "asc" },
      skip: (page - 1) * limit,
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
      iniciais: c.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase(),
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}
