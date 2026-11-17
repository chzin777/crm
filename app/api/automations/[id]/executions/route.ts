import { NextResponse } from "next/server";
import { requireModule } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

type Context = { params: Promise<{ id: string }> };

/** Últimas execuções do fluxo com o log passo a passo. */
export async function GET(request: Request, { params }: Context) {
  const guard = await requireModule("automacoes");
  if (guard.response) return guard.response;
  const { id } = await params;
  const status = new URL(request.url).searchParams.get("status");
  const executions = await prisma.automationExecution.findMany({
    where: { flowId: id, ...(status === "running" ? { status: { in: ["running", "waiting"] } } : status ? { status } : {}) },
    orderBy: { startedAt: "desc" },
    take: 50,
    include: { steps: { orderBy: { createdAt: "asc" }, take: 80 } },
  });
  const contacts = await prisma.contact.findMany({ where: { id: { in: [...new Set(executions.map((item) => item.contactId))] } }, select: { id: true, name: true, phone: true } });
  const byId = new Map(contacts.map((contact) => [contact.id, contact]));
  return NextResponse.json({
    executions: executions.map((item) => ({
      id: item.id, status: item.status, currentNodeId: item.currentNodeId, resumeAt: item.resumeAt, error: item.error, startedAt: item.startedAt, finishedAt: item.finishedAt, conversationId: item.conversationId,
      contact: byId.get(item.contactId) ?? { id: item.contactId, name: "Contato removido", phone: null },
      steps: item.steps.map((step) => ({ id: step.id, nodeId: step.nodeId, nodeType: step.nodeType, status: step.status, message: step.message, createdAt: step.createdAt })),
    })),
  });
}
