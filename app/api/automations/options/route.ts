import { NextResponse } from "next/server";
import { requireModule } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

/** Filas e usuários para os campos do painel de configuração dos nós. */
export async function GET() {
  const guard = await requireModule("automacoes");
  if (guard.response) return guard.response;
  const [queues, users, flows] = await Promise.all([
    prisma.chatQueue.findMany({ where: { archivedAt: null }, orderBy: [{ order: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    prisma.user.findMany({ where: { banned: false }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    // Destinos do nó "Ir para outra automação".
    prisma.automationFlow.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, status: true } }),
  ]);
  return NextResponse.json({ queues, users, flows });
}
