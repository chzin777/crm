import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { receiveWebhookLead } from "@/lib/automations/webhook-db";
import { readWebhookBody } from "@/lib/automations/webhook-lead";

type Context = { params: Promise<{ token: string }> };

const flowByToken = (token: string) =>
  token.length >= 16 ? prisma.automationFlow.findFirst({ where: { webhookToken: token }, select: { id: true, name: true, status: true, nodes: true, edges: true } }) : Promise.resolve(null);

/**
 * Webhook de entrada da automação (público; o token longo e aleatório na URL é o segredo).
 * Aceita JSON, formulário (landing page) ou query string. Rascunho só captura a amostra para mapear os campos.
 */
export async function POST(request: Request, { params }: Context) {
  const { token } = await params;
  const flow = await flowByToken(token);
  if (!flow) return NextResponse.json({ error: "URL de webhook inválida." }, { status: 404 });
  const payload = await readWebhookBody(request);
  try {
    const result = await receiveWebhookLead(flow, payload);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error(`[webhooks/automacoes] ${flow.id}:`, error);
    return NextResponse.json({ error: "Falha ao processar o lead." }, { status: 500 });
  }
}

/** Verificação de assinatura da Meta (hub.challenge) e teste rápido de que a URL existe. */
export async function GET(request: Request, { params }: Context) {
  const { token } = await params;
  const flow = await flowByToken(token);
  if (!flow) return NextResponse.json({ error: "URL de webhook inválida." }, { status: 404 });
  const search = new URL(request.url).searchParams;
  const challenge = search.get("hub.challenge");
  if (search.get("hub.mode") === "subscribe" && challenge) return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  return NextResponse.json({ ok: true, automation: flow.name, active: flow.status === "active" });
}
