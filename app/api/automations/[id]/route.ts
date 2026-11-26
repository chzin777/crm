import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { requireModule } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { flowTemplates, readFlowSettings, sanitizeGraph, templateApprovalProblems, triggerTypesOf, validateGraph } from "@/lib/automations/nodes";
import { listTemplates } from "@/lib/meta-whatsapp";

type Context = { params: Promise<{ id: string }> };
const STATUSES = ["draft", "active", "paused"];

export async function GET(_request: Request, { params }: Context) {
  const guard = await requireModule("automacoes");
  if (guard.response) return guard.response;
  const { id } = await params;
  const found = await prisma.automationFlow.findUnique({ where: { id } });
  if (!found) return NextResponse.json({ error: "Automação não encontrada." }, { status: 404 });
  // Fluxos antigos sem segredo: gera o token da URL do webhook de entrada na primeira abertura.
  const flow = found.webhookToken ? found : await prisma.automationFlow.update({ where: { id }, data: { webhookToken: randomBytes(18).toString("hex") } });
  const graph = sanitizeGraph(flow);
  return NextResponse.json({ flow: { id: flow.id, name: flow.name, description: flow.description, status: flow.status, webhookToken: flow.webhookToken, updatedAt: flow.updatedAt, settings: readFlowSettings(flow.settings), ...graph } });
}

/** Salva nome, grafo e status. Ativar exige um fluxo válido (gatilho conectado, campos obrigatórios). */
export async function PUT(request: Request, { params }: Context) {
  const guard = await requireModule("automacoes");
  if (guard.response) return guard.response;
  const { id } = await params;
  const current = await prisma.automationFlow.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "Automação não encontrada." }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { name?: unknown; description?: unknown; status?: unknown; nodes?: unknown; edges?: unknown; settings?: unknown } | null;
  const graph = sanitizeGraph(body?.nodes !== undefined ? { nodes: body.nodes, edges: body.edges } : current);
  const status = typeof body?.status === "string" && STATUSES.includes(body.status) ? body.status : current.status;
  if (status === "active") {
    const problems = validateGraph(graph);
    // Conformidade com a Meta: só ativa com os modelos do fluxo aprovados (status atual na Meta).
    if (!problems.length && flowTemplates(graph).length) {
      const templates = await listTemplates().catch(() => null);
      if (!templates) problems.push("Não foi possível conferir na Meta se os modelos do fluxo estão aprovados. Tente ativar de novo em instantes.");
      else problems.push(...templateApprovalProblems(graph, templates));
    }
    if (problems.length) return NextResponse.json({ error: problems[0], problems }, { status: 400 });
  }
  const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim().slice(0, 120) : current.name;
  const flow = await prisma.automationFlow.update({
    where: { id },
    data: {
      name,
      description: typeof body?.description === "string" ? body.description.slice(0, 500) : current.description,
      status,
      triggerType: triggerTypesOf(graph).join(","),
      nodes: graph.nodes as unknown as Prisma.InputJsonValue,
      edges: graph.edges as unknown as Prisma.InputJsonValue,
      ...(body?.settings !== undefined ? { settings: readFlowSettings(body.settings) as unknown as Prisma.InputJsonValue } : {}),
    },
  });
  return NextResponse.json({ flow: { id: flow.id, name: flow.name, description: flow.description, status: flow.status, webhookToken: flow.webhookToken, updatedAt: flow.updatedAt, settings: readFlowSettings(flow.settings), ...graph } });
}

/** Exclui o fluxo e o histórico de execuções (cascata). */
export async function DELETE(_request: Request, { params }: Context) {
  const guard = await requireModule("automacoes");
  if (guard.response) return guard.response;
  const { id } = await params;
  await prisma.automationFlow.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
