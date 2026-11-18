import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { requireModule } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { AiError, aiJson } from "@/lib/ai/openai";
import { AUTOMATION_DRAFT_SCHEMA, builderSystemPrompt, draftToGraph, type AutomationDraft } from "@/lib/automations/ai-builder";
import { triggerTypesOf, validateGraph } from "@/lib/automations/nodes";

/**
 * Cria uma automação a partir de uma descrição em linguagem natural: a IA monta gatilho + passos (JSON Schema
 * estrito com os nós reais do motor), o servidor valida, posiciona os nós e salva em rascunho.
 */
export async function POST(request: Request) {
  const guard = await requireModule("automacoes");
  if (guard.response) return guard.response;
  const body = (await request.json().catch(() => null)) as { prompt?: unknown } | null;
  const prompt = String(body?.prompt ?? "").trim().slice(0, 2000);
  if (prompt.length < 10) return NextResponse.json({ error: "Descreva a automação com um pouco mais de detalhe." }, { status: 400 });

  const [queues, users, flows, fields] = await Promise.all([
    prisma.chatQueue.findMany({ where: { archivedAt: null }, orderBy: [{ order: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    prisma.user.findMany({ where: { banned: false }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.automationFlow.findMany({ orderBy: { updatedAt: "desc" }, take: 60, select: { id: true, name: true } }),
    prisma.contactFieldDef.findMany({ orderBy: { order: "asc" }, select: { key: true, label: true } }),
  ]);
  const workspace = { queues, users, flows, fields };
  const messages = [
    { role: "system" as const, content: builderSystemPrompt(workspace) },
    { role: "user" as const, content: prompt },
  ];

  let draft: AutomationDraft;
  try {
    draft = await aiJson<AutomationDraft>(messages, { feature: "automation_builder", userId: guard.user.id, maxTokens: 4000, jsonSchema: { name: "automacao", schema: AUTOMATION_DRAFT_SCHEMA } });
  } catch (error) {
    // Modelo sem suporte a Structured Outputs: repete em JSON livre (o servidor valida tudo do mesmo jeito).
    if (!(error instanceof AiError) || error.status !== 502 || error.creditExhausted) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível gerar a automação." }, { status: error instanceof AiError ? error.status : 502 });
    }
    try {
      draft = await aiJson<AutomationDraft>([...messages, { role: "system", content: `Formato obrigatório (JSON Schema): ${JSON.stringify(AUTOMATION_DRAFT_SCHEMA)}` }], { feature: "automation_builder", userId: guard.user.id, maxTokens: 4000 });
    } catch (retry) {
      return NextResponse.json({ error: retry instanceof Error ? retry.message : "Não foi possível gerar a automação." }, { status: retry instanceof AiError ? retry.status : 502 });
    }
  }

  let result: ReturnType<typeof draftToGraph>;
  try {
    result = draftToGraph(draft, workspace);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "A IA gerou um fluxo inválido. Tente descrever de outro jeito." }, { status: 422 });
  }

  // Sempre em rascunho: a equipe revisa no editor e ativa quando quiser.
  const flow = await prisma.automationFlow.create({
    data: {
      name: result.name,
      description: result.description,
      status: "draft",
      triggerType: triggerTypesOf(result.graph).join(","),
      nodes: result.graph.nodes as unknown as Prisma.InputJsonValue,
      edges: result.graph.edges as unknown as Prisma.InputJsonValue,
      settings: result.settings as unknown as Prisma.InputJsonValue,
      webhookToken: randomBytes(18).toString("hex"),
      createdById: guard.user.id,
    },
    select: { id: true },
  });
  return NextResponse.json({ id: flow.id, name: result.name, steps: result.graph.nodes.length, problems: validateGraph(result.graph) }, { status: 201 });
}
