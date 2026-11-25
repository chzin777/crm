import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/api-auth";
import { storeErpCode } from "@/lib/stores";
import { effectivePresence } from "@/lib/chat/presence-status";
import { linkSellersByContact, parseCpf } from "@/lib/seller-link";

/** Lojas do ERP VMSet vinculadas ao usuário (códigos "13", "5"); undefined = não mexe. */
function parseStores(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return [...new Set(value.map((code) => String(code).trim()).filter((code) => code && code.length <= 20))].slice(0, 50);
}

async function saveStores(userId: string, stores: string[] | undefined) {
  if (!stores) return [];
  await prisma.chatAgent.upsert({ where: { userId }, create: { userId, stores, store: stores[0] ?? null }, update: { stores, store: stores[0] ?? null } });
  return stores;
}

const MIN_PASSWORD_LENGTH = 12;

export async function GET(request: NextRequest) {
  const guard = await requireModule("usuarios");
  if (guard.response) return guard.response;
  try {
    const { searchParams } = new URL(request.url);
    const requestedSort = searchParams.get("sortBy") || "name";
    const sortBy = ["name", "email", "roleId", "banned", "createdAt"].includes(requestedSort) ? requestedSort : "name";
    const sortOrder = searchParams.get("sortOrder") === "desc" ? "desc" : "asc";

    const users = await prisma.user.findMany({
      orderBy: { [sortBy]: sortOrder },
      select: {
        id: true,
        name: true,
        email: true,
        roleId: true,
        banned: true,
        createdAt: true,
        image: true,
        cpf: true,
        chatAgent: { select: { presenceStatus: true, paused: true, lastSeenAt: true, lastActivityAt: true, stores: true } },
      },
    });
    // Lojas do ERP VMSet para o vínculo do usuário (código "13" extraído do nome cadastrado).
    const storeRows = await prisma.store.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { name: true } });
    const stores = storeRows.flatMap((store) => {
      const code = storeErpCode(store.name);
      return code ? [{ code, name: store.name }] : [];
    });

    // Vendedor do VMSet ligado a cada usuário (e-mail/CPF, nome ou manual): base da visão de vendedor no app.
    const linkedSellers = await prisma.seller.findMany({ where: { userId: { in: users.map((user) => user.id) } }, select: { userId: true, name: true }, orderBy: { active: "desc" } });
    const sellerByUser = new Map<string, string>();
    for (const seller of linkedSellers) if (seller.userId && !sellerByUser.has(seller.userId)) sellerByUser.set(seller.userId, seller.name);

    return NextResponse.json({
      stores,
      data: users.map(({ chatAgent, ...user }) => ({ ...user, presence: effectivePresence(chatAgent), stores: chatAgent?.stores ?? [], seller: sellerByUser.get(user.id) ?? null })),
    });
  } catch (error) {
    console.error("Erro ao listar usuários:", error);
    return NextResponse.json({ error: "Não foi possível carregar os usuários." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireModule("usuarios");
  if (guard.response) return guard.response;
  try {
    const body = await request.json();
    const { name, email, roleId, password } = body;

    if (!name?.trim() || !email?.trim()) {
      return NextResponse.json({ error: "Nome e e-mail são obrigatórios." }, { status: 400 });
    }
    if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json({ error: `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (existing) {
      return NextResponse.json({ error: "Já existe um usuário com este e-mail." }, { status: 409 });
    }

    const id = randomUUID();
    const user = await prisma.user.create({
      data: {
        id,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        emailVerified: true,
        roleId: roleId || null,
        cpf: parseCpf(body.cpf) ?? null,
        // Senha inicial é provisória: no primeiro acesso o usuário cria a dele.
        mustChangePassword: true,
        accounts: {
          create: { id: randomUUID(), accountId: id, providerId: "credential", password: await hashPassword(password) },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        roleId: true,
        banned: true,
        createdAt: true,
        image: true,
        cpf: true,
      },
    });

    const stores = await saveStores(user.id, parseStores(body.stores));
    await linkSellersByContact([user.id]).catch(() => 0);
    return NextResponse.json({ data: { ...user, presence: "OFFLINE", stores } }, { status: 201 });
  } catch (error) {
    console.error("Erro ao criar usuário:", error);
    return NextResponse.json({ error: "Não foi possível criar o usuário." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const guard = await requireModule("usuarios");
  if (guard.response) return guard.response;
  try {
    const body = await request.json();
    const { id, name, email, roleId, banned, password } = body;

    if (!id) {
      return NextResponse.json({ error: "ID do usuário é obrigatório." }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (email !== undefined) updateData.email = email.trim().toLowerCase();
    if (roleId !== undefined) updateData.roleId = roleId || null;
    if (banned !== undefined) updateData.banned = banned;
    const cpf = parseCpf(body.cpf);
    if (body.cpf !== undefined && cpf === undefined) return NextResponse.json({ error: "CPF inválido (11 dígitos)." }, { status: 400 });
    if (cpf !== undefined) updateData.cpf = cpf;
    // Bloqueado sai na hora: derruba as sessões abertas (antes seguia logado até a sessão expirar).
    if (banned === true) await prisma.session.deleteMany({ where: { userId: id } });

    if (password) {
      if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
        return NextResponse.json({ error: `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` }, { status: 400 });
      }
      const hashed = await hashPassword(password);
      const updated = await prisma.account.updateMany({ where: { userId: id, providerId: "credential" }, data: { password: hashed } });
      if (updated.count === 0) {
        await prisma.account.create({ data: { id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: hashed } });
      }
      await prisma.session.deleteMany({ where: { userId: id } });
      // Senha definida pelo administrador é provisória: troca obrigatória no próximo acesso.
      updateData.mustChangePassword = true;
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        roleId: true,
        banned: true,
        createdAt: true,
        image: true,
        cpf: true,
      },
    });

    const requested = parseStores(body.stores);
    await saveStores(id, requested);
    await linkSellersByContact([id]).catch(() => 0);
    return NextResponse.json({ data: { ...user, stores: requested ?? [] } });
  } catch (error) {
    console.error("Erro ao atualizar usuário:", error);
    return NextResponse.json({ error: "Não foi possível atualizar o usuário." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await requireModule("usuarios");
  if (guard.response) return guard.response;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID do usuário é obrigatório." }, { status: 400 });
    }

    await prisma.user.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro ao excluir usuário:", error);
    return NextResponse.json({ error: "Não foi possível excluir o usuário." }, { status: 500 });
  }
}