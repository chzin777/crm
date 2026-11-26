import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildOrders, dayKpis, type SaleItem } from "@/lib/sales-live/feed";

const item = (over: Partial<SaleItem>): SaleItem => ({
  id: "1", store: "18", order: "100", time: "10:00:00", seller: "Thamyres Lima", brand: "RAY-BAN", description: "RB4165",
  category: "OCULOS SOLAR", quantity: 1, amount: 500, ...over,
});

// SQL da API do VMSet (scripts/vmset-stock-api.py) que alimenta /vendas/ao-vivo.
const salesSql = () => {
  const source = readFileSync(join(process.cwd(), "scripts", "vmset-stock-api.py"), "utf8");
  return source.slice(source.indexOf('SALES_SQL = """'), source.indexOf('"""', source.indexOf('SALES_SQL = """') + 15));
};

describe("faturamento do /vendas/ao-vivo igual ao relatório do VMSET", () => {
  it("conta vendas Faturado e A Liberar (venda aguardando liberação) pela data de emissão", () => {
    const sql = salesSql();
    expect(sql).toContain("PS.PDSD_STATUS IN ('Faturado', 'A Liberar')");
    expect(sql).toContain("PS.PDSD_DT_EMISSAO >= :a AND PS.PDSD_DT_EMISSAO < :b");
  });

  it("vendedor, cliente, produto e pagamento entram por LEFT JOIN (nenhuma venda some sem cadastro)", () => {
    const sql = salesSql();
    for (const join of ["PARCEIRO V ON", "PARCEIRO P ON", "ITEM_PEDIDO_SAIDA I ON", "PRODUTO PR ON", "TIPO_DOCUMENTO D ON", "CONDICAO_PAGTO CPG ON"]) {
      expect(sql).toContain(`LEFT JOIN ${join}`);
    }
    // O único JOIN obrigatório é a unidade que emitiu o pedido.
    expect(sql.match(/(^|\n)JOIN /g)).toHaveLength(1);
  });

  it("total líquido oficial do pedido uma vez só, mesmo com vários itens e descontos", () => {
    const orders = buildOrders([
      item({ id: "a", amount: 800, orderTotal: 1150.5 }),
      item({ id: "b", amount: 600, orderTotal: 1150.5 }),
      item({ id: "c", order: "101", amount: 99.9, orderTotal: 99.9 }),
    ], "2026-11-26");
    expect(orders.map((order) => order.amount).sort()).toEqual([1150.5, 99.9].sort());
    expect(dayKpis(orders).revenue).toBe(1250.4);
  });

  it("venda sem vendedor e de loja sem cadastro no CRM continua na soma", () => {
    const orders = buildOrders([
      item({ id: "a", seller: null, orderTotal: 300 }),
      item({ id: "b", store: "77", order: "9", seller: null, orderTotal: 700 }),
    ], "2026-11-26", { storeLabel: (store) => (store === "18" ? "Loja 18 · Setor Bueno" : `LJ ${store}`) });
    expect(orders).toHaveLength(2);
    expect(orders.find((order) => order.store === "77")).toMatchObject({ storeLabel: "LJ 77", seller: null, amount: 700 });
    expect(dayKpis(orders).revenue).toBe(1000);
  });

  it("no período, pedido de dia anterior fica no dia da emissão e entra no total", () => {
    const orders = buildOrders([
      item({ id: "a", date: "2026-11-25", orderTotal: 450 }),
      item({ id: "b", order: "200", date: "2026-11-26", orderTotal: 550 }),
    ], "2026-11-25");
    expect(orders.map((order) => order.day).sort()).toEqual(["2026-11-25", "2026-11-26"]);
    expect(dayKpis(orders).revenue).toBe(1000);
  });
});
