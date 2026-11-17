import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { phoneVariants } from "@/lib/chat/phone";
import { triggerAutomations } from "@/lib/automations/engine-db";

type Context = { params: Promise<{ id: string }> };

const sameToken = (a: string, b: string) => a.length === b.length && a.length > 0 && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Gatilho "Webhook externo" (público, protegido pelo token do fluxo em ?token= ou no cabeçalho x-automation-token).
 * Corpo JSON: { "telefone": "62999990000", ...variáveis } (ou "contactId"). Variáveis viram {{campo}} no fluxo.
 */
export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  const token = request.headers.get("x-automation-token") ?? new URL(request.url).searchParams.get("token") ?? "";
  const flow = await prisma.automationFlow.findUnique({ where: { id }, select: { id: true, status: true, triggerType: true, webhookToken: true } });
  if (!flow || !sameToken(token, flow.webhookToken)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (flow.status !== "active" || !flow.triggerType.split(",").includes("trigger_webhook")) return NextResponse.json({ error: "Automação inativa ou sem gatilho de webhook." }, { status: 409 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Envie um JSON." }, { status: 400 });
  const phone = String(body.telefone ?? body.phone ?? "").replace(/\D/g, "");
  const contact = typeof body.contactId === "string"
    ? await prisma.contact.findUnique({ where: { id: body.contactId }, select: { id: true } })
    : phone ? await prisma.contact.findFirst({ where: { phone: { in: phoneVariants(phone) } }, select: { id: true } }) : null;
  if (!contact) return NextResponse.json({ error: "Contato não encontrado (envie telefone ou contactId)." }, { status: 404 });
  const vars = Object.fromEntries(Object.entries(body).filter(([, value]) => ["string", "number", "boolean"].includes(typeof value)).slice(0, 30).map(([key, value]) => [key.slice(0, 40), String(value).slice(0, 500)]));
  const started = await triggerAutomations({ type: "trigger_webhook" }, { contactId: contact.id, vars }, { onlyFlowId: flow.id });
  return NextResponse.json({ ok: true, executions: started });
}
