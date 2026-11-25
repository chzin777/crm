import { describe, expect, it } from "vitest";
import { customRecoveryMessage, DEFAULT_COMMERCIAL_SETTINGS, insideWindow, sanitizeCommercialSettings } from "@/lib/commercial/settings";
import { contactLensReminderDue, planContactLensReminder, rxReviewDue } from "@/lib/commercial/recurrence";
import { shouldRecoverBudget } from "@/lib/commercial/insights";

const day = (value: string) => new Date(`${value}T00:00:00Z`);

describe("automações comerciais editáveis em /automacoes", () => {
  it("migra a configuração antiga (modelo escolhido na tela de Conversão Real) para a regra, ativa e com os padrões", () => {
    const migrated = sanitizeCommercialSettings({ rxReviewTemplate: { name: "revisao_grau", language: "pt_BR" }, contactLensTemplate: null, budgetRecoveryEnabled: false });
    expect(migrated.rxReview).toEqual({ enabled: true, template: { name: "revisao_grau", language: "pt_BR" }, days: 335, window: { from: 9, to: 19 } });
    expect(migrated.contactLens).toMatchObject({ enabled: false, template: null, leadDays: 5 });
    expect(migrated.budgetRecovery).toMatchObject({ enabled: false, minHours: 4, maxHours: 6, window: { from: 8, to: 20 }, message: "" });
    // Campos antigos espelhados para a cor anterior do blue/green.
    expect(migrated.rxReviewTemplate).toEqual({ name: "revisao_grau", language: "pt_BR" });
    expect(migrated.budgetRecoveryEnabled).toBe(false);
  });

  it("regra nova prevalece sobre os campos antigos; pausar mantém o modelo, mas desliga o espelho antigo", () => {
    const saved = sanitizeCommercialSettings({ ...DEFAULT_COMMERCIAL_SETTINGS, rxReview: { enabled: false, template: { name: "revisao_grau", language: "pt_BR" }, days: 300, window: { from: 10, to: 18 } } });
    expect(saved.rxReview).toMatchObject({ enabled: false, days: 300, template: { name: "revisao_grau", language: "pt_BR" } });
    expect(saved.rxReviewTemplate).toBeNull();
    expect(sanitizeCommercialSettings(saved).rxReview.days).toBe(300);
  });

  it("valores fora da faixa são corrigidos; ativar sem modelo fica desligado; janela inválida volta ao padrão", () => {
    const settings = sanitizeCommercialSettings({
      rxReview: { enabled: true, template: null, days: 5 },
      contactLens: { enabled: true, template: { name: "lentes", language: "pt_BR" }, leadDays: 99, window: { from: 20, to: 8 } },
      budgetRecovery: { enabled: true, minHours: 6, maxHours: 3, message: "  Oi, {nome}!  " },
    });
    expect(settings.rxReview).toMatchObject({ enabled: false, days: 30 });
    expect(settings.contactLens).toMatchObject({ enabled: true, leadDays: 30, window: { from: 9, to: 19 } });
    expect(settings.budgetRecovery).toMatchObject({ minHours: 6, maxHours: 7, message: "Oi, {nome}!" });
  });

  it("dias configurados mudam o gatilho da revisão de grau e da reposição de lentes", () => {
    const sale = day("2026-01-01");
    expect(rxReviewDue(sale, day("2026-10-27"), 300)).toBe(false); // 299 dias
    expect(rxReviewDue(sale, day("2026-11-05"), 300)).toBe(false); // 308 dias: passou da tolerância de 7
    expect(rxReviewDue(sale, day("2026-10-28"), 300)).toBe(true); // 300 dias
    const items = [{ description: "LENTE DE CONTATO ACUVUE MOIST 1 DAY", quantity: 2 }];
    expect(planContactLensReminder(day("2026-10-01"), items, 10).reminderDate.toISOString().slice(0, 10)).toBe("2026-10-21");
    expect(contactLensReminderDue(planContactLensReminder(day("2026-10-01"), items, 10), day("2026-10-21"))).toBe(true);
  });

  it("horas e janela configuradas valem na recuperação de orçamento", () => {
    const now = new Date("2026-11-25T15:00:00Z");
    const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);
    const base = { lastAuthor: "bot" as const, hasIntent: true, brHour: 12, now, lastAt: hoursAgo(2.5), lastInboundAt: hoursAgo(3) };
    expect(shouldRecoverBudget(base)).toBe(false); // padrão 4 a 6 h
    expect(shouldRecoverBudget(base, { minHours: 2, maxHours: 3, window: { from: 8, to: 20 } })).toBe(true);
    expect(shouldRecoverBudget(base, { minHours: 2, maxHours: 3, window: { from: 13, to: 20 } })).toBe(false);
    expect(insideWindow(8, { from: 8, to: 20 })).toBe(true);
    expect(insideWindow(20, { from: 8, to: 20 })).toBe(false);
  });

  it("texto livre da recuperação com {nome} e {item}", () => {
    expect(customRecoveryMessage("Oi, {nome}! Ficou alguma dúvida sobre o {item}?", { name: "JOÃO PEDRO", item: "Ray-Ban Justin RB4165L" })).toBe("Oi, João! Ficou alguma dúvida sobre o Ray-Ban Justin RB4165L?");
    expect(customRecoveryMessage("Oi, {nome}! Ficou alguma dúvida sobre {item}?", { name: "5562999998888", item: null })).toBe("Oi! Ficou alguma dúvida sobre o que você consultou?");
  });
});
