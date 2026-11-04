import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/api-auth";

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
      },
    });

    return NextResponse.json({ data: users });
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
      },
    });

    return NextResponse.json({ data: user }, { status: 201 });
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
      },
    });

    return NextResponse.json({ data: user });
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