import { NextResponse } from "next/server";
import { requireModule } from "@/lib/api-auth";
import { sanitizeGraph } from "@/lib/automations/nodes";
import { simulateFlow } from "@/lib/automations/engine-db";

/** "Testar fluxo": simula o grafo enviado (mesmo sem salvar) para um contato, sem enviar nem gravar nada. */
export async function POST(request: Request) {
  const guard = await requireModule("automacoes");
  if (guard.response) return guard.response;
  const body = (await request.json().catch(() => null)) as { contactId?: unknown; triggerNodeId?: unknown; nodes?: unknown; edges?: unknown } | null;
  if (!body || typeof body.contactId !== "string" || !body.contactId) return NextResponse.json({ error: "Escolha um contato para o teste." }, { status: 400 });
  try {
    const result = await simulateFlow(sanitizeGraph({ nodes: body.nodes, edges: body.edges }), body.contactId, typeof body.triggerNodeId === "string" ? body.triggerNodeId : null);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível simular." }, { status: 400 });
  }
}
