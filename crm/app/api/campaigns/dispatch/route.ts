import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { DispatchError, listDispatchJobs, resumeDispatch, startDispatch, stopDispatch, type DispatchRecipient } from "@/lib/campaign-dispatch";

export async function GET() {
  if (!(await requireApiSession())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    return NextResponse.json({ jobs: await listDispatchJobs() });
  } catch (error) {
    console.error("[campaigns/dispatch] listar:", error);
    return NextResponse.json({ error: "Não foi possível consultar os disparos." }, { status: 500 });
  }
}

const isRecipient = (value: unknown): value is DispatchRecipient => {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return ["id", "nome", "telefone", "email", "dataNascimento", "segmento"].every((key) => typeof item[key] === "string");
};

export async function POST(request: Request) {
  if (!(await requireApiSession())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const body = await request.json().catch(() => null) as { action?: string; campaignId?: string; recipients?: unknown } | null;
  if (!body || typeof body.campaignId !== "string" || !body.campaignId) {
    return NextResponse.json({ error: "Campanha inválida." }, { status: 400 });
  }
  try {
    switch (body.action) {
      case "start": {
        if (!Array.isArray(body.recipients) || !body.recipients.every(isRecipient)) {
          return NextResponse.json({ error: "Lista de contatos inválida." }, { status: 400 });
        }
        return NextResponse.json({ job: await startDispatch(body.campaignId, body.recipients) });
      }
      case "resume":
        return NextResponse.json({ job: await resumeDispatch(body.campaignId) });
      case "pause":
      case "cancel":
        return NextResponse.json({ job: await stopDispatch(body.campaignId, body.action) });
      default:
        return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof DispatchError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[campaigns/dispatch] falha:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao processar o disparo." }, { status: 500 });
  }
}
