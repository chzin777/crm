import { describe, expect, it } from "vitest";
import { customerMessages, formatContext, historyText, interpretDecision, preAgentOutcome, simulatedHistory, transcriptLine } from "@/lib/ai/agent-core";
import { DEFAULT_AI_SETTINGS } from "@/lib/ai/settings";

const settings = { ...DEFAULT_AI_SETTINGS, handoffKeywords: ["atendente"], handoffOnMedia: true, maxAiReplies: 3, handoffMessage: "Oi {cliente}, vou te passar para a equipe." };

describe("regras antes da IA (mesmas no WhatsApp e no teste)", () => {
  it("pedido de atendente, mídia e limite de respostas transferem na ordem do atendimento real", () => {
    expect(preAgentOutcome(settings, { pendingText: "quero um atendente", hasMedia: true, aiReplies: 9 })).toMatchObject({ action: "handoff", trigger: "keyword" });
    expect(preAgentOutcome(settings, { pendingText: "olha a receita", hasMedia: true, aiReplies: 9 })).toMatchObject({ action: "handoff", trigger: "media" });
    expect(preAgentOutcome(settings, { pendingText: "oi", hasMedia: false, aiReplies: 3 })).toMatchObject({ action: "handoff", trigger: "limit" });
    expect(preAgentOutcome(settings, { pendingText: "oi", hasMedia: false, aiReplies: 2 })).toBeNull();
  });

  it("no teste, o gatilho de mídia pode ser ignorado para ver a leitura do anexo", () => {
    expect(preAgentOutcome(settings, { pendingText: "receita", hasMedia: true, aiReplies: 0, ignoreMediaTrigger: true })).toBeNull();
    expect(preAgentOutcome({ ...settings, handoffOnMedia: false }, { pendingText: "receita", hasMedia: true, aiReplies: 0 })).toBeNull();
  });
});

describe("resposta do modelo virando ação", () => {
  it("transferência, resolução, resposta e resposta vazia", () => {
    expect(interpretDecision({ action: "handoff", reply: "Já te passo", reason: "orçamento", queue: "Vendas" })).toEqual({ action: "handoff", reply: "Já te passo", reason: "orçamento", queue: "Vendas", trigger: "ai" });
    expect(interpretDecision({ action: "resolved", reply: "Até mais!" })).toMatchObject({ action: "resolved", trigger: "ai", reason: "Sem motivo informado" });
    expect(interpretDecision({ reply: "Abrimos às 9h." })).toMatchObject({ action: "reply", reply: "Abrimos às 9h." });
    expect(interpretDecision({ action: "reply", reply: "  " })).toMatchObject({ action: "handoff", trigger: "no_reply", reason: "A IA não soube responder" });
  });

  it("mensagens que o cliente receberia", () => {
    const ai = interpretDecision({ action: "handoff", reply: "Já te passo", reason: "x" });
    expect(customerMessages(ai, settings, { customer: "Maria Teste", queue: "Vendas" })).toEqual(["Oi Maria, vou te passar para a equipe."]);
    expect(customerMessages(ai, { handoffMessage: "" }, {})).toEqual(["Já te passo"]);
    const rule = preAgentOutcome(settings, { pendingText: "atendente", hasMedia: false, aiReplies: 0 })!;
    expect(customerMessages(rule, { handoffMessage: "" }, {})).toEqual([]);
    expect(customerMessages(interpretDecision({ reply: "Olá!" }), settings, {})).toEqual(["Olá!"]);
  });
});

describe("contexto do cliente", () => {
  it("mesmo formato de linha e de contexto; IA aparece como Robô", () => {
    const at = new Date("2026-11-13T13:05:00Z");
    expect(transcriptLine({ author: "bot", authorName: "Assistente IA", text: "Olá!", internal: false, attachment: null, createdAt: at })).toBe("[13/11, 10:05] Robô: Olá!");
    expect(transcriptLine({ author: "customer", authorName: null, text: "", internal: false, attachment: { kind: "image", name: "r.jpg" }, createdAt: at })).toBe("[13/11, 10:05] Cliente: [image: r.jpg]");
    const text = formatContext({ contactName: "Maria Teste", queueName: null, subject: "", includeHistory: false, history: null, conversation: "" });
    expect(text).toContain("Cliente: Maria Teste");
    expect(text).toContain("(não disponível para a IA)");
    expect(text).toContain("(sem mensagens)");
  });

  it("perfis simulados: novo sem cadastro, recorrente com pedidos e receita vencida", () => {
    expect(simulatedHistory("novo")).toBeNull();
    expect(historyText(simulatedHistory("novo"))).toBe("Sem cadastro no ERP.");
    const history = historyText(simulatedHistory("recorrente", new Date("2026-11-13T12:00:00Z")));
    expect(history).toContain("Compras no ERP: 3");
    expect(history).toContain("Pedido T-10482 em 2025-09-13");
    expect(history).toContain("receita provavelmente vencida");
  });
});
