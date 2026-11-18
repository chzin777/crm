import { describe, expect, it } from "vitest";
import { advance, triggerMatches, type EnginePorts, type ExecutionState } from "@/lib/automations/engine";
import { NODE_DEF, validateGraph, type FlowEdge, type FlowGraph, type FlowNode, type NodeType } from "@/lib/automations/nodes";
import { applyScore, DEFAULT_THRESHOLDS, readThresholds, thresholdProblems, tierFor } from "@/lib/scoring";
import { displayFieldValue, fieldKey, normalizeFieldValue, readCustomFields } from "@/lib/contact-fields";

const node = (id: string, type: NodeType, config: Record<string, unknown> = {}): FlowNode => ({ id, type, position: { x: 0, y: 0 }, data: { config: { ...NODE_DEF[type].defaults, ...config } } });
const edge = (source: string, target: string): FlowEdge => ({ id: `${source}-out-${target}`, source, target, sourceHandle: null });

describe("níveis e pontuação", () => {
  it("classifica pelas faixas e nunca fica negativo", () => {
    expect(tierFor(0)).toBe("BRONZE");
    expect(tierFor(100)).toBe("PRATA");
    expect(tierFor(299)).toBe("PRATA");
    expect(tierFor(300)).toBe("OURO");
    expect(tierFor(700)).toBe("DIAMANTE");
    expect(applyScore(30, -50)).toEqual({ score: 0, tier: "BRONZE" });
    expect(applyScore(250, 100)).toEqual({ score: 350, tier: "OURO" });
  });

  it("faixas precisam crescer; inválidas voltam ao padrão", () => {
    expect(thresholdProblems({ PRATA: 50, OURO: 200, DIAMANTE: 500 })).toEqual([]);
    expect(thresholdProblems({ PRATA: 300, OURO: 200, DIAMANTE: 500 })).toHaveLength(1);
    expect(thresholdProblems({ PRATA: -1, OURO: 200, DIAMANTE: 500 })).toHaveLength(1);
    expect(readThresholds({ PRATA: 300, OURO: 200, DIAMANTE: 500 })).toEqual(DEFAULT_THRESHOLDS);
    expect(readThresholds({ PRATA: 50, OURO: 200, DIAMANTE: 500 })).toEqual({ PRATA: 50, OURO: 200, DIAMANTE: 500 });
  });
});

describe("campos personalizados", () => {
  it("normaliza número, data, seleção e texto", () => {
    expect(fieldKey("Loja Preferida")).toBe("loja_preferida");
    expect(normalizeFieldValue({ type: "number", options: [] }, "1.250,5")).toBe("1250.5");
    expect(normalizeFieldValue({ type: "number", options: [] }, "abc")).toBeNull();
    expect(normalizeFieldValue({ type: "date", options: [] }, "5/3/2026")).toBe("2026-03-05");
    expect(normalizeFieldValue({ type: "date", options: [] }, "31/02/2026")).toBeNull();
    expect(normalizeFieldValue({ type: "select", options: ["Loja Centro", "Loja Norte"] }, "loja centro")).toBe("Loja Centro");
    expect(normalizeFieldValue({ type: "select", options: ["Loja Centro"] }, "Outra")).toBeNull();
    expect(normalizeFieldValue({ type: "text", options: [] }, "  ")).toBe("");
    expect(displayFieldValue({ type: "date" }, "2026-03-05")).toBe("05/03/2026");
    expect(readCustomFields({ a: "x", b: "", c: null })).toEqual({ a: "x" });
  });
});

describe("gatilhos de pontuação, nível e link", () => {
  it("pontuação atingiu X só ao cruzar a marca", () => {
    const trigger = node("t", "trigger_score", { amount: 300 });
    expect(triggerMatches(trigger, { type: "trigger_score", score: 310, previous: 290 })).toBe(true);
    expect(triggerMatches(trigger, { type: "trigger_score", score: 320, previous: 310 })).toBe(false);
    expect(triggerMatches(trigger, { type: "trigger_score", score: 250, previous: 200 })).toBe(false);
  });

  it("mudou de nível respeita nível alvo e direção", () => {
    const up = node("t", "trigger_tier", { tier: "OURO", direction: "up" });
    expect(triggerMatches(up, { type: "trigger_tier", tier: "OURO", previous: "PRATA" })).toBe(true);
    expect(triggerMatches(up, { type: "trigger_tier", tier: "OURO", previous: "DIAMANTE" })).toBe(false);
    expect(triggerMatches(up, { type: "trigger_tier", tier: "DIAMANTE", previous: "OURO" })).toBe(false);
    const down = node("t", "trigger_tier", { tier: "any", direction: "down" });
    expect(triggerMatches(down, { type: "trigger_tier", tier: "PRATA", previous: "OURO" })).toBe(true);
  });

  it("clique em link filtra por trecho da URL", () => {
    expect(triggerMatches(node("t", "trigger_link_click", { urlContains: "promo" }), { type: "trigger_link_click", url: "https://x.com/promo-natal" })).toBe(true);
    expect(triggerMatches(node("t", "trigger_link_click", { urlContains: "promo" }), { type: "trigger_link_click", url: "https://x.com/catalogo" })).toBe(false);
    expect(triggerMatches(node("t", "trigger_link_click", { urlContains: "" }), { type: "trigger_link_click", url: "https://x.com" })).toBe(true);
  });
});

describe("nós Alterar pontuação e Atualizar campo", () => {
  it("o motor chama as portas com o delta assinado e o campo", async () => {
    const calls: string[] = [];
    const ok = async () => "ok";
    const ports: EnginePorts = {
      now: () => new Date("2026-11-18T13:00:00Z"),
      isOptedOut: async () => false, facts: async () => ({ tags: [], stage: null, city: null }), lastReply: async () => null, nextBusinessTime: async (date) => date,
      sendWhatsApp: ok, aiAgent: ok, moveStage: ok, createOpportunity: ok, addTag: ok, removeTag: ok, assign: ok, notify: ok, optOut: ok, addNote: ok,
      http: async () => ({ status: 200, data: {} }), log: async () => undefined,
      changeScore: async (_s, delta, reason) => { calls.push(`score:${delta}:${reason}`); return "ok"; },
      updateField: async (_s, key, value) => { calls.push(`field:${key}=${value}`); return "ok"; },
    };
    const graph: FlowGraph = {
      nodes: [node("t", "trigger_tag", { tag: "x" }), node("s", "change_score", { operation: "subtract", amount: 50, reason: "Atraso" }), node("f", "update_field", { fieldKey: "loja_preferida", value: "Centro" })],
      edges: [edge("t", "s"), edge("s", "f")],
    };
    expect(validateGraph(graph)).toEqual([]);
    const state: ExecutionState = { id: "e1", flowId: "f1", contactId: "c1", conversationId: null, currentNodeId: null, context: { vars: {}, startedAt: "2026-11-18T12:00:00Z" } };
    const result = await advance(graph, state, ports);
    expect(result.status).toBe("completed");
    expect(calls).toEqual(["score:-50:Atraso", "field:loja_preferida=Centro"]);
  });
});
