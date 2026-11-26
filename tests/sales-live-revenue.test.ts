import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildOrders, dayKpis, dayOfInstant, isClosedStore, parseReturns, periodRange, returnsByStore, type SaleItem } from "@/lib/sales-live/feed";

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
  it("conta toda venda lançada no dia (Faturado, A Liberar, Reservado e Aberto), só cancelado fora, pela data de emissão", () => {
    const sql = salesSql();
    expect(sql).toContain("PS.PDSD_STATUS <> 'Cancelado' AND NVL(TRIM(PS.STATUS), 'Ativo') <> 'Inativo'");
    expect(sql).toContain("PS.PDSD_DT_EMISSAO >= :a AND PS.PDSD_DT_EMISSAO < :b");
  });

  it("vendedor, cliente, produto e pagamento entram por LEFT JOIN (nenhuma venda some sem cadastro)", () => {
    const sql = salesSql();
    for (const join of ["PARCEIRO V ON", "PARCEIRO P ON", "ITEM_PEDIDO_SAIDA I ON", "PRODUTO PR ON", "TIPO_DOCUMENTO D ON", "CONDICAO_PAGTO CPG ON"]) {
      expect(sql).toContain(`LEFT JOIN ${join}`);
    }
    // JOINs obrigatórios: a unidade que emitiu o pedido e o tipo de movimento "Venda".
    expect(sql.match(/(^|\n)JOIN /g)).toHaveLength(2);
  });

  it("só movimento de venda: bonificação, livre emissão, devolução de compra, cancelamento fora do dia e transferência ficam de fora", () => {
    const sql = salesSql();
    expect(sql).toContain("JOIN TIPO_MOV_ESTOQUE TM ON TM.TIPO_MOV_ESTOQUE_ID = PS.TIPO_MOV_ESTOQUE_ID AND TM.TPME_TIPO = 'Venda'");
    expect(sql).toContain("NOT EXISTS (SELECT 1 FROM UNIDADE_EMPRESARIAL U WHERE U.UNIDADE_EMPRESARIAL_ID = PS.PARCEIRO_ID)");
    const source = readFileSync(join(process.cwd(), "scripts", "vmset-stock-api.py"), "utf8");
    expect(source).toContain("T.TIPO = 'Devolucao Cliente' AND T.DATA_PEDIDO >= :a AND T.DATA_PEDIDO < :b");
    expect(source).toMatch(/"returns": entry\["returns"\]/);
  });

  it("loja encerrada sem bloqueio fixo: a consulta do VMSet não exclui a 502", () => {
    const source = readFileSync(join(process.cwd(), "scripts", "vmset-stock-api.py"), "utf8");
    expect(salesSql()).not.toMatch(/NOT IN \(502\)/);
    expect(source).not.toContain("T.LOJA NOT IN (502)");
    expect(isClosedStore("502")).toBe(true);
    expect(isClosedStore("0502")).toBe(true);
    expect(isClosedStore("52")).toBe(false);
  });

  it("período atual sem venda na 502: painel limpo (fora do seletor e do ranking)", () => {
    const orders = buildOrders([item({ id: "b", store: "4", order: "2", orderTotal: 1000 })], "2026-11-26");
    const selector = [...new Set(orders.map((order) => order.store))];
    expect(selector).toEqual(["4"]);
    const kpis = dayKpis(orders, []);
    expect(kpis.revenue).toBe(1000);
    expect(kpis.topStores.map((rank) => rank.store)).toEqual(["4"]);
    expect(orders[0].storeLabel).not.toContain("Encerrada");
  });

  it("período histórico com venda real na 502: soma no total, aparece no seletor e no ranking com (Encerrada)", () => {
    const orders = buildOrders([
      item({ id: "a", store: "502", order: "1", orderTotal: 5000, date: "2026-06-10" }),
      item({ id: "b", store: "4", order: "2", orderTotal: 1000, date: "2026-06-11" }),
    ], "2026-06-01");
    const returns = parseReturns([{ store: "502", order: "9", date: "2026-06-20", amount: 300 }], "2026-06-01");
    expect(returns).toHaveLength(1);
    const kpis = dayKpis(orders, returns);
    expect(kpis.revenue).toBe(5700);
    expect(kpis.orders).toBe(2);
    expect(kpis.topStores[0]).toMatchObject({ store: "502", amount: 4700, storeLabel: "Loja 502 (Encerrada)" });
    const selector = [...new Map(orders.map((order) => [order.store, order.storeLabel])).values()];
    expect(selector).toContain("Loja 502 (Encerrada)");
    expect(selector).toContain("Loja 4");
  });

  it("recebimento de carnê, baixa de parcela e recebimento de título nunca contam como venda", () => {
    const sql = salesSql();
    // Fonte única: pedido de saída com movimento "Venda"; nenhuma tabela financeira (contas a receber, títulos, parcelas).
    expect(sql).toContain("FROM PEDIDO_SAIDA PS");
    expect(sql).toContain("TM.TPME_TIPO = 'Venda'");
    expect(sql).not.toMatch(/TITULO|RECEB|PARCELA|CARNE|CONTAS?_RECEBER|BAIXA/i);
  });

  it("faturamento líquido: devoluções do período abatem o total e a loja que devolveu", () => {
    const orders = buildOrders([
      item({ id: "a", store: "4", order: "1", orderTotal: 1000 }),
      item({ id: "b", store: "4", order: "2", orderTotal: 500 }),
      item({ id: "c", store: "18", order: "3", orderTotal: 800 }),
    ], "2026-11-26");
    const returns = parseReturns([
      { store: "4", order: "90", date: "2026-11-20", amount: 300 },
      { store: "18", order: "91", date: "2026-11-21", amount: 100.5 },
      { store: "18", order: null, date: "x", amount: -5 },
      { order: "sem loja", amount: 10 },
    ], "2026-11-01");
    expect(returns).toHaveLength(2);
    const kpis = dayKpis(orders, returns);
    expect(kpis).toMatchObject({ revenue: 1899.5, returns: 400.5, orders: 3 });
    // Ticket médio continua das vendas (devolução não é pedido).
    expect(kpis.ticket).toBe(766.67);
    expect(kpis.topStores.map((rank) => [rank.store, rank.amount])).toEqual([["4", 1200], ["18", 699.5]]);
    expect(returnsByStore(returns).get("4")).toBe(300);
  });

  it("reprocessar o mesmo período não duplica venda (cada item conta uma vez pelo id do VMSet)", () => {
    const rows = [item({ id: "a", orderTotal: 1000 }), item({ id: "b", orderTotal: 1000 })];
    const once = dayKpis(buildOrders(rows, "2026-11-26")).revenue;
    const twice = dayKpis(buildOrders([...rows, ...rows, ...rows], "2026-11-26")).revenue;
    expect(once).toBe(1000);
    expect(twice).toBe(1000);
  });

  it("Este mês começa no dia 1 em Brasília (sem puxar a noite de 31/10 em UTC)", () => {
    expect(periodRange("month", "2026-11-26")).toEqual({ from: "2026-11-01", to: "2026-11-26" });
    // 31/10 às 22h em Brasília = 01/11 01h UTC: continua sendo venda de outubro.
    expect(dayOfInstant("2026-11-01T01:00:00Z")).toBe("2026-10-31");
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
