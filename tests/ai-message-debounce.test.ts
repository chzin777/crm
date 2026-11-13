import { afterEach, describe, expect, it, vi } from "vitest";
import { calculateAdaptiveDebounceMs, cappedDelay, createMessageBuffer, DEBOUNCE_MAX_WAIT_MS, DEBOUNCE_OFF_MS, type FlushedBatch } from "@/lib/ai/message-debounce";

afterEach(() => vi.useRealTimers());

describe("espera adaptativa", () => {
  it("pergunta completa responde rápido (~1,5 a 2 s)", () => {
    for (const text of ["Vocês têm Ray-Ban Justin na loja do Bueno?", "Qual o horário de sábado no centro?"]) {
      const ms = calculateAdaptiveDebounceMs({ text });
      expect(ms).toBeGreaterThanOrEqual(1500);
      expect(ms).toBeLessThanOrEqual(2000);
    }
    expect(calculateAdaptiveDebounceMs({ text: "Esse aqui vocês têm na loja?", hasMedia: true })).toBeLessThanOrEqual(2000);
  });

  it("fragmentos (conectivo, reticências, muito curtos) e saudação curta esperam mais (~5 a 6 s)", () => {
    for (const text of ["queria ver um óculos pra", "oi", "Bom dia", "tô procurando um modelo que", "então...", "aquele ray ban e"]) {
      const ms = calculateAdaptiveDebounceMs({ text });
      expect(ms, text).toBeGreaterThanOrEqual(5000);
      expect(ms, text).toBeLessThanOrEqual(6000);
    }
  });

  it("frase declarativa curta ou saudação maior: espera média (~3,5 a 4 s)", () => {
    for (const text of ["Queria ver um óculos", "Tô procurando lente", "Boa tarde, pessoal"]) {
      const ms = calculateAdaptiveDebounceMs({ text });
      expect(ms, text).toBeGreaterThanOrEqual(3500);
      expect(ms, text).toBeLessThanOrEqual(4000);
    }
  });

  it("lote já acumulado espera mais; teto de 12 s desde a primeira mensagem", () => {
    expect(calculateAdaptiveDebounceMs({ text: "Queria ver um óculos", buffered: 3 })).toBeGreaterThanOrEqual(5000);
    expect(cappedDelay(5500, 0, 10_000)).toBe(2000);
    expect(cappedDelay(5500, 0, 13_000)).toBe(0);
    expect(cappedDelay(1800, 0, 1000)).toBe(1800);
  });
});

describe("buffer de mensagens por conversa", () => {
  it("4 mensagens picadas a cada 1 s viram um lote só: a IA roda 1 vez com o texto completo e os anexos", async () => {
    vi.useFakeTimers();
    const runAiAgent = vi.fn(async (_batch: FlushedBatch) => undefined);
    const buffer = createMessageBuffer({ onFlush: runAiAgent });
    const parts = [
      { id: "m1", text: "Oi" },
      { id: "m2", text: "Queria saber" },
      { id: "m3", text: "se tem ray ban", hasMedia: true },
      { id: "m4", text: "no setor bueno" },
    ];
    for (const [index, part] of parts.entries()) {
      buffer.add("conv-1", part);
      if (index < parts.length - 1) await vi.advanceTimersByTimeAsync(1000);
    }
    expect(runAiAgent).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MAX_WAIT_MS);
    expect(runAiAgent).toHaveBeenCalledTimes(1);
    const batch = runAiAgent.mock.calls[0][0];
    expect(batch.text).toBe("Oi\nQueria saber\nse tem ray ban\nno setor bueno");
    expect(batch.lastId).toBe("m4");
    expect(batch.messages.filter((item) => item.hasMedia).map((item) => item.id)).toEqual(["m3"]);
    expect(buffer.pending("conv-1")).toBe(0);
  });

  it("rajada contínua (mensagem a cada 1 s) dispara no máximo 12 s depois da primeira", async () => {
    vi.useFakeTimers();
    const flushedAt: number[] = [];
    const buffer = createMessageBuffer({ onFlush: () => { flushedAt.push(Date.now() - start); } });
    const start = Date.now();
    for (let second = 0; second < 20 && flushedAt.length === 0; second += 1) {
      buffer.add("conv-2", { id: `m${second}`, text: "e" });
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(flushedAt).toHaveLength(1);
    expect(flushedAt[0]).toBeLessThanOrEqual(DEBOUNCE_MAX_WAIT_MS);
  });

  it("pergunta completa sozinha não espera à toa; conversas diferentes não se misturam; repetida não duplica", async () => {
    vi.useFakeTimers();
    const onFlush = vi.fn();
    const buffer = createMessageBuffer({ onFlush });
    buffer.add("a", { id: "a1", text: "Vocês têm Ray-Ban Justin na loja do Bueno?" });
    buffer.add("b", { id: "b1", text: "oi" });
    expect(buffer.add("a", { id: "a1", text: "Vocês têm Ray-Ban Justin na loja do Bueno?" })).toBeNull();
    await vi.advanceTimersByTimeAsync(2000);
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush.mock.calls[0][0]).toMatchObject({ key: "a", lastId: "a1" });
    await vi.advanceTimersByTimeAsync(6000);
    expect(onFlush).toHaveBeenCalledTimes(2);
  });

  it("agrupamento desligado em /ia responde cada mensagem em ~1,5 s", () => {
    vi.useFakeTimers();
    const buffer = createMessageBuffer({ onFlush: vi.fn(), enabled: () => false });
    expect(buffer.add("c", { id: "c1", text: "queria ver um óculos pra" })).toBe(DEBOUNCE_OFF_MS);
  });
});
