import { describe, expect, it } from "vitest";
import { cadenceWaitMs, insideWindow, nextWindowStart, normalizeCadence, normalizeFollowUp, normalizeWindow } from "@/lib/campaign-schedule";

// Brasília = UTC−3.
const br = (iso: string) => new Date(`${iso}-03:00`);
const window = { start: "08:30", end: "18:30", skipSundays: true };

describe("janela de horário da campanha", () => {
  it("valida início antes do fim", () => {
    expect(normalizeWindow({ start: "18:30", end: "08:30" })).toBeNull();
    expect(normalizeWindow({ start: "8:30", end: "18:30" })).toBeNull();
    expect(normalizeWindow(window)).toEqual(window);
  });

  it("respeita horário e domingo em Brasília", () => {
    expect(insideWindow(window, br("2026-11-23T08:29:00"))).toBe(false); // segunda
    expect(insideWindow(window, br("2026-11-23T08:30:00"))).toBe(true);
    expect(insideWindow(window, br("2026-11-23T18:30:00"))).toBe(false);
    expect(insideWindow(window, br("2026-11-22T10:00:00"))).toBe(false); // domingo
    expect(insideWindow(null, br("2026-11-22T03:00:00"))).toBe(true);
  });

  it("retoma no próximo início válido", () => {
    expect(nextWindowStart(window, br("2026-11-23T07:00:00")).toISOString()).toBe(br("2026-11-23T08:30:00").toISOString());
    expect(nextWindowStart(window, br("2026-11-23T19:00:00")).toISOString()).toBe(br("2026-11-24T08:30:00").toISOString());
    // Sábado à noite pula o domingo.
    expect(nextWindowStart(window, br("2026-11-21T19:00:00")).toISOString()).toBe(br("2026-11-23T08:30:00").toISOString());
  });
});

describe("cadência", () => {
  it("pausa a cada lote e espaça os envios", () => {
    const cadence = normalizeCadence({ batchSize: 50, intervalSeconds: 60, randomDelay: true });
    expect(cadenceWaitMs(cadence, 50, 300)).toBe(60_000);
    expect(cadenceWaitMs(cadence, 49, 300, () => 0)).toBe(1000);
    expect(cadenceWaitMs(null, 50, 300)).toBe(300);
    expect(normalizeCadence({ batchSize: 0, intervalSeconds: 1 })).toEqual({ batchSize: 1, intervalSeconds: 5, randomDelay: false });
  });
});

describe("follow-up", () => {
  it("exige template e limita as horas", () => {
    expect(normalizeFollowUp({ enabled: true, afterHours: 24, modelo: null })).toBeNull();
    expect(normalizeFollowUp({ enabled: false, afterHours: 24, modelo: { name: "a", language: "pt_BR", params: [] } })).toBeNull();
    expect(normalizeFollowUp({ enabled: true, afterHours: 500, modelo: { name: "a", language: "pt_BR", params: [] } })?.afterHours).toBe(168);
  });
});
