import { describe, expect, it } from "vitest";
import { buildSystemPrompt, preAgentOutcome } from "@/lib/ai/agent-core";
import { aiShouldAttend, DEFAULT_AI_SETTINGS } from "@/lib/ai/settings";
import { aiConversationMode } from "@/lib/chat/queue-rules";

const settings = { ...DEFAULT_AI_SETTINGS, autonomousEnabled: true, scheduleMode: "always" as const, attendAtEntry: true, queueIds: [] as string[], aiChoosesQueue: true, handoffKeywords: ["atendente"] };
const waiting = { status: "waiting", queueId: "q-comercial", assigneeId: null as string | null, closedAt: null as Date | null, menuState: { stopped: true } };
const handedOff = { handedOff: true, humanReplied: false };

describe("espera assistida: IA ajuda enquanto o cliente aguarda na fila", () => {
  it("transferida para Comercial sem atendente → IA responde a nova dúvida e não transfere de novo", () => {
    expect(aiConversationMode(waiting, handedOff)).toBe("queued");
    // A fila de destino não precisa estar entre as filas da IA: ela ajuda na espera de qualquer fila.
    expect(aiShouldAttend(settings, waiting, new Date(), true, true)).toBe(true);
    expect(aiShouldAttend(settings, waiting, new Date(), true, false)).toBe(false);
    // Pedido de atendente na espera não gera transbordo duplicado: a IA tranquiliza o cliente.
    const queued = { queueName: "Comercial" };
    expect(preAgentOutcome(settings, { pendingText: "e o atendente?", hasMedia: false, aiReplies: 0, queued })).toBeNull();
    expect(preAgentOutcome(settings, { pendingText: "qual o endereço da loja do centro?", hasMedia: false, aiReplies: 0, queued })).toBeNull();
    // Sem a espera assistida, o mesmo pedido continuaria no fluxo de transferência.
    expect(preAgentOutcome({ ...settings, aiChoosesQueue: false }, { pendingText: "e o atendente?", hasMedia: false, aiReplies: 0 })).toMatchObject({ action: "handoff" });
  });

  it("atendente humano assume (assignedUserId preenchido) → IA em silêncio", () => {
    expect(aiConversationMode({ ...waiting, assigneeId: "user-1" }, handedOff)).toBe("paused");
    expect(aiConversationMode({ ...waiting, status: "in_progress", assigneeId: "user-1" }, handedOff)).toBe("paused");
    expect(aiShouldAttend(settings, { ...waiting, assigneeId: "user-1" }, new Date(), true, true)).toBe(false);
  });

  it("atendente escreveu ao cliente depois do transbordo, IA pausada pelo operador ou conversa encerrada → silêncio", () => {
    expect(aiConversationMode(waiting, { handedOff: true, humanReplied: true })).toBe("paused");
    expect(aiConversationMode({ ...waiting, menuState: { aiPaused: true } }, handedOff)).toBe("paused");
    expect(aiConversationMode({ ...waiting, closedAt: new Date() }, handedOff)).toBe("paused");
  });

  it("antes de qualquer transbordo, a IA atende sozinha", () => {
    expect(aiConversationMode({ ...waiting, status: "bot" }, { handedOff: false, humanReplied: false })).toBe("exclusive");
  });

  it("prompt com alreadyQueued orienta a seguir ajudando sem re-transferir", () => {
    const prompt = buildSystemPrompt({ settings, info: "", firstReply: false, queued: { queueName: "Comercial" } });
    expect(prompt).toContain("alreadyQueued = true");
    expect(prompt).toContain("aguardando atendimento na fila Comercial");
    expect(prompt).toContain("NÃO transfira de novo");
    expect(prompt).toContain("Continue respondendo com atenção total");
    expect(prompt).toContain("já está na fila Comercial e logo um atendente assume");
    expect(prompt).not.toContain("primeira resposta nesta conversa");
    expect(buildSystemPrompt({ settings, info: "" })).not.toContain("alreadyQueued");
  });
});
