import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  executions: [] as { id: string; contactId: string; status: string; currentNodeId: string | null }[],
  logs: [] as { executionId: string; status: string; message: string }[],
  optedOut: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/meta-whatsapp", () => ({ sendText: vi.fn() }));
vi.mock("@/lib/chat/outbound", () => ({ sendAutomaticMessage: vi.fn(), sendAutomaticImage: vi.fn() }));
vi.mock("@/lib/chat/conversation", () => ({ addSystemMessage: vi.fn(), firstDispatch: vi.fn(async () => true), isWindowOpen: () => true }));
vi.mock("@/lib/chat/menu", () => ({ readMenuState: () => ({}), saveMenuState: vi.fn() }));
vi.mock("@/lib/chat/operations", () => ({ hoursFor: vi.fn(async () => null) }));
vi.mock("@/lib/chat/events", () => ({ notifyChatChange: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    contact: {
      updateMany: vi.fn(async ({ data }: { data: { marketingOptOut: boolean } }) => { if (data.marketingOptOut) db.optedOut.push("c1"); return { count: 1 }; }),
      findMany: vi.fn(async () => [{ id: "c1" }]),
    },
    automationExecution: {
      findMany: vi.fn(async ({ where }: { where: { contactId: { in: string[] } } }) => db.executions.filter((item) => where.contactId.in.includes(item.contactId) && ["running", "waiting"].includes(item.status))),
      updateMany: vi.fn(async ({ where, data }: { where: { id: { in: string[] } }; data: { status: string } }) => {
        let count = 0;
        for (const item of db.executions) if (where.id.in.includes(item.id) && ["running", "waiting"].includes(item.status)) { item.status = data.status; count += 1; }
        return { count };
      }),
    },
    automationStepLog: { createMany: vi.fn(async ({ data }: { data: { executionId: string; status: string; message: string }[] }) => { db.logs.push(...data); return { count: data.length }; }) },
  },
}));

import { advance, evaluateCondition, renderTemplate, triggerMatches, type EnginePorts, type ExecutionState } from "@/lib/automations/engine";
import { NODE_DEF, sanitizeGraph, validateGraph, type FlowEdge, type FlowGraph, type FlowNode, type NodeType } from "@/lib/automations/nodes";
import { addedTags, stageChanges } from "@/lib/automations/events";
import { FLOW_TEMPLATES } from "@/lib/automations/templates";
import { applyOptOutCommand } from "@/lib/marketing-opt-out-db";

const node = (id: string, type: NodeType, config: Record<string, unknown> = {}): FlowNode => ({ id, type, position: { x: 0, y: 0 }, data: { config: { ...NODE_DEF[type].defaults, ...config } } });
const edge = (source: string, target: string, sourceHandle: string | null = null): FlowEdge => ({ id: `${source}-${target}`, source, target, sourceHandle });

/** Gatilho → Aguardar 2 h → Condição (respondeu?) → Não: WhatsApp → Mover etapa → Notificar; Sim: Notificar equipe. */
const GRAPH: FlowGraph = {
  nodes: [
    node("t", "trigger_stage", { stage: "em-atendimento" }),
    node("d", "delay", { amount: 2, unit: "hours" }),
    node("c", "condition", { field: "reply", operator: "exists" }),
    node("m", "send_whatsapp", { text: "Oi {{nome}}, conseguiu ver o orçamento?" }),
    node("s", "move_stage", { stage: "fechamento" }),
    node("n", "notify", { title: "Follow-up: {{nome}}", message: "Cliente de {{cidade}}" }),
    node("y", "notify", { title: "Respondeu: {{nome}}" }),
  ],
  edges: [edge("t", "d"), edge("d", "c"), edge("c", "m", "false"), edge("m", "s"), edge("s", "n"), edge("c", "y", "true")],
};

function fakePorts(options: { reply?: string | null; optedOut?: () => boolean; start?: Date } = {}) {
  let now = options.start ?? new Date("2026-11-17T13:00:00Z");
  const calls: string[] = [];
  const logs: { node: string; status: string; message: string }[] = [];
  const ports: EnginePorts = {
    now: () => now,
    isOptedOut: async () => options.optedOut?.() ?? false,
    facts: async () => ({ tags: ["vip"], stage: "em-atendimento", city: "Goiânia" }),
    lastReply: async () => options.reply ?? null,
    nextBusinessTime: async (date) => date,
    sendWhatsApp: async (_state, input) => { calls.push(`whatsapp:${input.text}`); return "enviada"; },
    aiAgent: async () => { calls.push("ai"); return "ia"; },
    moveStage: async (_state, stage) => { calls.push(`stage:${stage}`); return "movida"; },
    createOpportunity: async () => { calls.push("opportunity"); return "criada"; },
    addTag: async (_state, tag) => { calls.push(`tag+:${tag}`); return "ok"; },
    removeTag: async (_state, tag) => { calls.push(`tag-:${tag}`); return "ok"; },
    assign: async () => { calls.push("assign"); return "ok"; },
    notify: async (_state, input) => { calls.push(`notify:${input.title}|${input.message}`); return "ok"; },
    optOut: async () => { calls.push("optout"); return "ok"; },
    addNote: async (_state, input) => { calls.push(`note:${input.target}:${input.text}`); return "ok"; },
    http: async () => ({ status: 200, data: { ok: true } }),
    log: async (_state, item, status, message) => { logs.push({ node: item.id, status, message }); },
  };
  return { ports, calls, logs, later: (ms: number) => { now = new Date(now.getTime() + ms); } };
}

const state = (): ExecutionState => ({ id: "e1", flowId: "f1", contactId: "c1", conversationId: "conv1", currentNodeId: null, context: { vars: { nome: "Ana", cidade: "Goiânia" }, startedAt: "2026-11-17T13:00:00.000Z" } });

beforeEach(() => {
  db.executions = [];
  db.logs = [];
  db.optedOut = [];
});

describe("motor: fluxo sequencial com delay e condição", () => {
  it("para no Aguardar, retoma e segue Condição(Não) → WhatsApp → Mover pipeline → Notificar", async () => {
    const { ports, calls, logs, later } = fakePorts({ reply: null });
    const first = await advance(GRAPH, state(), ports);
    expect(first.status).toBe("waiting");
    if (first.status !== "waiting") throw new Error("esperava waiting");
    expect(first.resumeAt.toISOString()).toBe("2026-11-17T15:00:00.000Z");
    expect(first.state.currentNodeId).toBe("d");
    expect(calls).toEqual([]);

    later(2 * 3_600_000);
    const second = await advance(GRAPH, first.state, ports);
    expect(second.status).toBe("completed");
    expect(calls).toEqual(["whatsapp:Oi Ana, conseguiu ver o orçamento?", "stage:fechamento", "notify:Follow-up: Ana|Cliente de Goiânia"]);
    expect(logs.map((item) => `${item.node}:${item.status}`)).toEqual(["t:ok", "d:waiting", "d:ok", "c:ok", "m:ok", "s:ok", "n:ok"]);
  });

  it("cliente respondeu: segue pelo caminho Sim e não manda o follow-up", async () => {
    const { ports, calls, later } = fakePorts({ reply: "vi sim, obrigado" });
    const first = await advance(GRAPH, state(), ports);
    later(3 * 3_600_000);
    const done = await advance(GRAPH, first.state, ports);
    expect(done.status).toBe("completed");
    expect(calls).toEqual(["notify:Respondeu: Ana|"]);
  });

  it("erro num passo encerra a execução como falha com o log do motivo", async () => {
    const { ports, logs } = fakePorts();
    ports.sendWhatsApp = async () => { throw new Error("Janela de 24 h do WhatsApp fechada"); };
    const graph: FlowGraph = { nodes: [node("t", "trigger_tag", { tag: "vip" }), node("m", "send_whatsapp", { text: "oi" })], edges: [edge("t", "m")] };
    const result = await advance(graph, state(), ports);
    expect(result).toMatchObject({ status: "failed", error: "Janela de 24 h do WhatsApp fechada" });
    expect(logs.at(-1)).toMatchObject({ node: "m", status: "error" });
  });
});

describe("opt-out (LGPD) interrompe a automação", () => {
  it("contato que mandou SAIR durante o delay: na retomada nada é enviado e a execução é cancelada", async () => {
    let optedOut = false;
    const { ports, calls, logs, later } = fakePorts({ optedOut: () => optedOut });
    const first = await advance(GRAPH, state(), ports);
    expect(first.status).toBe("waiting");
    optedOut = true;
    later(2 * 3_600_000);
    const resumed = await advance(GRAPH, first.state, ports);
    expect(resumed).toMatchObject({ status: "cancelled", reason: "opt-out" });
    expect(calls).toEqual([]);
    expect(logs.at(-1)).toMatchObject({ status: "cancelled" });
  });

  it("applyOptOutCommand (SAIR no WhatsApp) cancela na hora as execuções ativas do contato", async () => {
    db.executions = [
      { id: "e1", contactId: "c1", status: "waiting", currentNodeId: "d" },
      { id: "e2", contactId: "c1", status: "completed", currentNodeId: null },
      { id: "e3", contactId: "outro", status: "waiting", currentNodeId: "d" },
    ];
    await applyOptOutCommand("5562999990000", "opt_out", "WhatsApp: \"SAIR\"");
    expect(db.executions.map((item) => `${item.id}:${item.status}`)).toEqual(["e1:cancelled", "e2:completed", "e3:waiting"]);
    expect(db.logs).toEqual([expect.objectContaining({ executionId: "e1", status: "cancelled" })]);
  });

  it("REATIVAR não cancela nada", async () => {
    db.executions = [{ id: "e1", contactId: "c1", status: "waiting", currentNodeId: "d" }];
    await applyOptOutCommand("5562999990000", "opt_in", "WhatsApp: \"VOLTAR\"");
    expect(db.executions[0].status).toBe("waiting");
  });
});

describe("gatilhos, condições e validação", () => {
  it("mensagem casa por palavra-chave sem acento; etapa e tag pelo valor configurado", () => {
    expect(triggerMatches(node("t", "trigger_message", { mode: "keywords", keywords: ["orçamento"] }), { type: "trigger_message", text: "Queria um ORCAMENTO de lentes" })).toBe(true);
    expect(triggerMatches(node("t", "trigger_message", { mode: "keywords", keywords: ["oi"] }), { type: "trigger_message", text: "boituva" })).toBe(false);
    expect(triggerMatches(node("t", "trigger_message", { mode: "any" }), { type: "trigger_message", text: "qualquer" })).toBe(true);
    expect(triggerMatches(node("t", "trigger_stage", { stage: "ganho" }), { type: "trigger_stage", stage: "ganho" })).toBe(true);
    expect(triggerMatches(node("t", "trigger_stage", { stage: "ganho" }), { type: "trigger_stage", stage: "fechamento" })).toBe(false);
    expect(triggerMatches(node("t", "trigger_tag", { tag: "VIP" }), { type: "trigger_tag", tag: "vip" })).toBe(true);
  });

  it("condição por tag, cidade e hora", () => {
    const facts = { tags: ["VIP"], stage: "ganho", city: "Goiânia" };
    expect(evaluateCondition({ field: "tag", operator: "equals", value: "vip" }, { facts, hour: 10, reply: null })).toBe(true);
    expect(evaluateCondition({ field: "city", operator: "contains", value: "goiania" }, { facts, hour: 10, reply: null })).toBe(true);
    expect(evaluateCondition({ field: "hour", operator: "gte", value: "18" }, { facts, hour: 10, reply: null })).toBe(false);
    expect(evaluateCondition({ field: "reply", operator: "exists" }, { facts, hour: 10, reply: "  " })).toBe(false);
  });

  it("variáveis no texto e campos da resposta HTTP", () => {
    expect(renderTemplate("Oi {{nome}} de {{ cidade }}! {{desconhecida}}{{http.pedido.status}}", { vars: { nome: "Ana", cidade: "Goiânia" }, startedAt: "", http: { pedido: { status: " pronto" } } })).toBe("Oi Ana de Goiânia!  pronto");
  });

  it("mudança de etapa no Kanban e tags novas viram eventos", () => {
    expect(stageChanges([{ id: "1", contactId: "a", coluna: "novo-lead" }, { id: "2", contactId: "b", coluna: "ganho" }], [{ id: "1", contactId: "a", coluna: "em-atendimento" }, { id: "2", contactId: "b", coluna: "ganho" }, { id: "3", contactId: "c", coluna: "novo-lead" }]))
      .toEqual([{ contactId: "a", stage: "em-atendimento", cardId: "1" }, { contactId: "c", stage: "novo-lead", cardId: "3" }]);
    expect(addedTags(["VIP"], ["vip", "retorno"])).toEqual(["retorno"]);
  });

  it("validação exige gatilho conectado e campos obrigatórios; modelos prontos são válidos", () => {
    expect(validateGraph({ nodes: [], edges: [] })).toContain("Adicione um gatilho para iniciar o fluxo.");
    expect(validateGraph({ nodes: [node("t", "trigger_tag", { tag: "x" }), node("m", "send_whatsapp", { text: "" })], edges: [] })).toEqual(["Conecte o gatilho ao primeiro passo.", "Enviar WhatsApp: escreva a mensagem ou anexe um áudio."]);
    // Modelos prontos são válidos; os que enviam fora da janela de 24 h (NPS pós-compra, pós-venda em 3 dias) só pedem o modelo da Meta.
    for (const template of FLOW_TEMPLATES) {
      const problems = validateGraph(sanitizeGraph(template.graph));
      expect(problems.every((problem) => /modelo (aprovado|oficial)/.test(problem))).toBe(true);
    }
    expect(validateGraph(sanitizeGraph(FLOW_TEMPLATES.find((item) => item.id === "boas-vindas")!.graph))).toEqual([]);
    expect(sanitizeGraph({ nodes: [{ id: "x", type: "inventado" }, node("a", "delay")], edges: [edge("a", "zz")] })).toMatchObject({ nodes: [{ id: "a" }], edges: [] });
  });
});
