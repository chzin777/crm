import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { requireModule } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { sanitizeGraph, triggerNode, validateGraph } from "@/lib/automations/nodes";

type Context = { params: Promise<{ id: string }> };
const STATUSES = ["draft", "active", "paused"];

export async function GET(_request: Request, { params }: Context) {
  const guard = await requireModule("automacoes");
  if (guard.response) return guard.response;
  const { id } = await params;
  const flow = await prisma.automationFlow.findUnique({ where: { id } });
  if (!flow) return NextResponse.json({ error: "Automação não encontrada." }, { status: 404 });
  const graph = sanitizeGraph(flow);
  return NextResponse.json({ flow: { id: flow.id, name: flow.name, description: flow.description, status: flow.status, webhookToken: flow.webhookToken, updatedAt: flow.updatedAt, ...graph } });
}

/** Salva nome, grafo e status. Ativar exige um fluxo válido (gatilho conectado, campos obrigatórios). */
export async function PUT(request: Request, { params }: Context) {
  const guard = await requireModule("automacoes");
  if (guard.response) return guard.response;
  const { id } = await params;
  const current = await prisma.automationFlow.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "Automação não encontrada." }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { name?: unknown; description?: unknown; status?: unknown; nodes?: unknown; edges?: unknown } | null;
  const graph = sanitizeGraph(body?.nodes !== undefined ? { nodes: body.nodes, edges: body.edges } : current);
  const status = typeof body?.status === "string" && STATUSES.includes(body.status) ? body.status : current.status;
  if (status === "active") {
    const problems = validateGraph(graph);
    if (problems.length) return NextResponse.json({ error: problems[0], problems }, { status: 400 });
  }
  const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim().slice(0, 120) : current.name;
  const flow = await prisma.automationFlow.update({
    where: { id },
    data: {
      name,
      description: typeof body?.description === "string" ? body.description.slice(0, 500) : current.description,
      status,
      triggerType: triggerNode(graph)?.type ?? "",
      nodes: graph.nodes as unknown as Prisma.InputJsonValue,
      edges: graph.edges as unknown as Prisma.InputJsonValue,
    },
  });
  return NextResponse.json({ flow: { id: flow.id, name: flow.name, description: flow.description, status: flow.status, webhookToken: flow.webhookToken, updatedAt: flow.updatedAt, ...graph } });
}

/** Exclui o fluxo e o histórico de execuções (cascata). */
export async function DELETE(_request: Request, { params }: Context) {
  const guard = await requireModule("automacoes");
  if (guard.response) return guard.response;
  const { id } = await params;
  await prisma.automationFlow.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
