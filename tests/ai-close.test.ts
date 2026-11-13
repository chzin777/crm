import { describe, expect, it, vi } from "vitest";
import { buildSystemPrompt } from "@/lib/ai/agent-core";
import { asksForHuman, DEFAULT_AI_SETTINGS } from "@/lib/ai/settings";
import { AI_FAREWELL, aiCloseDecision, CLOSE_RULES, CLOSE_TOOL, isPostCloseCourtesy, POST_CLOSE_WINDOW_MS, runAiClose } from "@/lib/ai/ai-close";

const settings = { ...DEFAULT_AI_SETTINGS, closeWhenResolved: true };
const decide = (pendingText: string, extra: { queued?: boolean; assigned?: boolean } = {}) =>
  aiCloseDecision({ requested: true, enabled: settings.closeWhenResolved, queued: !!extra.queued, assigned: !!extra.assigned, asksHuman: asksForHuman(settings, pendingText), pendingText });

describe("encerramento pela IA no fluxo oficial (encerra no banco + pesquisa de satisfação)", () => {
  it("\"ok, já me ajudou, muito obrigado\" com a IA sozinha: 1 despedida, encerra e dispara o NPS, nessa ordem", async () => {
    expect(decide("ok, já me ajudou, muito obrigado")).toEqual({ close: true });
    const order: string[] = [];
    const sendFarewell = vi.fn(async (text: string) => { order.push(`despedida:${text}`); });
    const close = vi.fn(async () => { order.push("encerrada"); return true; });
    const survey = vi.fn(async () => { order.push("nps"); });
    const steps = await runAiClose("Por nada! Qualquer coisa que precisar, é só chamar por aqui 😊", { sendFarewell, close, survey });
    expect(order).toEqual(["despedida:Por nada! Qualquer coisa que precisar, é só chamar por aqui 😊", "encerrada", "nps"]);
    expect(steps).toEqual(["farewell", "closed", "survey"]);
    expect(sendFarewell).toHaveBeenCalledTimes(1);
  });

  it("sem texto da IA, usa a despedida padrão; conversa já encerrada não dispara NPS de novo; falha da despedida não impede o encerramento", async () => {
    const texts: string[] = [];
    await runAiClose("", { sendFarewell: async (text) => { texts.push(text); }, close: async () => true, survey: async () => undefined });
    expect(texts).toEqual([AI_FAREWELL]);
    const survey = vi.fn(async () => undefined);
    expect(await runAiClose("Tchau!", { sendFarewell: async () => undefined, close: async () => false, survey })).toEqual(["farewell"]);
    expect(survey).not.toHaveBeenCalled();
    expect(await runAiClose("Tchau!", { sendFarewell: async () => { throw new Error("Meta fora"); }, close: async () => true, survey: async () => undefined })).toEqual(["farewell_failed", "closed", "survey"]);
  });

  it("\"muito obrigado\" aguardando na fila Comercial: trava fixa impede encerrar e disparar o NPS", async () => {
    const decision = decide("muito obrigado", { queued: true });
    expect(decision).toEqual({ close: false, blocked: "queued" });
    // O pipeline só chama o encerramento com decision.close = true.
    const close = vi.fn(async () => true);
    const survey = vi.fn(async () => undefined);
    if (decision.close) await runAiClose("", { sendFarewell: async () => undefined, close, survey });
    expect(close).not.toHaveBeenCalled();
    expect(survey).not.toHaveBeenCalled();
    expect(buildSystemPrompt({ settings, info: "", queued: { queueName: "Comercial" } })).toContain("Nunca encerre o atendimento (não chame encerrarAtendimento");
  });

  it("trava fixa: atendente atribuído, pedido de atendente, dúvida pendente ou opção desligada", () => {
    expect(decide("obrigado", { assigned: true })).toEqual({ close: false, blocked: "assigned" });
    expect(decide("obrigado, mas quero falar com um atendente")).toEqual({ close: false, blocked: "human_request" });
    expect(decide("obrigado! e vocês abrem sábado?")).toEqual({ close: false, blocked: "pending_question" });
    expect(aiCloseDecision({ requested: true, enabled: false, queued: false, assigned: false, asksHuman: false, pendingText: "valeu" })).toEqual({ close: false, blocked: "disabled" });
    expect(aiCloseDecision({ requested: false, enabled: true, queued: false, assigned: false, asksHuman: false, pendingText: "valeu" })).toEqual({ close: false, blocked: null });
  });

  it("\"valeu\" depois do encerramento: não reabre atendimento nem manda outra despedida; nota do NPS segue para a pesquisa", () => {
    const closedAt = new Date("2026-11-13T15:00:00Z");
    const at = (minutes: number) => new Date(closedAt.getTime() + minutes * 60_000);
    expect(isPostCloseCourtesy({ text: "valeu", isText: true, lastClosedAt: closedAt, receivedAt: at(2), hasOpen: false })).toBe(true);
    expect(isPostCloseCourtesy({ text: "👍", isText: true, lastClosedAt: closedAt, receivedAt: at(1), hasOpen: false })).toBe(true);
    // Nota da pesquisa (0 a 10) não é cortesia.
    expect(isPostCloseCourtesy({ text: "10", isText: true, lastClosedAt: closedAt, receivedAt: at(2), hasOpen: false })).toBe(false);
    // Assunto novo, conversa aberta ou fora da janela: fluxo normal.
    expect(isPostCloseCourtesy({ text: "quero ver outro modelo", isText: true, lastClosedAt: closedAt, receivedAt: at(2), hasOpen: false })).toBe(false);
    expect(isPostCloseCourtesy({ text: "valeu", isText: true, lastClosedAt: closedAt, receivedAt: at(2), hasOpen: true })).toBe(false);
    expect(isPostCloseCourtesy({ text: "valeu", isText: true, lastClosedAt: closedAt, receivedAt: new Date(closedAt.getTime() + POST_CLOSE_WINDOW_MS + 1), hasOpen: false })).toBe(false);
  });

  it("regras no prompt: despedida única sem pergunta aberta e chamada de encerrarAtendimento (só com a opção ligada)", () => {
    expect(CLOSE_TOOL.function.name).toBe("encerrarAtendimento");
    const on = buildSystemPrompt({ settings, info: "" });
    expect(on).toContain(CLOSE_RULES);
    expect(CLOSE_RULES).toContain("chame encerrarAtendimento para finalizar o atendimento e liberar a pesquisa de satisfação");
    expect(CLOSE_RULES).toContain("nada de \"Posso ajudar em algo mais?\"");
    expect(buildSystemPrompt({ settings: { ...settings, closeWhenResolved: false }, info: "" })).not.toContain(CLOSE_RULES);
  });
});
