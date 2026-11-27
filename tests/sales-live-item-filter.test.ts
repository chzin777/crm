import { describe, expect, it } from "vitest";
import { buildOrders, dayKpis, hourlySeries, parseReturns, type SaleItem } from "@/lib/sales-live/feed";
import { ordersInStores } from "@/lib/sales-live/filters";
import { EMPTY_ITEM_FILTER, filterOrdersByItems, filterReturnsByItems, itemFilterOptions, itemTotals, searchOptions, type ItemFilter } from "@/lib/sales-live/item-filter";

const DAY = "2026-11-27";
const sale = (id: string, store: string, order: string, brand: string, category: string, description: string, quantity: number, amount: number, time = "10:00:00"): SaleItem => ({
  id, store, order, time, seller: "Ana", brand, category, description, quantity, amount, date: DAY, orderDate: DAY,
});
// Pedido misto da loja 4: Ray-Ban de sol + lente Varilux; loja 7: dois Ray-Ban de sol e uma Oakley; loja 4: armação Ray-Ban.
const items = [
  sale("1", "4", "100", "RAY BAN", "OCULOS DE SOL", "OCS RAY BAN RB3025 004/78", 1, 899),
  sale("2", "4", "100", "VARILUX", "LENTES OFTALMICAS", "LENTE VARILUX COMFORT", 2, 1600),
  sale("3", "7", "200", "RAY BAN", "OCULOS DE SOL", "OCS RAY BAN RB3025 004/78", 2, 1798, "11:30:00"),
  sale("4", "7", "200", "OAKLEY", "OCULOS DE SOL", "OCS OAKLEY HOLBROOK", 1, 750, "11:30:00"),
  sale("5", "4", "101", "RAY BAN", "ARMACAO DE GRAU", "ARM RAY BAN RX5154", 1, 650, "12:10:00"),
];
const orders = buildOrders(items, DAY, { storeLabel: (store) => `Loja ${store}` });
const returns = parseReturns([
  { store: "7", order: "200", date: DAY, amount: 899, brand: "RAY BAN", category: "OCULOS DE SOL", description: "OCS RAY BAN RB3025 004/78", quantity: 1 },
  { store: "4", order: "90", date: DAY, amount: 300, brand: "VARILUX", category: "LENTES OFTALMICAS", description: "LENTE VARILUX COMFORT", quantity: 1 },
], DAY);
const filter = (patch: Partial<ItemFilter>): ItemFilter => ({ ...EMPTY_ITEM_FILTER, ...patch });

describe("filtros de Produto, Marca e Categoria no /vendas/ao-vivo", () => {
  it("pedido misto: só os itens da marca entram (unidades e R$), nunca o pedido inteiro", () => {
    const rayBan = filterOrdersByItems(orders, filter({ brands: ["Ray-Ban"] }));
    const mixed = rayBan.find((order) => order.order === "100")!;
    expect(mixed.amount).toBe(899);
    expect(mixed.items).toBe(1);
    expect(mixed.lines!.map((line) => line.brand)).toEqual(["Ray-Ban"]);
    expect(itemTotals(rayBan, [])).toMatchObject({ units: 4, amount: 3347 });
    // Sem filtro: o pedido segue com o total oficial (todos os itens).
    expect(orders.find((order) => order.order === "100")!.amount).toBe(2499);
  });

  it("devolução por item abate só do recorte (unidades e R$); a de outra marca não entra", () => {
    const active = filter({ brands: ["Ray-Ban"], categories: ["Oculos De Sol"] });
    const scopedOrders = filterOrdersByItems(orders, active);
    const scopedReturns = filterReturnsByItems(returns, active);
    expect(scopedReturns).toHaveLength(1);
    expect(itemTotals(scopedOrders, scopedReturns)).toEqual({ units: 2, amount: 1798, soldUnits: 3, returnedUnits: 1, returnedAmount: 899 });
    // O card de Faturamento usa a mesma conta líquida.
    expect(dayKpis(scopedOrders, scopedReturns).revenue).toBe(1798);
    // Devolução antiga (sem item) nunca é atribuída a uma marca.
    expect(filterReturnsByItems(parseReturns([{ store: "4", order: "1", date: DAY, amount: 50 }], DAY), active)).toEqual([]);
  });

  it("combina Período + Loja + Categoria + Marca + Produto, e o hora a hora soma o recorte", () => {
    const active = filter({ categories: ["Oculos De Sol"], brands: ["Ray-Ban", "Oakley"], products: ["Ocs Ray Ban Rb3025 004/78"] });
    const scoped = ordersInStores(filterOrdersByItems(orders, active), ["7"]);
    expect(scoped.map((order) => order.key)).toEqual(["7-200"]);
    expect(scoped[0]).toMatchObject({ amount: 1798, items: 2 });
    const series = hourlySeries(scoped, 12);
    expect(series.find((point) => point.hour === 11)).toMatchObject({ revenue: 1798, orders: 1 });
    expect(series.reduce((sum, point) => sum + point.revenue, 0)).toBe(1798);
    // Loja 4 no mesmo recorte: o RB3025 de lá também.
    expect(ordersInStores(filterOrdersByItems(orders, active), ["4"]).map((order) => order.amount)).toEqual([899]);
  });

  it("opções dos seletores com unidades e R$, respeitando os outros filtros, e busca sem acento", () => {
    const options = itemFilterOptions(orders, filter({ categories: ["Oculos De Sol"] }));
    expect(options.brands).toEqual([{ value: "Ray-Ban", units: 3, amount: 2697 }, { value: "Oakley", units: 1, amount: 750 }]);
    expect(options.categories.map((option) => option.value)).toEqual(["Oculos De Sol", "Lentes Oftalmicas", "Armacao De Grau"]);
    expect(searchOptions(options.products, "rb3025").map((option) => option.value)).toEqual(["Ocs Ray Ban Rb3025 004/78"]);
    expect(searchOptions(options.categories, "óculos").map((option) => option.value)).toEqual(["Oculos De Sol"]);
  });
});
