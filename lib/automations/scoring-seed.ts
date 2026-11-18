import "server-only";
import { randomBytes } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { firstDispatch } from "@/lib/chat/conversation";
import { markScoringSeeded, readScoringSettings } from "@/lib/scoring-db";
import { NODE_DEF, triggerTypesOf, type FlowEdge, type FlowGraph, type FlowNode, type NodeType } from "@/lib/automations/nodes";

/**
 * Automações padrão do Lead Score: criadas uma única vez (ativas) em /automacoes, onde a equipe edita pontos,
 * motivos ou desliga cada regra. Nada de pontuação fica fixo no código. Excluir uma não faz ela voltar.
 */

const node = (id: string, type: NodeType, y: number, config: Record<string, unknown> = {}): FlowNode => ({ id, type, position: { x: 0, y }, data: { config: { ...NODE_DEF[type].defaults, ...config } } });
const edge = (source: string, target: string): FlowEdge => ({ id: `${source}-out-${target}`, source, target, sourceHandle: null });
const scoreFlow = (trigger: FlowNode, operation: "add" | "subtract", amount: number, reason: string): FlowGraph => ({
  nodes: [trigger, node("pontos", "change_score", 160, { operation, amount, reason })],
  edges: [edge(trigger.id, "pontos")],
});

export const DEFAULT_SCORING_FLOWS: { name: string; description: string; graph: FlowGraph }[] = [
  { name: "Lead Score: respondeu no WhatsApp", description: "+5 pontos a cada mensagem do cliente no WhatsApp.", graph: scoreFlow(node("gatilho", "trigger_message", 0, { mode: "any", keywords: [] }), "add", 5, "Respondeu no WhatsApp") },
  { name: "Lead Score: clicou em link rastreado", description: "+10 pontos quando o cliente abre um link rastreado.", graph: scoreFlow(node("gatilho", "trigger_link_click", 0), "add", 10, "Clicou em link rastreado") },
  { name: "Lead Score: compra concluída no VMSet", description: "+100 pontos a cada venda faturada no VMSet.", graph: scoreFlow(node("gatilho", "trigger_erp_sale", 0), "add", 100, "Compra concluída no VMSet ({{venda.valor}})") },
  { name: "Lead Score: parcela em atraso", description: "−50 pontos quando uma parcela do crediário/carnê fica 5 dias em atraso.", graph: scoreFlow(node("gatilho", "trigger_erp_overdue", 0, { amount: 5, unit: "days" }), "subtract", 50, "Parcela em atraso há 5 dias") },
];

let done = false;

/** Cria as automações padrão uma vez (reserva entre os containers Blue/Green). */
export async function ensureScoringFlows() {
  if (done) return 0;
  if ((await readScoringSettings()).seeded) { done = true; return 0; }
  if (!(await firstDispatch("automation-scoring-seed:v1"))) { done = true; return 0; }
  for (const flow of DEFAULT_SCORING_FLOWS) {
    await prisma.automationFlow.create({
      data: {
        name: flow.name, description: flow.description, status: "active", triggerType: triggerTypesOf(flow.graph).join(","),
        nodes: flow.graph.nodes as unknown as Prisma.InputJsonValue, edges: flow.graph.edges as unknown as Prisma.InputJsonValue,
        webhookToken: randomBytes(18).toString("hex"),
      },
    });
  }
  await markScoringSeeded();
  done = true;
  return DEFAULT_SCORING_FLOWS.length;
}
