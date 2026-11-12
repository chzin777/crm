import { describe, expect, it } from "vitest";
import { aiShouldAttend, asksForHuman, DEFAULT_AI_SETTINGS, inAiSchedule, sanitizeAiSettings, usageCostUsd } from "@/lib/ai/settings";

const base = { ...DEFAULT_AI_SETTINGS, autonomousEnabled: true, attendAtEntry: true, scheduleMode: "always" as const };
const entry = { status: "bot", queueId: null, assigneeId: null, closedAt: null };
const now = new Date("2026-11-12T15:00:00Z"); // quinta 12:00 BRT

describe("quando a IA assume a conversa", () => {
  it("desligada, nunca atende", () => {
    expect(aiShouldAttend({ ...base, autonomousEnabled: false }, entry, now, true)).toBe(false);
  });

  it("na entrada só com a opção ligada; conversa com atendente ou encerrada nunca", () => {
    expect(aiShouldAttend(base, entry, now, true)).toBe(true);
    expect(aiShouldAttend({ ...base, attendAtEntry: false }, entry, now, true)).toBe(false);
    expect(aiShouldAttend(base, { ...entry, assigneeId: "u1" }, now, true)).toBe(false);
    expect(aiShouldAttend(base, { ...entry, closedAt: now }, now, true)).toBe(false);
  });

  it("na fila só nas filas escolhidas", () => {
    const waiting = { status: "waiting", queueId: "vendas", assigneeId: null, closedAt: null };
    expect(aiShouldAttend({ ...base, attendAtEntry: false, queueIds: ["vendas"] }, waiting, now, true)).toBe(true);
    expect(aiShouldAttend({ ...base, attendAtEntry: false, queueIds: ["financeiro"] }, waiting, now, true)).toBe(false);
  });

  it("'fora do horário' segue o horário de atendimento", () => {
    const offHours = { ...base, scheduleMode: "off_hours" as const };
    expect(aiShouldAttend(offHours, entry, now, true)).toBe(false);
    expect(aiShouldAttend(offHours, entry, now, false)).toBe(true);
  });

  it("horários próprios em Brasília, com servidor em UTC", () => {
    const schedule = [{ day: 4, start: "18:00", end: "23:59" }];
    expect(inAiSchedule(schedule, new Date("2026-11-13T01:30:00Z"))).toBe(true); // quinta 22:30 BRT (sexta em UTC)
    expect(inAiSchedule(schedule, new Date("2026-11-12T20:00:00Z"))).toBe(false); // quinta 17:00 BRT
    expect(aiShouldAttend({ ...base, scheduleMode: "custom", schedule }, entry, new Date("2026-11-13T01:30:00Z"), true)).toBe(true);
  });
});

describe("pedido de atendente", () => {
  it("palavra inteira, sem acento nem maiúscula", () => {
    expect(asksForHuman(DEFAULT_AI_SETTINGS, "Quero falar com um ATENDENTE por favor")).toBe(true);
    expect(asksForHuman(DEFAULT_AI_SETTINGS, "vou registrar uma reclamacao")).toBe(true);
    expect(asksForHuman(DEFAULT_AI_SETTINGS, "Qual o horário de vocês?")).toBe(false);
    expect(asksForHuman({ handoffKeywords: ["pessoa"] }, "pessoalmente eu prefiro")).toBe(false);
  });
});

describe("parâmetros salvos", () => {
  it("campos inválidos voltam ao padrão e faixas inválidas saem", () => {
    const settings = sanitizeAiSettings({ maxAiReplies: 999, scheduleMode: "nunca", schedule: [{ day: 9, start: "10:00", end: "11:00" }, { day: 1, start: "12:00", end: "08:00" }, { day: 2, start: "08:00", end: "12:00" }], usdToBrl: "5,20" });
    expect(settings.maxAiReplies).toBe(50);
    expect(settings.scheduleMode).toBe(DEFAULT_AI_SETTINGS.scheduleMode);
    expect(settings.schedule).toEqual([{ day: 2, start: "08:00", end: "12:00" }]);
    expect(settings.usdToBrl).toBe(5.2);
    expect(sanitizeAiSettings(null).topics.length).toBeGreaterThan(0);
  });

  it("custo por milhão de tokens", () => {
    expect(usageCostUsd({ priceInputPerMillionUsd: 0.25, priceOutputPerMillionUsd: 2 }, 4000, 500)).toBeCloseTo(0.002, 6);
  });
});

describe("página /ia: novos parâmetros e permissão", () => {
  it("tom e temperatura: padrão, valores válidos e inválidos", async () => {
    const { sanitizeAiSettings, DEFAULT_AI_SETTINGS } = await import("@/lib/ai/settings");
    expect(sanitizeAiSettings({})).toMatchObject({ tone: DEFAULT_AI_SETTINGS.tone, temperature: null });
    expect(sanitizeAiSettings({ tone: "profissional", temperature: 0.3 })).toMatchObject({ tone: "profissional", temperature: 0.3 });
    expect(sanitizeAiSettings({ tone: "grosseiro", temperature: 5 })).toMatchObject({ tone: DEFAULT_AI_SETTINGS.tone, temperature: 1 });
    // Configuração salva antes da página nova continua valendo, com os campos novos no padrão.
    expect(sanitizeAiSettings({ agentName: "Lia", autonomousEnabled: true })).toMatchObject({ agentName: "Lia", autonomousEnabled: true, tone: "acolhedor", temperature: null });
  });

  it("quem tinha Configurações acessa /ia; quem não tinha, não", async () => {
    const { canAccessModule, moduleForPath } = await import("@/lib/permissions");
    expect(moduleForPath("/ia")).toBe("ia");
    expect(canAccessModule("ia", { configuracoes: true })).toBe(true);
    expect(canAccessModule("ia", { ia: true })).toBe(true);
    expect(canAccessModule("ia", { chat: true })).toBe(false);
  });
});
