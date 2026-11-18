import { describe, expect, it } from "vitest";
import { advance, delayUntil, inactiveSince, pickTrigger, type EnginePorts, type ExecutionState } from "@/lib/automations/engine";
import { evaluateFilters, NODE_DEF, readDuration, sanitizeGraph, shiftDate, triggerTypesOf, validateGraph, type ContactFacts, type FlowEdge, type FlowGraph, type FlowNode, type NodeFilters, type NodeType } from "@/lib/automations/nodes";

const node = (id: string, type: NodeType, config: Record<string, unknown> = {}): FlowNode => ({ id, type, position: { x: 0, y: 0 }, data: { config: { ...NODE_DEF[type].defaults, ...config } } });
const edge = (source: string, target: string, sourceHandle: string | null = null): FlowEdge => ({ id: `${source}-${target}`, source, target, sourceHandle });
const filters = (rules: NodeFilters["rules"], extra: Partial<NodeFilters> = {}): NodeFilters => ({ combinator: "and", rules, onFail: "skip", ...extra });
const LEAD: ContactFacts = { tags: [], stage: "novo-lead", city: "Goiânia", queueId: null, isCustomer: false, hasPrescription: false };
const CUSTOMER: ContactFacts = { tags: ["VIP"], stage: "ganho", city: "Anápolis", queueId: "q-vendas", isCustomer: true, hasPrescription: true };

function fakePorts(facts: ContactFacts) {
  const calls: string[] = [];
  const logs: { node: string; status: string; message: string }[] = [];
  const ports: EnginePorts = {
    now: () => new Date("2026-11-17T13:00:00Z"),
    isOptedOut: async () => false,
    facts: async () => facts,
    lastReply: async () => null,
    nextBusinessTime: async (date) => date,
    sendWhatsApp: async (_state, input) => { calls.push(`whatsapp:${input.text}`); return "ok"; },
    aiAgent: async () => { calls.push("ai"); return "ok"; },
    moveStage: async (_state, stage) => { calls.push(`stage:${stage}`); return "ok"; },
    createOpportunity: async () => { calls.push("opportunity"); return "ok"; },
    addTag: async (_state, tag) => { calls.push(`tag+:${tag}`); return "ok"; },
    removeTag: async (_state, tag) => { calls.push(`tag-:${tag}`); return "ok"; },
    assign: async () => { calls.push("assign"); return "ok"; },
    notify: async (_state, input) => { calls.push(`notify:${input.title}`); return "ok"; },
    optOut: async () => { calls.push("optout"); return "ok"; },
    addNote: async (_state, input) => { calls.push(`note:${input.target}:${input.text}`); return "ok"; },
    http: async () => ({ status: 200, data: {} }),
    log: async (_state, item, status, message) => { logs.push({ node: item.id, status, message }); },
  };
  return { ports, calls, logs };
}
const state = (currentNodeId: string | null = null): ExecutionState => ({ id: "e1", flowId: "f1", contactId: "c1", conversationId: "conv1", currentNodeId, context: { vars: { nome: "Ana" }, startedAt: "2026-11-17T13:00:00.000Z" } });

describe("múltiplos gatilhos no mesmo fluxo", () => {
  const graph: FlowGraph = {
    nodes: [
      node("t-msg", "trigger_message", { mode: "keywords", keywords: ["orçamento"] }),
      node("t-tag", "trigger_tag", { tag: "vip" }),
      node("a", "send_whatsapp", { text: "Ramo da mensagem" }),
      node("b", "notify", { title: "Ramo da tag" }),
    ],
    edges: [edge("t-msg", "a"), edge("t-tag", "b")],
  };

  it("cada gatilho dispara e a execução começa nele", async () => {
    const byMessage = await pickTrigger(graph, { type: "trigger_message", text: "quero um orcamento" }, async () => LEAD);
    const byTag = await pickTrigger(graph, { type: "trigger_tag", tag: "VIP" }, async () => LEAD);
    expect(byMessage?.id).toBe("t-msg");
    expect(byTag?.id).toBe("t-tag");
    expect(await pickTrigger(graph, { type: "trigger_stage", stage: "ganho" }, async () => LEAD)).toBeNull();

    const first = fakePorts(LEAD);
    await advance(graph, state(byMessage!.id), first.ports);
    expect(first.calls).toEqual(["whatsapp:Ramo da mensagem"]);
    const second = fakePorts(LEAD);
    await advance(graph, state(byTag!.id), second.ports);
    expect(second.calls).toEqual(["notify:Ramo da tag"]);
  });

  it("gatilho cujas regras não batem é ignorado; o fluxo é válido com os dois gatilhos e grava os dois tipos", async () => {
    const filtered: FlowGraph = { ...graph, nodes: graph.nodes.map((item) => (item.id === "t-msg" ? node("t-msg", "trigger_message", { mode: "any", filters: filters([{ kind: "contact_type", op: "customer" }]) }) : item)) };
    expect(await pickTrigger(filtered, { type: "trigger_message", text: "oi" }, async () => LEAD)).toBeNull();
    expect((await pickTrigger(filtered, { type: "trigger_message", text: "oi" }, async () => CUSTOMER))?.id).toBe("t-msg");
    expect(validateGraph(graph)).toEqual([]);
    expect(triggerTypesOf(graph)).toEqual(["trigger_message", "trigger_tag"]);
    expect(validateGraph({ nodes: [...graph.nodes, node("t-3", "trigger_webhook")], edges: graph.edges })).toEqual(['Conecte o gatilho "Webhook externo" ao primeiro passo.']);
  });
});

describe("unidades de tempo (segundos a anos)", () => {
  const now = new Date("2026-01-31T12:00:00.000Z");
  it.each([
    ["seconds", 30, "2026-01-31T12:00:30.000Z", "2026-01-31T11:59:30.000Z"],
    ["minutes", 15, "2026-01-31T12:15:00.000Z", "2026-01-31T11:45:00.000Z"],
    ["hours", 5, "2026-01-31T17:00:00.000Z", "2026-01-31T07:00:00.000Z"],
    ["days", 2, "2026-02-02T12:00:00.000Z", "2026-01-29T12:00:00.000Z"],
    ["months", 1, "2026-02-28T12:00:00.000Z", "2025-12-31T12:00:00.000Z"],
    ["years", 2, "2028-01-31T12:00:00.000Z", "2024-01-31T12:00:00.000Z"],
  ])("%s: delay soma e inatividade subtrai", (unit, amount, after, before) => {
    expect(delayUntil(now, { amount, unit }).toISOString()).toBe(after);
    expect(inactiveSince(now, { amount, unit }).toISOString()).toBe(before);
  });

  it("nó antigo salvo só com days continua valendo (inatividade e delay)", () => {
    expect(readDuration({ days: 90 })).toEqual({ amount: 90, unit: "days" });
    const graph = sanitizeGraph({ nodes: [{ id: "t", type: "trigger_inactive", position: { x: 0, y: 0 }, data: { config: { days: 120 } } }], edges: [] });
    expect(graph.nodes[0].data.config).toMatchObject({ amount: 120, unit: "days" });
    expect(graph.nodes[0].data.config.days).toBeUndefined();
    expect(inactiveSince(now, graph.nodes[0].data.config).toISOString()).toBe("2025-10-03T12:00:00.000Z");
  });

  it("limite de segurança de 10 anos", () => {
    expect(shiftDate(now, 500, "years").getUTCFullYear()).toBeLessThanOrEqual(2036);
  });

  it("delay em segundos pausa e retoma no motor", async () => {
    const graph: FlowGraph = { nodes: [node("t", "trigger_tag", { tag: "x" }), node("d", "delay", { amount: 45, unit: "seconds" }), node("m", "send_whatsapp", { text: "oi" })], edges: [edge("t", "d"), edge("d", "m")] };
    const { ports, calls } = fakePorts(LEAD);
    const first = await advance(graph, state(), ports);
    expect(first.status === "waiting" && first.resumeAt.toISOString()).toBe("2026-11-17T13:00:45.000Z");
    await advance(graph, first.state, ports);
    expect(calls).toEqual(["whatsapp:oi"]);
  });
});

describe("regras & filtros e bifurcação se/senão", () => {
  it("fila: sem fila, fila específica, fora da fila e qualquer", () => {
    expect(evaluateFilters(filters([{ kind: "queue", op: "none" }]), LEAD)).toBe(true);
    expect(evaluateFilters(filters([{ kind: "queue", op: "none" }]), CUSTOMER)).toBe(false);
    expect(evaluateFilters(filters([{ kind: "queue", op: "in", value: "q-vendas" }]), CUSTOMER)).toBe(true);
    expect(evaluateFilters(filters([{ kind: "queue", op: "in", value: "q-vendas" }]), LEAD)).toBe(false);
    expect(evaluateFilters(filters([{ kind: "queue", op: "not_in", value: "q-vendas" }]), LEAD)).toBe(true);
    expect(evaluateFilters(filters([{ kind: "queue", op: "any" }]), LEAD)).toBe(true);
  });

  it("lead x cliente recorrente, etapa, tag, cidade, receita e combinação E/OU", () => {
    expect(evaluateFilters(filters([{ kind: "contact_type", op: "lead" }]), LEAD)).toBe(true);
    expect(evaluateFilters(filters([{ kind: "contact_type", op: "lead" }]), CUSTOMER)).toBe(false);
    expect(evaluateFilters(filters([{ kind: "contact_type", op: "customer" }]), CUSTOMER)).toBe(true);
    expect(evaluateFilters(filters([{ kind: "stage", op: "not_in", value: "ganho" }]), LEAD)).toBe(true);
    expect(evaluateFilters(filters([{ kind: "tag", op: "has", value: "vip" }]), CUSTOMER)).toBe(true);
    expect(evaluateFilters(filters([{ kind: "city", op: "equals", value: "goiania" }]), LEAD)).toBe(true);
    expect(evaluateFilters(filters([{ kind: "city", op: "empty" }]), LEAD)).toBe(false);
    expect(evaluateFilters(filters([{ kind: "prescription", op: "yes" }]), CUSTOMER)).toBe(true);
    const mixed = [{ kind: "contact_type", op: "customer" }, { kind: "queue", op: "none" }] as NodeFilters["rules"];
    expect(evaluateFilters(filters(mixed), LEAD)).toBe(false);
    expect(evaluateFilters(filters(mixed, { combinator: "or" }), LEAD)).toBe(true);
  });

  it("condição só por regras: true segue o ramo A (Sim), false o ramo B (Não)", async () => {
    const graph: FlowGraph = {
      nodes: [node("t", "trigger_tag", { tag: "x" }), node("c", "condition", { field: "none", filters: filters([{ kind: "contact_type", op: "customer" }, { kind: "queue", op: "in", value: "q-vendas" }]) }), node("a", "move_stage", { stage: "recompra" }), node("b", "create_opportunity")],
      edges: [edge("t", "c"), edge("c", "a", "true"), edge("c", "b", "false")],
    };
    const customer = fakePorts(CUSTOMER);
    await advance(graph, state(), customer.ports);
    expect(customer.calls).toEqual(["stage:recompra"]);
    const lead = fakePorts(LEAD);
    await advance(graph, state(), lead.ports);
    expect(lead.calls).toEqual(["opportunity"]);
    expect(lead.logs.find((item) => item.node === "c")?.message).toContain("caminho Não");
  });

  it("ação com regras não atendidas: pula e segue (skip) ou encerra o ramo (stop), com log", async () => {
    const make = (onFail: "skip" | "stop"): FlowGraph => ({
      nodes: [node("t", "trigger_tag", { tag: "x" }), node("m", "send_whatsapp", { text: "Só para leads", filters: filters([{ kind: "contact_type", op: "lead" }], { onFail }) }), node("n", "notify", { title: "Fim" })],
      edges: [edge("t", "m"), edge("m", "n")],
    });
    const skip = fakePorts(CUSTOMER);
    expect((await advance(make("skip"), state(), skip.ports)).status).toBe("completed");
    expect(skip.calls).toEqual(["notify:Fim"]);
    expect(skip.logs.find((item) => item.node === "m")).toMatchObject({ status: "skipped", message: expect.stringContaining("passo pulado") });

    const stop = fakePorts(CUSTOMER);
    expect((await advance(make("stop"), state(), stop.ports)).status).toBe("completed");
    expect(stop.calls).toEqual([]);
    expect(stop.logs.at(-1)).toMatchObject({ node: "m", status: "skipped", message: expect.stringContaining("ramo encerrado") });

    const lead = fakePorts(LEAD);
    await advance(make("stop"), state(), lead.ports);
    expect(lead.calls).toEqual(["whatsapp:Só para leads", "notify:Fim"]);
  });
});
