import { describe, expect, it } from "vitest";
import { rankLeaders, searchLeaders, sellerKey, sellerLeaders, storeLeaders } from "@/lib/sales-live/leaderboard";
import type { LiveOrder } from "@/lib/sales-live/feed";

const order = (over: Partial<LiveOrder>): LiveOrder => ({
  key: "18-1", store: "18", storeLabel: "Loja 18 · Setor Bueno", order: "1", at: "2026-11-26T15:00:00Z", time: "12:00", amount: 1000, items: 1,
  summary: "Ray-Ban", seller: "Thamyres Lima", payment: null, fromCrm: false, version: "1", ...over,
});

describe("ranking unificado (lojas e vendedores)", () => {
  const stores = storeLeaders([
    { store: "18", storeLabel: "Loja 18 · Setor Bueno", amount: 9200, orders: 10 },
    { store: "34", storeLabel: "Loja 34 · Setor Marista", amount: 12000, orders: 6 },
    { store: "29", storeLabel: "Loja 29 · Senador Canedo", amount: 800, orders: 2 },
    { store: "40", storeLabel: "Loja 40", amount: 0, orders: 0 },
  ]);

  it("ordena por faturamento com posição, % do total e barra proporcional ao líder", () => {
    const rows = rankLeaders(stores, "amount");
    expect(rows.map((row) => [row.key, row.position])).toEqual([["34", 1], ["18", 2], ["29", 3]]);
    expect(rows[0].progress).toBe(100);
    expect(Math.round(rows[1].progress)).toBe(77);
    expect(Math.round(rows[0].share)).toBe(55);
    expect(rows[1].subtitle.replace(/ /g, " ")).toBe("10 pedidos · ticket R$ 920");
  });

  it("alterna para ordenar por quantidade de pedidos", () => {
    const rows = rankLeaders(stores, "orders");
    expect(rows.map((row) => row.key)).toEqual(["18", "34", "29"]);
    expect(Math.round(rows[0].share)).toBe(56);
  });

  it("vendedores somam por loja + nome, com o mesmo formato de linha", () => {
    const orders = [
      order({ key: "18-1", amount: 1000 }),
      order({ key: "18-2", amount: 500 }),
      order({ key: "34-3", store: "34", storeLabel: "Loja 34 · Setor Marista", seller: "Thamyres Lima", amount: 300 }),
      order({ key: "34-4", store: "34", storeLabel: "Loja 34 · Setor Marista", seller: "João Pedro", amount: 2000 }),
      order({ key: "18-5", seller: null, amount: 999 }),
    ];
    const rows = rankLeaders(sellerLeaders(orders));
    expect(rows.map((row) => [row.name, row.amount])).toEqual([["João Pedro", 2000], ["Thamyres Lima", 1500], ["Thamyres Lima", 300]]);
    expect(rows[1].subtitle).toBe("Loja 18 · Setor Bueno · 2 vendas");
    expect(rows[1].key).toBe(sellerKey(orders[0]));
    expect(searchLeaders(rows, "marista").map((row) => row.name)).toEqual(["João Pedro", "Thamyres Lima"]);
    expect(searchLeaders(rows, "joao").map((row) => row.name)).toEqual(["João Pedro"]);
  });
});
