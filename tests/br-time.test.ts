import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { brClock, brDay, brDaysAgo, brNextBusinessDay, brStartOfDay, brWallTime, formatBr, purchaseWindow } from "@/lib/br-time";
import { brDay as attributionDay, isAttributedSale } from "@/lib/campaign-attribution";
import { isOpenAt, DEFAULT_SCHEDULE } from "@/lib/chat/hours";
import { greetingFor } from "@/lib/chat/text";
import { clockTime, dayLabel } from "@/lib/chat/format";

// Simula o servidor de produção (container e Postgres em UTC). Intl lê TZ na criação do formatador,
// e os helpers de Brasília passam o fuso explícito, então o resultado não pode depender disso.
const previousTz = process.env.TZ;
beforeAll(() => { process.env.TZ = "UTC"; });
afterAll(() => { process.env.TZ = previousTz; });

// 22:30 de Brasília de 11/11 = 01:30 UTC de 12/11.
const lateNight = new Date("2026-11-12T01:30:00Z");

describe("dia de Brasília com servidor em UTC", () => {
  it("22:30 BRT ainda é o dia 11, embora em UTC já seja 12", () => {
    expect(lateNight.toISOString().slice(0, 10)).toBe("2026-11-12");
    expect(brDay(lateNight)).toBe("2026-11-11");
    expect(brDaysAgo(1, lateNight)).toBe("2026-11-10");
  });

  it("meia-noite de Brasília é 03:00 UTC", () => {
    expect(brStartOfDay("2026-11-11").toISOString()).toBe("2026-11-11T03:00:00.000Z");
  });
});

describe("segmentos ERP: compraram hoje / ontem / últimos dias", () => {
  it("às 22:30 BRT, hoje é 11/11 e ontem é 10/11", () => {
    expect(purchaseWindow("today", undefined, undefined, lateNight)).toEqual({ start: "2026-11-11", end: "2026-11-11" });
    expect(purchaseWindow("yesterday", undefined, undefined, lateNight)).toEqual({ start: "2026-11-10", end: "2026-11-10" });
  });

  it("últimos 7 dias incluem hoje (05/11 a 11/11)", () => {
    expect(purchaseWindow("within_days", "7", undefined, lateNight)).toEqual({ start: "2026-11-05", end: "2026-11-11" });
  });

  it("intervalo em qualquer ordem; operador desconhecido não filtra nada", () => {
    expect(purchaseWindow("between", "2026-11-10", "2026-11-01")).toEqual({ start: "2026-11-01", end: "2026-11-10" });
    expect(purchaseWindow("xyz", undefined, undefined)).toBeNull();
  });
});

describe("atribuição na virada do dia", () => {
  // Disparo às 23:50 BRT de 10/11 (02:50 UTC de 11/11).
  const sentAt = new Date("2026-11-11T02:50:00Z");

  it("o dia do disparo é 10/11 de Brasília", () => {
    expect(attributionDay(sentAt)).toBe("2026-11-10");
  });

  it("compra de 11/11 (dia seguinte) conta; compra de 10/11 registrada às 21h BRT, antes do disparo, não conta", () => {
    const sentDay = attributionDay(sentAt);
    expect(isAttributedSale({ saleDay: "2026-11-11", firstSeen: new Date("2026-11-11T13:00:00Z"), sentDay, sentAt, windowDays: 7 })).toBe(true);
    expect(isAttributedSale({ saleDay: "2026-11-10", firstSeen: new Date("2026-11-11T00:00:00Z"), sentDay, sentAt, windowDays: 7 })).toBe(false);
  });

  it("compra de 10/11 que só apareceu no ERP depois do disparo conta", () => {
    expect(isAttributedSale({ saleDay: "2026-11-10", firstSeen: new Date("2026-11-11T03:10:00Z"), sentDay: attributionDay(sentAt), sentAt, windowDays: 7 })).toBe(true);
  });
});

describe("horário de atendimento (08:00 às 18:00 BRT) com servidor em UTC", () => {
  const rule = { enabled: true, schedule: DEFAULT_SCHEDULE };

  it("quinta 17:59 BRT (20:59 UTC) aberto; 18:00 BRT (21:00 UTC) fechado", () => {
    expect(isOpenAt(rule, new Date("2026-11-12T20:59:00Z"))).toBe(true);
    expect(isOpenAt(rule, new Date("2026-11-12T21:00:00Z"))).toBe(false);
  });

  it("quinta 08:00 BRT (11:00 UTC) aberto; 07:59 BRT fechado", () => {
    expect(isOpenAt(rule, new Date("2026-11-12T11:00:00Z"))).toBe(true);
    expect(isOpenAt(rule, new Date("2026-11-12T10:59:00Z"))).toBe(false);
  });

  it("sexta 22:30 BRT é sábado 01:30 UTC: vale a regra de sexta (fechado), não a de sábado", () => {
    expect(brClock(new Date("2026-11-14T01:30:00Z"))).toMatchObject({ weekday: 5, hour: 22, minute: 30 });
    expect(isOpenAt(rule, new Date("2026-11-14T01:30:00Z"))).toBe(false);
  });

  it("saudação pela hora de Brasília", () => {
    expect(greetingFor(new Date("2026-11-12T12:00:00Z"))).toBe("bom dia"); // 09:00 BRT
    expect(greetingFor(new Date("2026-11-12T18:00:00Z"))).toBe("boa tarde"); // 15:00 BRT (UTC diria boa noite)
    expect(greetingFor(lateNight)).toBe("boa noite");
  });
});

describe("agendamentos (mensagem e retorno)", () => {
  it("09:00 escolhido na tela é 12:00 UTC, qualquer que seja o fuso do navegador", () => {
    expect(brWallTime("2026-11-13", "09:00")?.toISOString()).toBe("2026-11-13T12:00:00.000Z");
    expect(brWallTime("2026-11-13", "23:30")?.toISOString()).toBe("2026-11-14T02:30:00.000Z");
    expect(brWallTime("13/11/2026", "09:00")).toBeNull();
  });

  it("'Amanhã 9h' numa sexta às 22:30 BRT vai para segunda 09:00 BRT", () => {
    const fridayNight = new Date("2026-11-14T01:30:00Z"); // sexta 13/11 22:30 BRT
    expect(brNextBusinessDay(1, 9, fridayNight).toISOString()).toBe("2026-11-16T12:00:00.000Z");
  });
});

describe("formatação na interface", () => {
  it("timestamps exibidos no horário de Brasília", () => {
    expect(formatBr(lateNight, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })).toBe("11/11, 22:30");
    expect(clockTime("2026-11-12T01:30:00Z")).toBe("22:30");
    expect(formatBr(null)).toBe("");
    expect(formatBr("data inválida")).toBe("");
  });

  it("'Hoje' e 'Ontem' pelos dias de Brasília", () => {
    expect(dayLabel("2026-11-12T01:30:00Z", lateNight)).toBe("Hoje");
    expect(dayLabel("2026-11-11T02:00:00Z", lateNight)).toBe("Ontem"); // 10/11 23:00 BRT
    expect(dayLabel("2026-11-10T02:00:00Z", lateNight)).toBe("09 de novembro de 2026"); // 09/11 23:00 BRT
  });
});
