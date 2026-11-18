import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/automations/engine-db", () => ({ triggerAutomations: vi.fn() }));

const { defaultHandoffGraph, handoffTextFromSettings, DEFAULT_HANDOFF_TEXT } = await import("@/lib/automations/ai-handoff");
const { triggerMatches } = await import("@/lib/automations/engine");
const { validateGraph, triggerTypesOf } = await import("@/lib/automations/nodes");

describe("transbordo da IA em /automacoes", () => {
  it("fluxo padrão replica a mensagem que estava em /ia (variáveis convertidas) e é válido", () => {
    const graph = defaultHandoffGraph({ handoffMessage: "Oi {cliente}, vou te passar para {fila}!", aiChoosesQueue: true, handoffQueueId: "" });
    expect(graph.nodes.map((node) => node.type)).toEqual(["trigger_ai_handoff", "send_whatsapp"]);
    expect(graph.nodes[1].data.config.text).toBe("Oi {{nome}}, vou te passar para {{fila}}!");
    expect(triggerTypesOf(graph)).toEqual(["trigger_ai_handoff"]);
    expect(validateGraph(graph)).toEqual([]);
  });

  it("mensagem vazia usa o aviso padrão; fila fixa (sem a IA escolher) vira nó Atribuir", () => {
    expect(handoffTextFromSettings("  ")).toBe(DEFAULT_HANDOFF_TEXT);
    const graph = defaultHandoffGraph({ handoffMessage: "", aiChoosesQueue: false, handoffQueueId: "fila-vendas" });
    expect(graph.nodes.map((node) => node.type)).toEqual(["trigger_ai_handoff", "send_whatsapp", "assign"]);
    expect(graph.nodes[2].data.config.queueId).toBe("fila-vendas");
  });

  it("gatilho casa com qualquer fila ou só com a fila escolhida", () => {
    const [any] = defaultHandoffGraph({}).nodes;
    expect(triggerMatches(any, { type: "trigger_ai_handoff", queueId: "vendas" })).toBe(true);
    const only = { ...any, data: { config: { queueId: "financeiro" } } };
    expect(triggerMatches(only, { type: "trigger_ai_handoff", queueId: "vendas" })).toBe(false);
    expect(triggerMatches(only, { type: "trigger_ai_handoff", queueId: "financeiro" })).toBe(true);
    expect(triggerMatches(any, { type: "trigger_message", text: "oi" })).toBe(false);
  });
});
