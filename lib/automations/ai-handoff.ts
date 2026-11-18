import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { AI_SETTINGS_KEY } from "@/lib/ai/settings";
import { triggerAutomations } from "@/lib/automations/engine-db";
import { NODE_DEF, triggerTypesOf, type FlowEdge, type FlowNode, type NodeType } from "@/lib/automations/nodes";

/**
 * Transbordo da IA em /automacoes: o antigo bloco "Para onde vai" (mensagem ao transferir e fila fixa) vira o fluxo
 * padrão "Transbordo da IA", editável no canvas. A IA continua tirando a conversa dela e pondo na fila do assunto
 * (imediato, à prova de falha); o fluxo cuida do que vem depois (aviso ao cliente, fila/atendente, tags, alertas).
 */
const MARKER_KEY = "automation-ai-handoff-seeded";
export const DEFAULT_HANDOFF_TEXT = "Claro, {{nome}}! Vou te transferir agora mesmo para um dos nossos atendentes. Só um instante!";

const node = (id: string, type: NodeType, x: number, y: number, config: Record<string, unknown> = {}): FlowNode => ({ id, type, position: { x, y }, data: { config: { ...NODE_DEF[type].defaults, ...config } } });
const edge = (source: string, target: string): FlowEdge => ({ id: `${source}-out-${target}`, source, target, sourceHandle: null });

/** Variáveis antigas da mensagem ({cliente}, {fila}) no formato do construtor ({{nome}}, {{fila}}). */
export function handoffTextFromSettings(message: string) {
  const text = message.trim();
  return text ? text.replace(/\{cliente\}/g, "{{nome}}").replace(/\{fila\}/g, "{{fila}}") : DEFAULT_HANDOFF_TEXT;
}

/** Grafo do fluxo padrão a partir da configuração que estava em /ia. */
export function defaultHandoffGraph(settings: { handoffMessage?: unknown; handoffQueueId?: unknown; aiChoosesQueue?: unknown }) {
  const nodes: FlowNode[] = [
    node("gatilho", "trigger_ai_handoff", 0, 0),
    node("aviso", "send_whatsapp", 0, 160, { text: handoffTextFromSettings(typeof settings.handoffMessage === "string" ? settings.handoffMessage : "") }),
  ];
  const edges: FlowEdge[] = [edge("gatilho", "aviso")];
  // Fila fixa sem a IA escolher: a conversa vai sempre para ela.
  const fixed = typeof settings.handoffQueueId === "string" ? settings.handoffQueueId : "";
  if (fixed && settings.aiChoosesQueue === false) {
    nodes.push(node("fila", "assign", 0, 320, { queueId: fixed }));
    edges.push(edge("aviso", "fila"));
  }
  return { nodes, edges };
}

let ensured = false;

/** Cria o fluxo padrão uma única vez (bases existentes e novas); excluído pelo usuário, não volta. */
export async function ensureDefaultHandoffFlow() {
  if (ensured) return;
  const marker = await prisma.crmWorkspaceData.findUnique({ where: { key: MARKER_KEY }, select: { key: true } });
  if (!marker) {
    const row = await prisma.crmWorkspaceData.findUnique({ where: { key: AI_SETTINGS_KEY }, select: { value: true } });
    const settings = (row?.value ?? {}) as Record<string, unknown>;
    const graph = defaultHandoffGraph(settings);
    try {
      await prisma.$transaction([
        prisma.crmWorkspaceData.create({ data: { key: MARKER_KEY, value: { at: new Date().toISOString() } } }),
        prisma.automationFlow.create({
          data: {
            name: "Transbordo da IA (padrão)",
            description: "Quando a IA transfere o atendimento: avisa o cliente e segue para a fila escolhida. Edite para mudar a mensagem, a fila, aplicar tags ou avisar a equipe.",
            status: "active",
            triggerType: triggerTypesOf(graph).join(","),
            nodes: graph.nodes as unknown as Prisma.InputJsonValue,
            edges: graph.edges as unknown as Prisma.InputJsonValue,
          },
        }),
      ]);
    } catch (error) {
      // Outro container (Blue/Green) criou ao mesmo tempo.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    }
  }
  ensured = true;
}

/**
 * IA transferiu: dispara o gatilho "IA transferiu o atendimento". Retorna quantos fluxos começaram; nenhum (sem
 * fluxo ativo, contato em opt-out ou já dentro do fluxo) faz a IA mandar o aviso padrão (nunca transferência muda).
 */
export async function emitAiHandoff(conversation: { id: string; contactId: string }, target: { id: string; name: string } | null, reason: string) {
  await ensureDefaultHandoffFlow().catch((error) => console.error("[automacoes] fluxo padrão de transbordo:", error));
  const started = await triggerAutomations(
    { type: "trigger_ai_handoff", queueId: target?.id ?? null },
    { contactId: conversation.contactId, conversationId: conversation.id, vars: { fila: target?.name ?? "", motivo: reason.slice(0, 300) } },
  );
  return started.length;
}

/** Há fluxo ativo para o transbordo? (a resposta da IA não sai junto com o aviso do fluxo). */
export async function hasActiveHandoffFlow() {
  await ensureDefaultHandoffFlow().catch((error) => console.error("[automacoes] fluxo padrão de transbordo:", error));
  return (await prisma.automationFlow.count({ where: { status: "active", triggerType: { contains: "trigger_ai_handoff" } } })) > 0;
}
