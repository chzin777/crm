import { NextResponse } from "next/server";
import { requireModule } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

/** Filas e usuários para os campos do painel de configuração dos nós. */
export async function GET() {
  const guard = await requireModule("automacoes");
  if (guard.response) return guard.response;
  const [queues, users] = await Promise.all([
    prisma.chatQueue.findMany({ where: { archivedAt: null }, orderBy: [{ order: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    prisma.user.findMany({ where: { banned: false }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return NextResponse.json({ queues, users });
}
