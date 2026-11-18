import { describe, expect, it } from "vitest";
import { advance, type EnginePorts, type ExecutionState, type NodeCountKind } from "@/lib/automations/engine";
import { NODE_DEF, outputHandles, pickSeller, readDistribute, readFlowSettings, validateGraph, type FlowEdge, type FlowGraph, type FlowNode, type NodeType, type SellerCandidate } from "@/lib/automations/nodes";
import { extractLead, flattenPayload, guessField, leadPhone, payloadVars } from "@/lib/automations/webhook-lead";
import { compactCount, percent } from "@/lib/automations/metrics";
import { draftToGraph } from "@/lib/automations/ai-builder";

const node = (id: string, type: NodeType, config: Record<string, unknown> = {}): FlowNode => ({ id, type, position: { x: 0, y: 0 }, data: { config: { ...NODE_DEF[type].defaults, ...config } } });
const edge = (source: string, target: string, sourceHandle: string | null = null): FlowEdge => ({ id: `${source}-${sourceHandle ?? "out"}-${target}`, source, target, sourceHandle });
const seller = (id: string, extra: Partial<SellerCandidate> = {}): SellerCandidate => ({ id, name: id.toUpperCase(), online: true, paused: false, load: 0, capacity: 0, ...extra });

describe("roleta de vendedores", () => {
  const rule = { mode: "round_robin" as const, onlyOnline: true, maxActive: 0 };
  it("rodízio gira pela lista e pula quem está offline, pausado ou no limite", () => {
    const list = [seller("a"), seller("b"), seller("c")];
    expect([0, 1, 2, 3].map((cursor) => pickSeller(list, rule, cursor)?.id)).toEqual(["a", "b", "c", "a"]);
    const mixed = [seller("a"), seller("b", { online: false }), seller("c", { paused: true }), seller("d", { load: 3 })];
    expect(pickSeller(mixed, rule, 1)?.id).toBe("d");
    expect(pickSeller(mixed, { ...rule, maxActive: 3 }, 1)?.id).toBe("a");
    expect(pickSeller([seller("a", { load: 2, capacity: 2 })], rule, 0)).toBeNull();
    expect(pickSeller([seller("a", { online: false })], { ...rule, onlyOnline: false }, 0)?.id).toBe("a");
  });

  it("menor carga escolhe quem tem menos atendimentos (empate: ordem da lista)", () => {
    const list = [seller("a", { load: 4 }), seller("b", { load: 1 }), seller("c", { load: 1 })];
    expect(pickSeller(list, { ...rule, mode: "least_load" }, 0)?.id).toBe("b");
  });

  it("configuração, saídas e validação do nó", () => {
    expect(readDistribute({ pool: "users", userIds: ["x", "x", ""], maxActive: -2 })).toMatchObject({ pool: "users", userIds: ["x"], maxActive: 0, onlyOnline: true, mode: "round_robin" });
    expect(outputHandles("distribute_lead", {})?.map((item) => item.id)).toEqual(["assigned", "unavailable"]);
    const graph: FlowGraph = { nodes: [node("t", "trigger_tag", { tag: "x" }), node("r", "distribute_lead")], edges: [edge("t", "r")] };
    expect(validateGraph(graph)).toContain("Roleta de vendedores: escolha a fila / loja.");
  });

  it("o motor segue pela saída do resultado e conta entradas por nó", async () => {
    const counts: string[] = [];
    const ok = async () => "ok";
    const ports = (assigned: boolean): EnginePorts => ({
      now: () => new Date("2026-11-18T13:00:00Z"), isOptedOut: async () => false, facts: async () => ({ tags: [], stage: null, city: null }), lastReply: async () => null, nextBusinessTime: async (date) => date,
      sendWhatsApp: async (_s, input) => { counts.push(`msg:${input.text}`); return "ok"; }, aiAgent: ok, moveStage: ok, createOpportunity: ok, addTag: ok, removeTag: ok, assign: ok, notify: async () => { counts.push("notify"); return "ok"; }, optOut: ok, addNote: ok,
      http: async () => ({ status: 200, data: {} }), log: async () => undefined,
      distribute: async () => ({ assigned, message: assigned ? "Distribuído" : "Ninguém" }),
      count: async (_s, item, kinds: NodeCountKind[]) => { counts.push(`${item.id}:${kinds.join("+")}`); },
    });
    const graph: FlowGraph = {
      nodes: [node("t", "trigger_tag", { tag: "x" }), node("r", "distribute_lead", { queueId: "q" }), node("m", "send_whatsapp", { text: "oi" }), node("n", "notify")],
      edges: [edge("t", "r"), edge("r", "m", "assigned"), edge("r", "n", "unavailable")],
    };
    const state: ExecutionState = { id: "e", flowId: "f", contactId: "c", conversationId: null, currentNodeId: null, context: { vars: {}, startedAt: "2026-11-18T12:00:00Z" } };
    await advance(graph, state, ports(true));
    expect(counts).toEqual(["t:entered+completed", "r:entered+completed", "msg:oi", "m:entered+completed"]);
    counts.length = 0;
    await advance(graph, state, ports(false));
    expect(counts).toEqual(["t:entered+completed", "r:entered+completed", "notify", "n:entered+completed"]);
  });

  it("gerador por IA liga as saídas da roleta", () => {
    const { graph } = draftToGraph({
      name: "Roleta", description: "",
      trigger: { type: "trigger_webhook", params: null, filters: null },
      steps: [
        { id: "s2", type: "distribute_lead", params: { pool: "queue", queueId: "q1", mode: "least_load" }, next: "s3", nextFalse: "s4" },
        { id: "s3", type: "send_whatsapp", params: { text: "Oi" } },
        { id: "s4", type: "notify", params: { title: "Sem vendedor" } },
      ],
    }, { queues: [{ id: "q1", name: "Vendas" }], users: [] });
    const roulette = graph.nodes.find((item) => item.type === "distribute_lead")!;
    expect(graph.edges.filter((item) => item.source === roulette.id).map((item) => item.sourceHandle).sort()).toEqual(["assigned", "unavailable"]);
    expect(roulette.data.config).toMatchObject({ queueId: "q1", mode: "least_load" });
  });
});

describe("webhook de entrada", () => {
  it("achata JSON aninhado, listas e o formato field_data da Meta", () => {
    const fields = flattenPayload({ lead: { full_name: "Ana Souza", phone_number: "+55 (62) 99999-0000" }, field_data: [{ name: "email", values: ["ANA@X.COM"] }], utm_source: "facebook", answers: [{ text: "sim" }] });
    expect(fields).toMatchObject({ "lead.full_name": "Ana Souza", "lead.phone_number": "+55 (62) 99999-0000", "field_data.email": "ANA@X.COM", utm_source: "facebook", "answers.0.text": "sim" });
    expect(guessField(fields, "phone")).toBe("lead.phone_number");
    expect(extractLead(fields, {})).toEqual({ phone: "5562999990000", name: "Ana Souza", email: "ana@x.com", source: "facebook" });
    expect(extractLead(fields, { name: "answers.0.text" }).name).toBe("sim");
    expect(payloadVars(fields)).toMatchObject({ lead_full_name: "Ana Souza", utm_source: "facebook" });
  });

  it("normaliza telefone do Brasil e junta nome + sobrenome", () => {
    expect(leadPhone("(62) 3333-4444")).toBe("556233334444");
    expect(leadPhone("062999990000")).toBe("5562999990000");
    expect(leadPhone("123")).toBe("");
    expect(extractLead({ first_name: "Ana", last_name: "Souza", telefone: "62999990000" }, {}).name).toBe("Ana Souza");
  });
});

describe("métricas", () => {
  it("janela de atribuição e formatos dos badges", () => {
    expect(readFlowSettings({ attributionDays: 15 }).attributionDays).toBe(15);
    expect(readFlowSettings({ attributionDays: 999 }).attributionDays).toBe(90);
    expect(readFlowSettings({ attributionDays: "x" }).attributionDays).toBe(7);
    expect(compactCount(950)).toBe("950");
    expect(compactCount(1250)).toBe("1,3 mil");
    expect(percent(1, 3)).toBe(33);
    expect(percent(5, 0)).toBe(0);
  });
});
