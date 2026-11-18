import { describe, expect, it } from "vitest";
import { estimateVoiceSeconds, isPresenceMode, PRESENCE_LIMITS, presenceDurationMs, simulatePresence } from "@/lib/chat/presence";

describe("presença realista por bloco", () => {
  it("texto: digitando proporcional ao tamanho, entre o mínimo e o máximo", () => {
    expect(presenceDurationMs({ kind: "composing", text: "oi" })).toBe(PRESENCE_LIMITS.minMs);
    expect(presenceDurationMs({ kind: "composing", text: "x".repeat(100) })).toBe(4500);
    expect(presenceDurationMs({ kind: "composing", text: "x".repeat(5000) })).toBe(PRESENCE_LIMITS.maxMs);
  });

  it("áudio: gravando pela duração do arquivo, com teto", () => {
    expect(presenceDurationMs({ kind: "recording", audioSeconds: 7 })).toBe(7000);
    expect(presenceDurationMs({ kind: "recording", audioSeconds: 0.2 })).toBe(PRESENCE_LIMITS.minMs);
    expect(presenceDurationMs({ kind: "recording", audioSeconds: 90 })).toBe(PRESENCE_LIMITS.maxMs);
  });

  it("override do nó: tempo fixo (0 a 20 s) ou desligado", () => {
    expect(presenceDurationMs({ kind: "recording", audioSeconds: 60, mode: "custom", overrideSeconds: 3 })).toBe(3000);
    expect(presenceDurationMs({ kind: "composing", text: "oi", mode: "custom", overrideSeconds: 99 })).toBe(20_000);
    expect(presenceDurationMs({ kind: "composing", text: "oi", mode: "off" })).toBe(0);
    expect(isPresenceMode("custom")).toBe(true);
    expect(isPresenceMode("x")).toBe(false);
  });

  it("estima a duração do ogg/opus de 32 kbps pelo tamanho", () => {
    expect(estimateVoiceSeconds(40_000)).toBe(10);
  });

  it("mostra o indicador, espera e nunca falha por causa dele", async () => {
    const waits: number[] = [];
    let calls = 0;
    await simulatePresence(1500, { indicate: async () => { calls += 1; throw new Error("meta fora"); }, sleep: async (ms) => { waits.push(ms); } });
    await simulatePresence(0, { indicate: async () => { calls += 1; }, sleep: async (ms) => { waits.push(ms); } });
    expect(calls).toBe(1);
    expect(waits).toEqual([1500]);
  });
});
