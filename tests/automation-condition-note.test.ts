import { describe, expect, it } from "vitest";
import { advance, evaluateCondition, renderTemplate, type EnginePorts, type ExecutionState } from "@/lib/automations/engine";
import { describeCondition, NODE_DEF, validateGraph, type FlowEdge, type FlowGraph, type FlowNode, type NodeType } from "@/lib/automations/nodes";

const facts = { tags: ["VIP", "receita"], stage: "fechamento", city: "Goiânia" };
const check = (config: Record<string, unknown>, extra: { reply?: string | null; vars?: Record<string, string>; hour?: number } = {}) =>
  evaluateCondition(config, { facts, hour: extra.hour ?? 10, reply: extra.reply ?? null, vars: extra.vars });

const node = (id: string, type: NodeType, config: Record<string, unknown> = {}): FlowNode => ({ id, type, position: { x: 0, y: 0 }, data: { config: { ...NODE_DEF[type].defaults, ...config } } });
const edge = (source: string, target: string, sourceHandle: string | null = null): FlowEdge => ({ id: `${source}-${target}`, source, target, sourceHandle });

function ports(calls: string[]): EnginePorts {
  const ok = async () => "ok";
  return {
    now: () => new Date("2026-11-18T13:00:00Z"), isOptedOut: async () => false, facts: async () => facts, lastReply: async () => null, nextBusinessTime: async (date) => date,
    sendWhatsApp: ok, aiAgent: ok, moveStage: ok, createOpportunity: ok, addTag: async (_s, tag) => { calls.push(`tag:${tag}`); return "ok"; }, removeTag: ok, assign: ok, notify: ok, optOut: ok,
    addNote: async (_s, input) => { calls.push(`note:${input.target}:${input.text}`); return "ok"; },
    http: async () => ({ status: 200, data: {} }), log: async () => undefined,
  };
}
const state = (vars: Record<string, string>): ExecutionState => ({ id: "e", flowId: "f", contactId: "c", conversationId: null, currentNodeId: null, context: { vars, startedAt: "2026-11-18T12:00:00.000Z" } });

describe("condição (se / senão)", () => {
  it("operadores novos e antigos", () => {
    expect(check({ field: "tag", operator: "contains", value: "vip" })).toBe(true);
    expect(check({ field: "stage", operator: "not_equals", value: "ganho" })).toBe(true);
    expect(check({ field: "stage", operator: "not_equals", value: "fechamento" })).toBe(false);
    expect(check({ field: "reply", operator: "empty" })).toBe(true);
    expect(check({ field: "reply", operator: "exists" }, { reply: "sim" })).toBe(true);
    // Fluxo antigo: "exists" com valor = contém.
    expect(check({ field: "reply", operator: "exists", value: "quero" }, { reply: "Quero sim" })).toBe(true);
    expect(check({ field: "message", operator: "contains", value: "orcamento" }, { vars: { mensagem: "Quero um orçamento" } })).toBe(true);
    expect(check({ field: "variable", variable: "origem", operator: "equals", value: "instagram" }, { vars: { origem: "Instagram" } })).toBe(true);
    expect(check({ field: "variable", variable: "pontos", operator: "gte", value: "100" }, { vars: { pontos: "150" } })).toBe(true);
    expect(check({ field: "hour", operator: "not_equals", value: "10" }, { hour: 10 })).toBe(false);
  });

  it("resumo legível no cartão e validação", () => {
    expect(describeCondition({ field: "tag", operator: "contains", value: "VIP" })).toBe('Tag contém "VIP"');
    expect(describeCondition({ field: "stage", operator: "equals", value: "fechamento" })).toBe('Etapa = "Fechamento"');
    expect(describeCondition({ field: "reply", operator: "exists", value: "" })).toBe("Resposta do cliente está preenchido");
    const graph: FlowGraph = { nodes: [node("t", "trigger_webhook"), node("c", "condition", { field: "variable", variable: "", operator: "equals", value: "" })], edges: [edge("t", "c")] };
    expect(validateGraph(graph)).toEqual(expect.arrayContaining(["Condição: informe o nome da variável.", "Condição: informe o valor da comparação."]));
  });

  it("segue o ramo certo: Sim adiciona a tag, Não registra a observação", async () => {
    const graph: FlowGraph = {
      nodes: [node("t", "trigger_webhook"), node("c", "condition", { field: "variable", variable: "origem", operator: "equals", value: "site" }), node("y", "add_tag", { tag: "site" }), node("n", "add_note", { target: "both", text: "Origem {{origem}} de {{contato.nome}}: {{mensagem.texto}}" })],
      edges: [edge("t", "c"), edge("c", "y", "true"), edge("c", "n", "false")],
    };
    const yes: string[] = [];
    await advance(graph, state({ origem: "site", nome: "Ana" }), ports(yes));
    expect(yes).toEqual(["tag:site"]);
    const no: string[] = [];
    await advance(graph, state({ origem: "loja", nome: "Ana", mensagem: "oi" }), ports(no));
    expect(no).toEqual(["note:both:Origem loja de Ana: oi"]);
  });
});

describe("adicionar observação", () => {
  it("apelidos de variáveis e validação do texto", () => {
    expect(renderTemplate("{{contato.nome}} / {{mensagem.texto}} / {{contato.cidade}}", { vars: { nome: "Ana", mensagem: "oi", cidade: "Goiânia" }, startedAt: "" })).toBe("Ana / oi / Goiânia");
    expect(validateGraph({ nodes: [node("t", "trigger_webhook"), node("n", "add_note", { text: " " })], edges: [edge("t", "n")] })).toContain("Adicionar observação: escreva o texto da nota.");
    expect(NODE_DEF.add_note.defaults).toEqual({ target: "opportunity", text: "" });
  });
});
