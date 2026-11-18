import { describe, expect, it } from "vitest";
import { bubbleDelayFor, DEFAULT_AI_SETTINGS, sanitizeAiSettings } from "@/lib/ai/settings";
import { sendBubbles } from "@/lib/ai/bubbles";

describe("cadência dos balões da IA", () => {
  it("padrões: 0,6 s a 1 s + 25 ms por caractere (digitando proporcional ao texto), 3 balões, ligado)", () => {
    const settings = sanitizeAiSettings({});
    expect(settings.splitReplies).toBe(true);
    expect([settings.bubbleDelayMinMs, settings.bubbleDelayMaxMs, settings.bubbleMsPerChar, settings.maxBubbles]).toEqual([600, 1000, 25, 3]);
  });

  it("nunca aceita negativo nem máximo menor que o mínimo", () => {
    const settings = sanitizeAiSettings({ bubbleDelayMinMs: 3000, bubbleDelayMaxMs: 1000, bubbleMsPerChar: -5, maxBubbles: 0 });
    expect(settings.bubbleDelayMinMs).toBe(3000);
    expect(settings.bubbleDelayMaxMs).toBe(3000);
    expect(settings.bubbleMsPerChar).toBe(0);
    expect(settings.maxBubbles).toBe(1);
    expect(sanitizeAiSettings({ bubbleDelayMinMs: -100, bubbleDelayMaxMs: 99_999 })).toMatchObject({ bubbleDelayMinMs: 0, bubbleDelayMaxMs: 15_000 });
  });

  it("pausa = sorteio entre mínimo e máximo + digitação por caractere, limitada a 15 s", () => {
    const base = { ...DEFAULT_AI_SETTINGS, bubbleDelayMinMs: 1000, bubbleDelayMaxMs: 3000, bubbleMsPerChar: 10 };
    expect(bubbleDelayFor(base, "abcde", () => 0)).toBe(1050);
    expect(bubbleDelayFor(base, "", () => 1)).toBe(3000);
    expect(bubbleDelayFor({ ...base, bubbleMsPerChar: 200 }, "x".repeat(500), () => 0)).toBe(15_000);
  });

  it("o envio usa a pausa calculada para o próximo balão", async () => {
    const waits: number[] = [];
    await sendBubbles(["primeiro", "segundo balão"], {
      sendFirst: async () => undefined,
      sendNext: async () => undefined,
      sleep: async (ms) => { waits.push(ms); },
      delay: (next) => next.length * 100,
    });
    expect(waits).toEqual([1300]);
  });
});
