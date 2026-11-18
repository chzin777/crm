import { describe, expect, it } from "vitest";
import { AUTOMATION_DRAFT_SCHEMA, builderSystemPrompt, draftToGraph } from "@/lib/automations/ai-builder";
import { validateGraph } from "@/lib/automations/nodes";

const workspace = { queues: [{ id: "q-vendas", name: "Vendas" }], users: [{ id: "u1", name: "Ana" }] };
const nulls = { mode: null, keywords: null, stage: null, tag: null, amount: null, unit: null, businessHours: null, queueId: null, assigneeId: null, userIds: null, text: null, mediaUrl: null, objective: null, title: null, message: null, whatsappPhone: null, field: null, operator: null, value: null, method: null, url: null, body: null };
const step = (id: string, type: string, params: Record<string, unknown>, links: { next?: string | null; nextTrue?: string | null; nextFalse?: string | null } = {}) => ({ id, type, params: { ...nulls, ...params }, filters: null, next: links.next ?? null, nextTrue: links.nextTrue ?? null, nextFalse: links.nextFalse ?? null });

describe("criação de automação com IA", () => {
  it("rascunho com condição vira grafo válido, conectado e com posições em camadas", () => {
    const { name, graph } = draftToGraph({
      name: "Follow-up de fechamento",
      description: "Lembrete quando o lead some.",
      trigger: { type: "trigger_stage", params: { ...nulls, stage: "fechamento" }, filters: null },
      steps: [
        step("s1", "delay", { amount: 2, unit: "days", businessHours: false }, { next: "s2" }),
        step("s2", "condition", { field: "reply", operator: "exists", value: "" }, { nextFalse: "s3" }),
        step("s3", "send_whatsapp", { text: "Oi {{nome}}!" }, { next: "s4" }),
        step("s4", "assign", { queueId: "q-vendas", assigneeId: "u1" }),
      ],
    }, workspace);
    expect(name).toBe("Follow-up de fechamento");
    expect(graph.nodes.map((node) => node.type)).toEqual(["trigger_stage", "delay", "condition", "send_whatsapp", "assign"]);
    expect(graph.edges.find((edge) => edge.source === "n2")?.sourceHandle).toBe("false");
    expect(validateGraph(graph)).toEqual([]);
    const y = Object.fromEntries(graph.nodes.map((node) => [node.id, node.position.y]));
    expect(y.trigger).toBeLessThan(y.n1);
    expect(y.n3).toBeLessThan(y.n4);
    expect(graph.nodes.find((node) => node.id === "n3")!.position.x).toBeGreaterThan(0);
  });

  it("descarta fila/usuário inexistentes, laços para trás e passos soltos", () => {
    const { graph } = draftToGraph({
      trigger: { type: "trigger_message", params: { ...nulls, mode: "keywords", keywords: ["receita"] }, filters: null },
      steps: [
        step("a", "assign", { queueId: "fila-inventada", assigneeId: "x" }, { next: "a" }),
        step("b", "add_tag", { tag: "Cliente VIP" }),
      ],
    }, workspace);
    const assign = graph.nodes.find((node) => node.type === "assign")!;
    expect(assign.data.config.queueId).toBe("");
    expect(assign.data.config.assigneeId).toBe("");
    expect(graph.edges.some((edge) => edge.source === edge.target)).toBe(false);
    // "b" não tinha entrada: sai do fluxo.
    expect(graph.nodes.some((node) => node.type === "add_tag")).toBe(false);
    expect(validateGraph(graph)).toContain("Atribuir: escolha a fila.");
  });

  it("sem gatilho válido ou sem passos: erro claro", () => {
    expect(() => draftToGraph({ trigger: { type: "trigger_inventado" }, steps: [] }, workspace)).toThrow(/gatilho/);
    expect(() => draftToGraph({ trigger: { type: "trigger_tag", params: { ...nulls, tag: "vip" } }, steps: [] }, workspace)).toThrow(/passo/);
  });

  it("schema estrito e prompt só com tipos reais e ids do workspace", () => {
    expect(JSON.stringify(AUTOMATION_DRAFT_SCHEMA)).toContain("\"additionalProperties\":false");
    const prompt = builderSystemPrompt(workspace);
    expect(prompt).toContain("q-vendas (Vendas)");
    expect(prompt).toContain("send_whatsapp");
    expect(prompt).toContain("fechamento (Fechamento)");
    expect(prompt).toContain("trigger_erp_after_sale (amount 5, unit minutes");
    expect(JSON.stringify(AUTOMATION_DRAFT_SCHEMA)).toContain("trigger_erp_overdue");
  });
});
