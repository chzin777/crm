import { describe, expect, it } from "vitest";
import { cardValue, pipelineKpis } from "@/lib/pipeline-kpis";

const now = new Date("2026-11-24T15:00:00Z");

describe("KPIs da página Pipelines", () => {
  it("valor do card: estimado pela IA ou o R$ digitado", () => {
    expect(cardValue({ estimatedValue: 890, valor: "R$ 100,00" })).toBe(890);
    expect(cardValue({ estimatedValue: null, valor: "R$ 1.290,50" })).toBe(1290.5);
    expect(cardValue({ valor: "" })).toBe(0);
  });

  it("abertos, valor em negociação, ganhos do mês, conversão, ticket e parados", () => {
    const cards = [
      { coluna: "novo-lead", valor: "R$ 500,00", abertaEm: "2026-11-20T12:00:00Z", customerType: "novo" },
      { coluna: "em-atendimento", estimatedValue: 1500, abertaEm: "2026-09-01T12:00:00Z", customerType: "recorrente" },
      { coluna: "ganho", valorFaturado: 2000, entrouEmEtapaEm: "2026-11-10T12:00:00Z" },
      { coluna: "ganho", estimatedValue: 1000, entrouEmEtapaEm: "2026-11-01T02:00:00Z" }, // 31/10 23h em Brasília: mês anterior
    ];
    const kpis = pipelineKpis(cards, { now, isOverdue: (card) => card.coluna === "em-atendimento" });
    expect(kpis).toEqual({
      total: 4,
      open: 2,
      openValue: 2000,
      newLast30: 1,
      wonMonth: 1,
      wonMonthValue: 2000,
      conversion: 0.5,
      averageTicket: 2000,
      overdue: 1,
      recurring: 1,
    });
  });

  it("pipeline vazia não divide por zero", () => {
    expect(pipelineKpis([], { now })).toMatchObject({ total: 0, conversion: null, averageTicket: null, overdue: 0 });
  });
});
