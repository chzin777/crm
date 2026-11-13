import { describe, expect, it } from "vitest";
import { agentRules, buildSystemPrompt, interpretDecision, preAgentOutcome } from "@/lib/ai/agent-core";
import { defaultQueueHint, humanRequestMode, isBareHumanRequest, queueRoutingBlock, resolveHandoffQueue, ROUTE_NOW, ROUTING_RULES, TRIAGE_NOW } from "@/lib/ai/routing";
import { DEFAULT_AI_SETTINGS } from "@/lib/ai/settings";

const QUEUES = [
  { id: "q-geral", name: "Atendimento Geral", description: "" },
  { id: "q-vendas", name: "Vendas", description: "" },
  { id: "q-pos", name: "Pós-venda", description: "" },
  { id: "q-fin", name: "Financeiro", description: "" },
];
const settings = { ...DEFAULT_AI_SETTINGS, aiChoosesQueue: true, handoffQueueId: "" };

describe("filas ativas no prompt", () => {
  it("lista id, nome e quando usar cada fila, com a regra fixa de roteamento", () => {
    const prompt = buildSystemPrompt({ settings: { ...settings, queueHints: { "q-fin": "boletos e crediário" } }, queues: QUEUES, info: "" });
    expect(prompt).toContain(ROUTING_RULES);
    expect(prompt).toContain('- queue_id "q-vendas": Vendas — usar para: orçamento, compra');
    expect(prompt).toContain('- queue_id "q-pos": Pós-venda — usar para: ajuste, conserto, garantia');
    expect(prompt).toContain('- queue_id "q-fin": Financeiro — usar para: boletos e crediário');
    expect(prompt).toContain('"queue_id"');
    expect(queueRoutingBlock([{ id: "x", name: "Velha", archived: true }], {})).toBe("");
    expect(defaultQueueHint("Atendimento Geral")).toContain("genérico");
  });

  it("sem a IA escolhendo a fila, não há bloco de roteamento", () => {
    expect(agentRules({ ...settings, aiChoosesQueue: false }, QUEUES)).not.toContain("FILAS DE TRANSBORDO");
  });
});

describe("transbordo roteado pelo assunto", () => {
  it("orçamento de óculos + pedido de atendente → transfere direto para Vendas (não Atendimento Geral)", () => {
    const text = "Quero fazer um orçamento de óculos de grau, pode me passar para um atendente?";
    expect(isBareHumanRequest(text, settings.handoffKeywords)).toBe(false);
    const mode = humanRequestMode(settings, { pendingText: text, aiReplies: 0, asked: true });
    expect(mode).toBe("route");
    // A IA devolve o queue_id da fila de vendas; o servidor confirma que existe e está ativa.
    const outcome = interpretDecision({ action: "handoff", reply: "", reason: "Orçamento de óculos de grau", queue_id: "q-vendas" });
    expect(resolveHandoffQueue(QUEUES, { fixedQueueId: "", aiChooses: true, chosen: outcome.queue, currentQueueId: "q-geral" })).toEqual({ queueId: "q-vendas", source: "ai" });
  });

  it('"quero falar com atendente" sem contexto → 1 pergunta de triagem antes de transferir', () => {
    for (const text of ["quero falar com atendente", "Atendente por favor", "oi, quero falar com uma pessoa", "me passa pra um humano"]) {
      expect(isBareHumanRequest(text, settings.handoffKeywords)).toBe(true);
    }
    const asked = { pendingText: "quero falar com atendente", aiReplies: 0 };
    expect(humanRequestMode(settings, { ...asked, asked: true })).toBe("triage");
    // Não transfere antes da IA: ela recebe a instrução de triagem.
    expect(preAgentOutcome(settings, { ...asked, hasMedia: false })).toBeNull();
    expect(TRIAGE_NOW).toContain("NÃO transfira ainda");
    // Depois da pergunta, novo pedido genérico → transfere (fila padrão se continuar sem assunto).
    expect(humanRequestMode(settings, { pendingText: "atendente", aiReplies: 1, asked: true })).toBe("route");
    expect(ROUTE_NOW).toContain("atendimento geral");
  });

  it("sem a IA escolhendo a fila, o pedido de pessoa transfere direto como antes", () => {
    const fixed = { ...settings, aiChoosesQueue: false };
    expect(humanRequestMode(fixed, { pendingText: "quero falar com atendente", aiReplies: 0, asked: true })).toBe("direct");
    expect(preAgentOutcome(fixed, { pendingText: "quero falar com atendente", hasMedia: false, aiReplies: 0 })).toMatchObject({ action: "handoff", trigger: "keyword" });
  });
});

describe("fallback seguro da fila", () => {
  it("queue_id inválido ou inventado → Atendimento Geral", () => {
    expect(resolveHandoffQueue(QUEUES, { fixedQueueId: "", aiChooses: true, chosen: "q-nao-existe", currentQueueId: "q-vendas" })).toEqual({ queueId: "q-geral", source: "fallback" });
  });

  it("assunto genérico (sem fila escolhida) → Atendimento Geral; fila arquivada não vale", () => {
    expect(resolveHandoffQueue(QUEUES, { fixedQueueId: "", aiChooses: true, chosen: "", currentQueueId: null })).toEqual({ queueId: "q-geral", source: "fallback" });
    const archived = QUEUES.map((queue) => (queue.id === "q-pos" ? { ...queue, archived: true } : queue));
    expect(resolveHandoffQueue(archived, { fixedQueueId: "", aiChooses: true, chosen: "q-pos", currentQueueId: null }).source).toBe("fallback");
  });

  it("fila padrão configurada vence o Atendimento Geral; nome da fila também é aceito", () => {
    expect(resolveHandoffQueue(QUEUES, { fixedQueueId: "q-fin", aiChooses: true, chosen: "inexistente", currentQueueId: null })).toEqual({ queueId: "q-fin", source: "fallback" });
    expect(resolveHandoffQueue(QUEUES, { fixedQueueId: "", aiChooses: true, chosen: "pos venda xyz", currentQueueId: null }).source).toBe("fallback");
    expect(resolveHandoffQueue(QUEUES, { fixedQueueId: "", aiChooses: true, chosen: "pos-venda", currentQueueId: null })).toEqual({ queueId: "q-pos", source: "ai" });
    expect(resolveHandoffQueue(QUEUES, { fixedQueueId: "", aiChooses: true, chosen: "Pós-venda", currentQueueId: null })).toEqual({ queueId: "q-pos", source: "ai" });
    expect(resolveHandoffQueue(QUEUES, { fixedQueueId: "q-vendas", aiChooses: false, chosen: "q-pos", currentQueueId: null })).toEqual({ queueId: "q-vendas", source: "fixed" });
  });
});
