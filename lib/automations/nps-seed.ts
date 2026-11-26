import "server-only";
import { randomBytes } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { firstDispatch } from "@/lib/chat/conversation";
import { triggerTypesOf } from "@/lib/automations/nodes";
import { NPS_FLOWS } from "@/lib/automations/templates";

let done = false;
const SEED_KEY = "automation-nps-seed";

/**
 * Cria uma única vez (reserva entre os containers blue/green) as duas automações de NPS pós-compra em rascunho:
 * a equipe vincula o modelo aprovado da Meta e ativa. Excluir uma não faz ela voltar.
 */
export async function ensureNpsFlows() {
  if (done) return 0;
  done = true;
  // Marca permanente (a reserva em ChatDispatch é limpa depois de alguns dias).
  if (await prisma.crmWorkspaceData.findUnique({ where: { key: SEED_KEY }, select: { key: true } })) return 0;
  if (!(await firstDispatch(`${SEED_KEY}:v1`))) return 0;
  await prisma.crmWorkspaceData.upsert({ where: { key: SEED_KEY }, create: { key: SEED_KEY, value: { seededAt: new Date().toISOString() } }, update: {} });
  for (const flow of NPS_FLOWS) {
    await prisma.automationFlow.create({
      data: {
        name: flow.name, description: flow.description, status: "draft", triggerType: triggerTypesOf(flow.graph).join(","),
        nodes: flow.graph.nodes as unknown as Prisma.InputJsonValue, edges: flow.graph.edges as unknown as Prisma.InputJsonValue,
        webhookToken: randomBytes(18).toString("hex"),
      },
    });
  }
  return NPS_FLOWS.length;
}
