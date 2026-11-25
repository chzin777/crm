import { describe, expect, it } from "vitest";
import { goalMonthKey, monthLabel, parseGoalAmount, sellerDisplayName, shiftMonth, storeGoals } from "@/lib/seller-goals-shared";
import { canAccessModule, moduleForPath } from "@/lib/permissions";

describe("metas de vendedores", () => {
  it("meta da loja é a soma das metas dos vendedores da loja, lojas em ordem numérica", () => {
    const stores = storeGoals([
      { storeNumber: 18, goal: 130684 },
      { storeNumber: 18, goal: 96820 },
      { storeNumber: 18, goal: 0 },
      { storeNumber: 4, goal: 50000 },
      { storeNumber: null, goal: 0 },
    ]);
    expect(stores.map((store) => [store.label, store.goal, store.sellers, store.withGoal])).toEqual([
      ["Loja 4", 50000, 1, 1],
      ["Loja 18", 227504, 3, 2],
      ["Sem loja", 0, 1, 0],
    ]);
  });

  it("valor digitado em reais", () => {
    expect(parseGoalAmount("130.684")).toBe(130684);
    expect(parseGoalAmount("1.500,50")).toBe(1500.5);
    expect(parseGoalAmount("R$ 2.000")).toBe(2000);
    expect(parseGoalAmount("1500.5")).toBe(1500.5);
    expect(parseGoalAmount("")).toBe(0);
    expect(parseGoalAmount("-10")).toBe(0);
  });

  it("mês e nome", () => {
    expect(goalMonthKey("2026-11")).toBe("2026-11");
    expect(goalMonthKey("lixo", new Date("2026-12-01T02:00:00Z"))).toBe("2026-11");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(monthLabel("2026-11")).toBe("Novembro de 2026");
    expect(sellerDisplayName("BETANIA ALMEIDA DA COSTA")).toBe("Betania Almeida da Costa");
  });

  it("/vendas/metas: gestão (lojas ou usuários) acessa sem liberação nova", () => {
    expect(moduleForPath("/vendas/metas")).toBe("metas");
    expect(canAccessModule("metas", { lojas: true })).toBe(true);
    expect(canAccessModule("metas", { usuarios: true })).toBe(true);
    expect(canAccessModule("metas", { chat: true })).toBe(false);
  });
});
