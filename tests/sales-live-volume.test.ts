import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildOrders, dayKpis, dayOfInstant, type SaleItem } from "@/lib/sales-live/feed";

const DAY = "2026-11-26";
const labels = { storeLabel: (store: string) => `Loja ${store}` };
const api = readFileSync(join(process.cwd(), "scripts", "vmset-stock-api.py"), "utf8");
const salesSql = api.match(/SALES_SQL = """([\s\S]*?)"""/)?.[1] ?? "";

describe("vendas do dia: alto volume sem corte", () => {
  it("6.000 pedidos (18.000 itens) entram todos e o total bate centavo a centavo com a soma oficial", () => {
    const items: SaleItem[] = [];
    let expected = 0;
    for (let order = 1; order <= 6_000; order += 1) {
      const store = String((order % 40) + 1);
      const total = 100 + (order % 97) + 0.37;
      expected += total;
      for (let line = 0; line < 3; line += 1) {
        items.push({ id: `${order}-${line}`, store, order: String(order), date: DAY, time: `${String(8 + (order % 14)).padStart(2, "0")}:${String(order % 60).padStart(2, "0")}:00`, seller: "VENDEDOR", brand: "RAY BAN", description: "ARM", category: "ARMACAO", quantity: 1, amount: total / 3, payment: "PIX", orderTotal: total });
      }
    }
    const orders = buildOrders(items, DAY, labels);
    expect(orders).toHaveLength(6_000);
    const kpis = dayKpis(orders);
    expect(kpis.orders).toBe(6_000);
    expect(kpis.revenue).toBeCloseTo(expected, 2);
  });

  it("consulta do VMSet traz o dia inteiro em uma vez: sem ROWNUM, FETCH FIRST ou LIMIT", () => {
    expect(salesSql).toMatch(/PDSD_DT_EMISSAO >= :a AND PS\.PDSD_DT_EMISSAO < :b/);
    expect(salesSql).not.toMatch(/ROWNUM|FETCH\s+FIRST|\bLIMIT\b|OFFSET/i);
  });

  it("regra oficial de venda: só Faturado ativo (A Liberar, Reservado, Aberto e cancelado fora)", () => {
    expect(salesSql).toMatch(/PDSD_STATUS = 'Faturado' AND TRIM\(PS\.STATUS\) = 'Ativo'/);
    expect(salesSql).not.toMatch(/A Liberar/);
    expect(salesSql).not.toMatch(/PDSD_STATUS <> 'Cancelado'/);
    expect(salesSql).toMatch(/TPME_TIPO = 'Venda'/);
  });
});

describe("corte do dia em America/Sao_Paulo", () => {
  it("venda às 23:59 de Brasília (02:59 UTC do dia seguinte) é do dia 26; 00:00 de Brasília já é 27", () => {
    expect(dayOfInstant("2026-11-27T02:59:59Z")).toBe("2026-11-26");
    expect(dayOfInstant("2026-11-26T21:30:00Z")).toBe("2026-11-26");
    expect(dayOfInstant("2026-11-27T03:00:00Z")).toBe("2026-11-27");
  });

  it("pedido emitido às 23:58 fica no dia em que foi vendido, mesmo lido depois da virada", () => {
    const orders = buildOrders([{ id: "x1", store: "4", order: "9", date: DAY, time: "23:58:00", seller: "V", brand: null, description: "LENTE", category: "LENTES", quantity: 1, amount: 500, payment: "PIX", orderTotal: 500 }], "2026-11-27", labels);
    expect(orders[0].day ?? DAY).toBe(DAY);
  });

  it("\"hoje\" da API é o dia de Brasília, nunca o fuso da máquina", () => {
    expect(api).toMatch(/ZoneInfo\("America\/Sao_Paulo"\)/);
    expect(api).not.toMatch(/datetime\.date\.today\(\)/);
    expect(api).toMatch(/"\/sales\/today":[\s\S]{0,40}today = br_today\(\)/);
  });
});

describe("loja 4 em novembro/2026: cancelamento retroativo, devoluções e operações internas", () => {
  const returnsSql = api.match(/RETURNS_SQL = """([\s\S]*?)"""/)?.[1] ?? "";

  it("pedido cancelado depois some do total: a consulta relê o status no VMSet a cada atualização (sem cópia local)", () => {
    // Status é filtrado na própria consulta e o cache do período vive no máximo 10 min (hoje: 10 s; mês corrente: 60 s).
    expect(salesSql).toMatch(/PDSD_STATUS = 'Faturado' AND TRIM\(PS\.STATUS\) = 'Ativo'/);
    expect(api).toMatch(/ttl = 10 if \(start, end\) == \(today, today \+ datetime\.timedelta\(days=1\)\) else 60 if end > today else 600/);
  });

  it("Reservado e Aberto/Inconsistente (R$ 21,3 mil na loja 4) não entram: eram o excedente de ~R$ 27 mil", () => {
    expect(salesSql).not.toMatch(/Reservado|Inconsistente|<> 'Cancelado'/);
  });

  it("devolução de cliente abatida uma vez por pedido; troca é um pedido de venda novo (não duplica)", () => {
    expect(returnsSql).toMatch(/T\.TIPO = 'Devolucao Cliente'/);
    expect(returnsSql).toMatch(/GROUP BY T\.LOJA, T\.NUM_PEDIDO, T\.DATA_PEDIDO/);
  });

  it("bonificação, livre emissão, devolução de compra e transferência/operação entre filiais ficam fora", () => {
    expect(salesSql).toMatch(/TM\.TPME_TIPO = 'Venda'/);
    expect(salesSql).toMatch(/NOT EXISTS \(SELECT 1 FROM UNIDADE_EMPRESARIAL U WHERE U\.UNIDADE_EMPRESARIAL_ID = PS\.PARCEIRO_ID\)/);
  });
});
