import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildOrders, CARRIED_HOUR, dayKpis, hourlySeries, saleInstant, saleWhen, type SaleItem } from "@/lib/sales-live/feed";

const TODAY = "2026-11-27";
const item = (id: string, order: string, time: string, amount: number, orderDate = TODAY): SaleItem => ({
  id, store: "8", order, time, seller: "Ana", brand: "RAY BAN", description: "OCS RAY BAN", category: "SOLAR", quantity: 1, amount, orderTotal: amount, date: TODAY, orderDate,
});
const label = (store: string) => `Loja ${store}`;

describe("ritmo hora a hora: nunca venda em hora futura", () => {
  // 14h20 em Brasília: pedidos de hoje até 14h, um pedido de ontem 18:08 faturado hoje e um com relógio adiantado.
  const items = [
    item("a", "100", "09:15:00", 500),
    item("b", "101", "11:40:00", 1200),
    item("c", "102", "14:05:00", 300),
    item("d", "49005", "18:08:21", 2000, "2026-11-26"),
    item("e", "103", "16:02:00", 150),
  ];
  const orders = buildOrders(items, TODAY, { storeLabel: label });

  it("hora do Oracle (Brasília, sem fuso) vira o instante certo: 14:32 BRT = 17:32 UTC", () => {
    expect(saleInstant(TODAY, "14:32:10")).toBe("2026-11-27T17:32:10.000Z");
    expect(saleInstant(TODAY, "23:50")).toBe("2026-11-28T02:50:00.000Z");
  });

  it("pedido de dia anterior faturado hoje fica marcado e no início do dia, nunca às 18h de hoje", () => {
    const carried = orders.find((order) => order.order === "49005")!;
    expect(carried.orderDay).toBe("2026-11-26");
    expect(carried.at).toBe("2026-11-27T03:00:00.000Z");
    expect(saleWhen(carried, new Date("2026-11-27T17:20:00Z"), TODAY)).toBe("Pedido de 26/11 · 18:08 · nota hoje");
  });

  it("às 14h nenhuma barra depois das 14h tem venda; a soma das barras = vendas do dia (bate com o Faturamento + devoluções)", () => {
    const series = hourlySeries(orders, 14);
    expect(series.filter((point) => point.hour > 14).every((point) => point.revenue === 0 && point.orders === 0)).toBe(true);
    expect(series[0]).toMatchObject({ hour: CARRIED_HOUR, label: "Antes", revenue: 2000, orders: 1 });
    // Relógio da loja adiantado (16:02 às 14h20): conta na hora atual.
    expect(series.find((point) => point.hour === 14)).toMatchObject({ revenue: 450, orders: 2 });
    const kpis = dayKpis(orders, [{ store: "8", order: "90", day: TODAY, amount: 250 }]);
    const bars = series.reduce((sum, point) => sum + point.revenue, 0);
    expect(bars).toBe(4150);
    expect(kpis.revenue + kpis.returns).toBe(bars);
    expect(series.at(-1)!.cumulative).toBe(bars);
    expect(kpis.orders).toBe(series.reduce((sum, point) => sum + point.orders, 0));
  });

  it("sem pedido de outro dia não aparece a barra Antes; madrugada e noite entram sem quebrar a soma", () => {
    const series = hourlySeries(buildOrders([item("x", "1", "06:30", 100), item("y", "2", "22:10", 200)], TODAY, { storeLabel: label }), 23);
    expect(series.some((point) => point.hour === CARRIED_HOUR)).toBe(false);
    expect(series[0].hour).toBe(6);
    expect(series.at(-1)!.hour).toBe(23);
    expect(series.reduce((sum, point) => sum + point.revenue, 0)).toBe(300);
  });

  it("a consulta do VMSet traz o dia do pedido (DATA_PEDIDO) junto da hora do pedido", () => {
    const source = readFileSync(join(process.cwd(), "scripts", "vmset-stock-api.py"), "utf8");
    const sql = source.slice(source.indexOf('SALES_SQL = """'), source.indexOf('"""', source.indexOf('SALES_SQL = """') + 15));
    expect(sql).toContain("T.HORA_PEDIDO2");
    expect(sql).toContain("T.DATA_PEDIDO");
    expect(source).toContain('"orderDate": ordered.strftime("%Y-%m-%d") if ordered else None');
  });
});
