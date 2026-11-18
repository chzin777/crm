import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { requireModule } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { ensureDefaultHandoffFlow } from "@/lib/automations/ai-handoff";
import { NODE_DEF, sanitizeGraph, triggerNodes, triggerTypesOf, type FlowGraph } from "@/lib/automations/nodes";
import { FLOW_TEMPLATES } from "@/lib/automations/templates";

/** Lista de automações com gatilho e contadores de execuções. */
export async function GET() {
  const guard = await requireModule("automacoes");
  if (guard.response) return guard.response;
  // Fluxo padrão "Transbordo da IA" (antigo "Para onde vai" de /ia), criado uma única vez.
  await ensureDefaultHandoffFlow().catch((error) => console.error("[automacoes] fluxo padrão de transbordo:", error));
  const [flows, counts] = await Promise.all([
    prisma.automationFlow.findMany({ orderBy: { updatedAt: "desc" }, select: { id: true, name: true, description: true, status: true, triggerType: true, nodes: true, updatedAt: true } }),
    prisma.automationExecution.groupBy({ by: ["flowId", "status"], _count: { _all: true } }),
  ]);
  return NextResponse.json({
    flows: flows.map((flow) => {
      const of = (statuses: string[]) => counts.filter((row) => row.flowId === flow.id && statuses.includes(row.status)).reduce((sum, row) => sum + row._count._all, 0);
      const triggers = triggerNodes(sanitizeGraph({ nodes: flow.nodes, edges: [] }));
      return {
        id: flow.id, name: flow.name, description: flow.description, status: flow.status, updatedAt: flow.updatedAt,
        trigger: triggers.length ? [...new Set(triggers.map((item) => NODE_DEF[item.type].label))].join(" · ") : "Sem gatilho",
        steps: Array.isArray(flow.nodes) ? flow.nodes.length : 0,
        running: of(["running", "waiting"]), completed: of(["completed"]), failed: of(["failed"]), cancelled: of(["cancelled"]),
      };
    }),
    templates: FLOW_TEMPLATES.map((template) => ({ id: template.id, name: template.name, description: template.description })),
  });
}

/** Nova automação em rascunho: do zero ou a partir de um modelo. */
export async function POST(request: Request) {
  const guard = await requireModule("automacoes");
  if (guard.response) return guard.response;
  const body = (await request.json().catch(() => null)) as { name?: unknown; templateId?: unknown } | null;
  const template = FLOW_TEMPLATES.find((item) => item.id === body?.templateId);
  const graph: FlowGraph = template ? template.graph : { nodes: [], edges: [] };
  const name = String(body?.name ?? "").trim().slice(0, 120) || template?.name || "Nova automação";
  const flow = await prisma.automationFlow.create({
    data: {
      name,
      description: template?.description ?? "",
      status: "draft",
      triggerType: triggerTypesOf(graph).join(","),
      nodes: graph.nodes as unknown as Prisma.InputJsonValue,
      edges: graph.edges as unknown as Prisma.InputJsonValue,
      webhookToken: randomBytes(18).toString("hex"),
      createdById: guard.user.id,
    },
    select: { id: true },
  });
  return NextResponse.json({ id: flow.id }, { status: 201 });
}
