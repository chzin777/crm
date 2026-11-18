import { describe, expect, it } from "vitest";
import { advance, type EnginePorts, type ExecutionState } from "@/lib/automations/engine";
import { describeBusinessWindow, nextBusinessOpening, NODE_DEF, outputHandles, pickVariant, readFlowSettings, sanitizeGraph, validateGraph, type FlowEdge, type FlowGraph, type FlowNode, type NodeType } from "@/lib/automations/nodes";
import { draftToGraph } from "@/lib/automations/ai-builder";

const node = (id: string, type: NodeType, config: Record<string, unknown> = {}): FlowNode => ({ id, type, position: { x: 0, y: 0 }, data: { config: { ...NODE_DEF[type].defaults, ...config } } });
const edge = (source: string, target: string, sourceHandle: string | null = null): FlowEdge => ({ id: `${source}-${sourceHandle ?? "out"}-${target}`, source, target, sourceHandle });

function fakePorts(options: { now?: Date; reply?: string | null; random?: number } = {}) {
  const calls: string[] = [];
  const ok = async () => "ok";
  const ports: EnginePorts = {
    now: () => options.now ?? new Date("2026-11-18T13:00:00Z"),
    isOptedOut: async () => false, facts: async () => ({ tags: [], stage: null, city: null }), lastReply: async () => options.reply ?? null, nextBusinessTime: async (date) => date,
    sendWhatsApp: async (_s, input) => { calls.push(`whatsapp:${input.text}`); return "ok"; },
    aiAgent: ok, moveStage: ok, createOpportunity: ok, addTag: ok, removeTag: ok, assign: ok, notify: ok, optOut: ok, addNote: ok,
    http: async () => ({ status: 200, data: {} }), log: async () => undefined,
    gotoFlow: async (_s, flowId) => { calls.push(`goto:${flowId}`); return "ok"; },
    random: () => options.random ?? 0,
  };
  return { ports, calls };
}

const state = (current: string | null = null): ExecutionState => ({ id: "e1", flowId: "f1", contactId: "c1", conversationId: null, currentNodeId: current, context: { vars: {}, startedAt: "2026-11-18T12:00:00Z" } });

describe("janela de horário comercial", () => {
  const config = { days: [1, 2, 3, 4, 5, 6], start: "08:00", end: "18:00" };
  it("dentro da janela segue na hora; fora, abre no próximo dia útil (Brasília)", () => {
    // Quarta 10:00 em Brasília (13:00 UTC): dentro.
    expect(nextBusinessOpening(new Date("2026-11-18T13:00:00Z"), config)).toBeNull();
    // Quarta 19:00 em Brasília: abre quinta 08:00 (11:00 UTC).
    expect(nextBusinessOpening(new Date("2026-11-18T22:00:00Z"), config)?.toISOString()).toBe("2026-11-19T11:00:00.000Z");
    // Sábado 20:00: domingo fechado, abre segunda 08:00.
    expect(nextBusinessOpening(new Date("2026-11-21T23:00:00Z"), config)?.toISOString()).toBe("2026-11-23T11:00:00.000Z");
    // Segunda 06:00: abre no mesmo dia às 08:00.
    expect(nextBusinessOpening(new Date("2026-11-23T09:00:00Z"), config)?.toISOString()).toBe("2026-11-23T11:00:00.000Z");
    expect(describeBusinessWindow(config)).toBe("Seg–Sáb · 08:00–18:00");
  });

  it("o motor suspende fora da janela e retoma na abertura", async () => {
    const graph: FlowGraph = { nodes: [node("t", "trigger_tag", { tag: "x" }), node("h", "business_hours", config), node("m", "send_whatsapp", { text: "oi" })], edges: [edge("t", "h"), edge("h", "m")] };
    const { ports, calls } = fakePorts({ now: new Date("2026-11-18T22:00:00Z") });
    const first = await advance(graph, state(), ports);
    expect(first.status).toBe("waiting");
    if (first.status !== "waiting") return;
    expect(first.resumeAt.toISOString()).toBe("2026-11-19T11:00:00.000Z");
    expect(calls).toEqual([]);
    const second = await advance(graph, first.state, ports);
    expect(second.status).toBe("completed");
    expect(calls).toEqual(["whatsapp:oi"]);
  });
});

describe("aguardar resposta com timeout", () => {
  const graph: FlowGraph = {
    nodes: [node("t", "trigger_tag", { tag: "x" }), node("w", "wait_reply", { amount: 2, unit: "hours" }), node("yes", "send_whatsapp", { text: "obrigado" }), node("no", "send_whatsapp", { text: "follow-up" })],
    edges: [edge("t", "w"), edge("w", "yes", "replied"), edge("w", "no", "timeout")],
  };
  it("pausa pelo prazo e segue por Respondeu ou Timeout", async () => {
    const waiting = await advance(graph, state(), fakePorts().ports);
    expect(waiting.status).toBe("waiting");
    if (waiting.status !== "waiting") return;
    expect(waiting.resumeAt.toISOString()).toBe("2026-11-18T15:00:00.000Z");
    const replied = fakePorts({ reply: "quero sim" });
    await advance(graph, waiting.state, replied.ports);
    expect(replied.calls).toEqual(["whatsapp:obrigado"]);
    const silent = fakePorts();
    await advance(graph, waiting.state, silent.ports);
    expect(silent.calls).toEqual(["whatsapp:follow-up"]);
  });
  it("saídas rotuladas no nó", () => {
    expect(outputHandles("wait_reply", {})?.map((item) => item.id)).toEqual(["replied", "timeout"]);
  });
});

describe("teste A/B", () => {
  it("sorteio ponderado e variante gravada na execução", async () => {
    expect(pickVariant([70, 30], 0.69)).toBe(0);
    expect(pickVariant([70, 30], 0.71)).toBe(1);
    const graph: FlowGraph = {
      nodes: [node("t", "trigger_tag", { tag: "x" }), node("ab", "ab_split", { variants: [70, 30] }), node("a", "send_whatsapp", { text: "A" }), node("b", "send_whatsapp", { text: "B" })],
      edges: [edge("t", "ab"), edge("ab", "a", "v0"), edge("ab", "b", "v1")],
    };
    const { ports, calls } = fakePorts({ random: 0.9 });
    const result = await advance(graph, state(), ports);
    expect(calls).toEqual(["whatsapp:B"]);
    expect(result.state.context.variants).toEqual({ ab: "B" });
    expect(result.state.context.vars.variante).toBe("B");
  });
  it("valida a soma de 100% e o mínimo de 2 variantes", () => {
    const graph = (variants: number[]): FlowGraph => ({ nodes: [node("t", "trigger_tag", { tag: "x" }), node("ab", "ab_split", { variants })], edges: [edge("t", "ab")] });
    expect(validateGraph(graph([60, 30]))).toContain("Teste A/B: a soma dos percentuais precisa ser 100%.");
    expect(validateGraph(graph([100]))).toContain("Teste A/B: crie ao menos 2 variantes.");
    expect(validateGraph(graph([50, 25, 25]))).toEqual([]);
  });
});

describe("encerrar / ir para outra automação", () => {
  it("encerra na hora ou encaminha", async () => {
    const base = (config: Record<string, unknown>): FlowGraph => ({ nodes: [node("t", "trigger_tag", { tag: "x" }), node("e", "end_flow", config), node("m", "send_whatsapp", { text: "nunca" })], edges: [edge("t", "e"), edge("e", "m")] });
    // Encerrar não tem saída: a conexão some ao ler o grafo.
    expect(sanitizeGraph(base({ mode: "end" })).edges).toHaveLength(1);
    const end = fakePorts();
    expect((await advance(base({ mode: "end" }), state(), end.ports)).status).toBe("completed");
    expect(end.calls).toEqual([]);
    const goto = fakePorts();
    await advance(base({ mode: "goto", flowId: "f2" }), state(), goto.ports);
    expect(goto.calls).toEqual(["goto:f2"]);
    expect(validateGraph(base({ mode: "goto", flowId: "" }))).toContain("Ir para outra automação: escolha a automação de destino.");
  });
  it("configurações globais: só conversões conhecidas", () => {
    expect(readFlowSettings({ cancelOnConversion: ["purchase", "won", "x", "won"] })).toEqual({ cancelOnConversion: ["purchase", "won"] });
    expect(readFlowSettings(null)).toEqual({ cancelOnConversion: [] });
  });
});

describe("gerador por IA com os novos nós", () => {
  it("liga Respondeu/Timeout, variantes e cancelamento por conversão", () => {
    const result = draftToGraph({
      name: "Follow-up", description: "", cancelOnConversion: ["purchase", "won"],
      trigger: { type: "trigger_tag", params: { tag: "orcamento" }, filters: null },
      steps: [
        { id: "h", type: "business_hours", params: { days: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" }, next: "ab" },
        { id: "ab", type: "ab_split", params: { variants: [50, 50] }, nextVariants: ["a", "b"] },
        { id: "a", type: "send_whatsapp", params: { text: "Oi A" }, next: "w" },
        { id: "b", type: "send_whatsapp", params: { text: "Oi B" }, next: "w" },
        { id: "w", type: "wait_reply", params: { amount: 1, unit: "days" }, nextReplied: null, nextTimeout: "f" },
        { id: "f", type: "send_whatsapp", params: { text: "Ainda tem interesse?" }, next: null },
      ],
    }, { queues: [], users: [] });
    const handles = result.graph.edges.map((item) => item.sourceHandle).filter(Boolean);
    expect(handles).toEqual(expect.arrayContaining(["v0", "v1", "timeout"]));
    expect(result.settings.cancelOnConversion).toEqual(["purchase", "won"]);
    expect(result.graph.nodes.find((item) => item.type === "business_hours")?.data.config.days).toEqual([1, 2, 3, 4, 5]);
    expect(validateGraph(result.graph)).toEqual([]);
  });
});
