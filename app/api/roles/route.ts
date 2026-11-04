import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/api-auth";

export async function GET() {
  const guard = await requireModule("usuarios", "cargos", "permissoes");
  if (guard.response) return guard.response;
  try {
    const roles = await prisma.role.findMany({
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ data: roles });
  } catch (error) {
    console.error("Erro ao listar cargos:", error);
    return NextResponse.json({ error: "Não foi possível carregar os cargos." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireModule("cargos");
  if (guard.response) return guard.response;
  try {
    const body = await request.json();
    const { name, description } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Nome do cargo é obrigatório." }, { status: 400 });
    }

    const existing = await prisma.role.findUnique({ where: { name: name.trim() } });
    if (existing) {
      return NextResponse.json({ error: "Já existe um cargo com este nome." }, { status: 409 });
    }

    const role = await prisma.role.create({
      data: {
        id: randomUUID(),
        name: name.trim(),
        description: description?.trim() || null,
      },
    });

    return NextResponse.json({ data: role }, { status: 201 });
  } catch (error) {
    console.error("Erro ao criar cargo:", error);
    return NextResponse.json({ error: "Não foi possível criar o cargo." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, description, permissions } = body;
    const guard = await requireModule(...(permissions !== undefined ? (["permissoes"] as const) : (["cargos"] as const)));
    if (guard.response) return guard.response;

    if (!id) {
      return NextResponse.json({ error: "ID do cargo é obrigatório." }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (permissions !== undefined) updateData.permissions = permissions;

    const role = await prisma.role.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ data: role });
  } catch (error) {
    console.error("Erro ao atualizar cargo:", error);
    return NextResponse.json({ error: "Não foi possível atualizar o cargo." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await requireModule("cargos");
  if (guard.response) return guard.response;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID do cargo é obrigatório." }, { status: 400 });
    }

    const role = await prisma.role.findUnique({ where: { id } });
    if (role?.isSystem) {
      return NextResponse.json({ error: "Cargos de sistema não podem ser excluídos." }, { status: 403 });
    }

    await prisma.role.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro ao excluir cargo:", error);
    return NextResponse.json({ error: "Não foi possível excluir o cargo." }, { status: 500 });
  }
}