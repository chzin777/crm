import { describe, expect, it } from "vitest";
import { advance, type EnginePorts, type ExecutionState } from "@/lib/automations/engine";
import { NODE_DEF, sendsOutsideWindow, shiftDate, templateApprovalProblems, validateGraph, type FlowEdge, type FlowGraph, type FlowNode, type NodeType } from "@/lib/automations/nodes";
import { saleMoment } from "@/lib/automations/erp-triggers";
import { NPS_FLOWS } from "@/lib/automations/templates";
import { NPS_TEMPLATE, npsTemplateParams } from "@/lib/nps-scale";

const node = (id: string, type: NodeType, config: Record<string, unknown> = {}): FlowNode => ({ id, type, position: { x: 0, y: 0 }, data: { config: { ...NODE_DEF[type].defaults, ...config } } });
const edge = (source: string, target: string, sourceHandle: string | null = null): FlowEdge => ({ id: `${source}-${sourceHandle ?? "out"}-${target}`, source, target, sourceHandle });
const npsTemplate = (surveyType: "ATENDIMENTO" | "PRODUTO_ADAPTACAO") => ({ name: NPS_TEMPLATE.name, language: "pt_BR", body: NPS_TEMPLATE.body, params: npsTemplateParams(surveyType), hasImage: false });
const withTemplate = (graph: FlowGraph, surveyType: "ATENDIMENTO" | "PRODUTO_ADAPTACAO"): FlowGraph => ({
  ...graph,
  nodes: graph.nodes.map((item) => (item.type === "send_nps" ? { ...item, data: { config: { ...item.data.config, template: npsTemplate(surveyType) } } } : item)),
});

describe("automações de NPS pós-compra", () => {
  it("20 minutos e 30 dias depois da venda faturada no VMSet", () => {
    const [atendimento, produto] = NPS_FLOWS;
    expect(atendimento.graph.nodes[0]).toMatchObject({ type: "trigger_erp_after_sale", data: { config: { amount: 20, unit: "minutes" } } });
    expect(atendimento.graph.nodes[1].data.config.surveyType).toBe("ATENDIMENTO");
    expect(produto.graph.nodes[0]).toMatchObject({ type: "trigger_erp_after_sale", data: { config: { amount: 30, unit: "days" } } });
    expect(produto.graph.nodes[1].data.config.surveyType).toBe("PRODUTO_ADAPTACAO");

    // Momento do disparo: venda vista no espelho às 10:00 de Brasília.
    const sale = { orderDate: "2026-11-26", seenAt: new Date("2026-11-26T13:00:00Z") };
    expect(shiftDate(saleMoment(sale), 20, "minutes").toISOString()).toBe("2026-11-26T13:20:00.000Z");
    expect(shiftDate(saleMoment(sale), 30, "days").toISOString()).toBe("2026-12-26T13:00:00.000Z");
  });

  it("só ativa com o modelo da Meta vinculado", () => {
    const [atendimento] = NPS_FLOWS;
    expect(validateGraph(atendimento.graph)).toContain("Pesquisa NPS: vincule o modelo aprovado da Meta (use o modelo pronto de NPS 0 a 10 em Modelos).");
    expect(validateGraph(withTemplate(atendimento.graph, "ATENDIMENTO"))).toEqual([]);
  });

  it("envia pelo modelo com nome, empresa e assunto, ligado ao pedido do VMSet", async () => {
    const calls: unknown[] = [];
    const ok = async () => "ok";
    const ports: EnginePorts = {
      now: () => new Date("2026-11-26T13:20:00Z"), isOptedOut: async () => false, facts: async () => ({ tags: [], stage: null, city: null }), lastReply: async () => null, nextBusinessTime: async (date) => date,
      sendWhatsApp: ok, aiAgent: ok, moveStage: ok, createOpportunity: ok, addTag: ok, removeTag: ok, assign: ok, notify: ok, optOut: ok, addNote: ok,
      http: async () => ({ status: 200, data: {} }), log: async () => undefined,
      sendNps: async (_state, input) => { calls.push(input); return "enviada"; },
    };
    const state: ExecutionState = { id: "e", flowId: "f", contactId: "c", conversationId: null, currentNodeId: null, context: { vars: { nome: "Maria", nome_completo: "Maria Souza", "venda.loja": "Centro", "venda.numero": "123", "venda.vendedor": "Ana" }, startedAt: "2026-11-26T13:20:00.000Z" } };
    const result = await advance(withTemplate(NPS_FLOWS[0].graph, "ATENDIMENTO"), state, ports);
    expect(result.status).toBe("completed");
    expect(calls).toEqual([expect.objectContaining({ surveyType: "ATENDIMENTO", orderKey: "Centro-123", store: "Centro", seller: "Ana", template: expect.objectContaining({ values: ["Maria", "Óticas Brasil", "o atendimento que você recebeu na loja"] }) })]);
  });

  it("contato com opt-out não recebe a pesquisa", async () => {
    let sent = 0;
    const ok = async () => "ok";
    const ports: EnginePorts = {
      now: () => new Date(), isOptedOut: async () => true, facts: async () => ({ tags: [], stage: null, city: null }), lastReply: async () => null, nextBusinessTime: async (date) => date,
      sendWhatsApp: ok, aiAgent: ok, moveStage: ok, createOpportunity: ok, addTag: ok, removeTag: ok, assign: ok, notify: ok, optOut: ok, addNote: ok,
      http: async () => ({ status: 200, data: {} }), log: async () => undefined,
      sendNps: async () => { sent += 1; return "enviada"; },
    };
    const state: ExecutionState = { id: "e", flowId: "f", contactId: "c", conversationId: null, currentNodeId: null, context: { vars: {}, startedAt: new Date().toISOString() } };
    expect((await advance(withTemplate(NPS_FLOWS[1].graph, "PRODUTO_ADAPTACAO"), state, ports)).status).toBe("cancelled");
    expect(sent).toBe(0);
  });
});

describe("regra da janela de 24 h: modelo aprovado obrigatório", () => {
  const text = { text: "Oi {{nome}}, tudo bem?" };
  const template = { template: { name: "pos_venda", language: "pt_BR", body: "Oi {{1}}", params: ["primeiro_nome"] } };

  it("gatilho ativo (VMSet, inatividade) com texto livre bloqueia a ativação", () => {
    for (const trigger of ["trigger_erp_after_sale", "trigger_inactive", "trigger_erp_birthday"] as NodeType[]) {
      const graph = { nodes: [node("t", trigger, { amount: 335, unit: "days" }), node("m", "send_whatsapp", text)], edges: [edge("t", "m")] };
      expect(sendsOutsideWindow(graph).has("m")).toBe(true);
      expect(validateGraph(graph).some((problem) => problem.includes("vincule um modelo oficial"))).toBe(true);
    }
  });

  it("com modelo vinculado a mesma automação pode ser ativada", () => {
    const graph = { nodes: [node("t", "trigger_erp_after_sale", { amount: 335, unit: "days" }), node("m", "send_whatsapp", template)], edges: [edge("t", "m")] };
    expect(validateGraph(graph)).toEqual([]);
  });

  it("conversa ativa: texto livre vale até 23 h de espera; 24 h ou mais exige modelo", () => {
    const flow = (hours: number) => ({ nodes: [node("t", "trigger_message", { mode: "any" }), node("d", "delay", { amount: hours, unit: "hours" }), node("m", "send_whatsapp", text)], edges: [edge("t", "d"), edge("d", "m")] });
    expect(validateGraph(flow(23))).toEqual([]);
    expect(validateGraph(flow(24)).some((problem) => problem.includes("24 h"))).toBe(true);
    expect(sendsOutsideWindow({ nodes: [node("t", "trigger_stage", { stage: "ganho" }), node("d", "delay", { amount: 3, unit: "days" }), node("m", "send_whatsapp", text)], edges: [edge("t", "d"), edge("d", "m")] }).has("m")).toBe(true);
  });

  it("resposta do cliente no Aguardar resposta reabre a janela; o timeout não", () => {
    const graph = {
      nodes: [node("t", "trigger_message", { mode: "any" }), node("w", "wait_reply", { amount: 2, unit: "days" }), node("yes", "send_whatsapp", text), node("no", "send_whatsapp", text)],
      edges: [edge("t", "w"), edge("w", "yes", "replied"), edge("w", "no", "timeout")],
    };
    const outside = sendsOutsideWindow(graph);
    expect(outside.has("yes")).toBe(false);
    expect(outside.has("no")).toBe(true);
  });

  it("modelo vinculado precisa estar aprovado na Meta", () => {
    const graph = { nodes: [node("t", "trigger_erp_sale"), node("m", "send_whatsapp", template)], edges: [edge("t", "m")] };
    expect(templateApprovalProblems(graph, [{ name: "pos_venda", language: "pt_BR", status: "APPROVED" }])).toEqual([]);
    expect(templateApprovalProblems(graph, [{ name: "pos_venda", language: "pt_BR", status: "PENDING" }])[0]).toMatch(/ainda não foi aprovado/);
    expect(templateApprovalProblems(graph, [])[0]).toMatch(/não existe mais/);
  });
});
