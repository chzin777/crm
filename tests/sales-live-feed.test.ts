import { describe, expect, it } from "vitest";
import { buildOrders, changedOrders, dayKpis, itemsSummary, mergeOrders, phoneKey, relativeTime, saleInstant, type SaleItem } from "@/lib/sales-live/feed";
import { canAccessModule, moduleForPath } from "@/lib/permissions";

const DAY = "2026-11-27";
const item = (id: string, store: string, order: string, amount: number, extra: Partial<SaleItem> = {}): SaleItem => ({
  id, store, order, time: "14:32:10", seller: "JESSICA DOS SANTOS MELO", brand: "RAY BAN", description: "ARM RAY BAN", category: "ARMACAO", quantity: 1, amount, payment: "VISA PARCELADO", ...extra,
});
const labels = { storeLabel: (store: string) => `Loja ${store}` };

describe("vendas ao vivo: pedidos sem duplicidade", () => {
  it("itens do mesmo pedido viram um card; item repetido (reconexão/reprocesso) conta uma vez", () => {
    const items = [item("a1", "13", "167297", 255.5), item("a2", "13", "167297", 800, { brand: "ZEISS", category: "LENTES", time: "14:33:00" }), item("a1", "13", "167297", 255.5)];
    const orders = buildOrders(items, DAY, labels);
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ key: "13-167297", amount: 1055.5, items: 2, summary: "Ray-Ban, Zeiss", time: "14:32", seller: "Jessica Melo", storeLabel: "Loja 13" });
    expect(orders[0].at).toBe("2026-11-27T17:32:10.000Z");
  });

  it("mesmo número de pedido em lojas diferentes são vendas diferentes; feed do mais recente para o mais antigo", () => {
    const orders = buildOrders([item("b1", "1", "500", 100, { time: "09:00:00" }), item("b2", "2", "500", 200, { time: "10:15:00" })], DAY, labels);
    expect(orders.map((order) => order.key)).toEqual(["2-500", "1-500"]);
  });

  it("mergeOrders nunca duplica: a mesma venda chegando de novo só atualiza; só a realmente nova vira NOVA VENDA", () => {
    const first = buildOrders([item("c1", "5", "10", 300)], DAY, labels);
    const again = mergeOrders(first, first);
    expect(again.orders).toHaveLength(1);
    expect(again.fresh).toEqual([]);
    const updated = buildOrders([item("c1", "5", "10", 300), item("c2", "5", "10", 50)], DAY, labels);
    const next = buildOrders([item("d1", "7", "11", 90, { time: "15:00:00" })], DAY, labels);
    const merged = mergeOrders(first, [...updated, ...next]);
    expect(merged.orders.map((order) => order.key)).toEqual(["7-11", "5-10"]);
    expect(merged.orders.find((order) => order.key === "5-10")?.amount).toBe(350);
    expect(merged.fresh).toEqual(["7-11"]);
  });

  it("changedOrders manda pelo canal só o pedido novo ou alterado", () => {
    const before = buildOrders([item("e1", "1", "1", 100)], DAY, labels);
    const after = buildOrders([item("e1", "1", "1", 100), item("e2", "2", "2", 70)], DAY, labels);
    expect(changedOrders(before, after).map((order) => order.key)).toEqual(["2-2"]);
    expect(changedOrders(after, after)).toEqual([]);
  });
});

describe("agregados do dia", () => {
  it("faturamento, pedidos, ticket médio e top lojas", () => {
    const orders = buildOrders([item("f1", "1", "1", 100), item("f2", "1", "2", 300), item("f3", "2", "3", 250.25), item("f4", "3", "4", 0.1)], DAY, labels);
    const kpis = dayKpis(orders);
    expect(kpis).toMatchObject({ revenue: 650.35, orders: 4, ticket: 162.59 });
    expect(kpis.topStores.map((store) => [store.store, store.amount, store.orders])).toEqual([["1", 400, 2], ["2", 250.25, 1], ["3", 0.1, 1]]);
    expect(dayKpis([])).toEqual({ revenue: 0, orders: 0, ticket: 0, topStores: [] });
  });

  it("formatação: há X seg · HH:MM, resumo de marcas e horário de Brasília", () => {
    const at = saleInstant(DAY, "14:32:00");
    expect(relativeTime(at, new Date(new Date(at).getTime() + 12_000), "14:32")).toBe("há 12 seg · 14:32");
    expect(relativeTime(at, new Date(new Date(at).getTime() + 180_000), "14:32")).toBe("há 3 min · 14:32");
    expect(itemsSummary([{ brand: "RAY BAN", category: null }, { brand: null, category: "LENTES" }, { brand: "OAKLEY", category: null }, { brand: "MIU MIU", category: null }])).toBe("Ray-Ban, Lentes + 2");
    expect(saleInstant(DAY, null)).toBe("2026-11-27T03:00:00.000Z");
  });

  it("cruzamento com o CRM por telefone com ou sem 55 e nono dígito", () => {
    expect(phoneKey("5562985474257")).toBe("6285474257");
    expect(phoneKey("62985474257")).toBe("6285474257");
    expect(phoneKey("6285474257")).toBe("6285474257");
    expect(phoneKey("12345")).toBeNull();
  });

  it("gestão e marketing abrem /vendas/ao-vivo sem liberação nova", () => {
    expect(moduleForPath("/vendas/ao-vivo")).toBe("vendas");
    expect(canAccessModule("vendas", { campanhas: true })).toBe(true);
    expect(canAccessModule("vendas", { painel: true })).toBe(true);
    expect(canAccessModule("vendas", { chat: true })).toBe(false);
  });
});
