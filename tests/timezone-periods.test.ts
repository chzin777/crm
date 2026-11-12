import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Módulos de servidor importados pelas métricas: o teste só exercita o cálculo de período.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/generated/prisma/client", () => ({ Prisma: { sql: () => ({}), join: () => ({}), empty: {} } }));

import { resolvePeriod } from "@/lib/service-metrics";
import { resolveCustomerPeriod } from "@/lib/customer-dashboard";
import { addDays, brDay, brStartOfDay, formatBr } from "@/lib/br-time";

// Servidor de produção em UTC; 22:30 BRT de 11/11 = 01:30 UTC de 12/11.
const previousTz = process.env.TZ;
beforeAll(() => { process.env.TZ = "UTC"; });
afterAll(() => { process.env.TZ = previousTz; });
afterEach(() => { vi.useRealTimers(); });

const lateNight = new Date("2026-11-12T01:30:00Z");

describe("métricas de atendimento às 22:30 BRT com servidor em UTC", () => {
  it("'Hoje' é 11/11 de Brasília: de 03:00Z de 11/11 a 03:00Z de 12/11", () => {
    vi.useFakeTimers({ now: lateNight, toFake: ["Date"] });
    const period = resolvePeriod({ preset: "today" } as Parameters<typeof resolvePeriod>[0]);
    expect(period.startDay).toBe("2026-11-11");
    expect(period.endDay).toBe("2026-11-11");
    expect(period.from.toISOString()).toBe("2026-11-11T03:00:00.000Z");
    expect(period.to.toISOString()).toBe("2026-11-12T03:00:00.000Z");
  });

  it("últimos 7 dias: 05/11 a 11/11, comparando com a semana anterior", () => {
    vi.useFakeTimers({ now: lateNight, toFake: ["Date"] });
    const period = resolvePeriod({ preset: "7d" } as Parameters<typeof resolvePeriod>[0]);
    expect(period.startDay).toBe("2026-11-05");
    expect(period.prevFrom.toISOString()).toBe("2026-10-29T03:00:00.000Z");
  });
});

describe("painel de clientes às 22:30 BRT com servidor em UTC", () => {
  it("mês corrente e últimos 30 dias ancorados no dia de Brasília", () => {
    vi.useFakeTimers({ now: new Date("2026-12-01T02:00:00Z"), toFake: ["Date"] }); // 30/11 23:00 BRT
    const month = resolveCustomerPeriod({ preset: "month", compare: "prev", inactiveDays: 180 } as Parameters<typeof resolveCustomerPeriod>[0]);
    expect(month.startDay).toBe("2026-11-01");
    expect(month.endDay).toBe("2026-11-30");
  });
});

describe("tendência semanal do NPS", () => {
  it("semana começa à meia-noite de Brasília e o rótulo usa o dia de Brasília", () => {
    const startDay = addDays(brDay(lateNight), -7);
    expect(startDay).toBe("2026-11-04");
    expect(brStartOfDay(startDay).toISOString()).toBe("2026-11-04T03:00:00.000Z");
    // Resposta às 23:00 BRT de 10/11 (02:00Z de 11/11) ainda é da semana que começou em 04/11.
    const answer = new Date("2026-11-11T02:00:00Z");
    expect(answer >= brStartOfDay(startDay) && answer < brStartOfDay(addDays(startDay, 7))).toBe(true);
    expect(formatBr(brStartOfDay(startDay), { day: "2-digit", month: "2-digit" })).toBe("04/11");
  });
});
