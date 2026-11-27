import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (...path: string[]) => readFileSync(join(process.cwd(), ...path), "utf8");

describe("vendido da campanha = mesma fonte e filtros do /vendas/ao-vivo", () => {
  const metrics = read("lib", "campaign-metrics.ts");
  const live = read("scripts", "vmset-stock-api.py");
  const liveSql = live.slice(live.indexOf('SALES_SQL = """'), live.indexOf('"""', live.indexOf('SALES_SQL = """') + 15));

  it("o espelho lido pela campanha é a tab_dados_dinamicos, a mesma do ao vivo", () => {
    expect(liveSql).toContain("FROM tab_dados_dinamicos T");
    expect(read("scripts", "vmset-sync.py")).toContain("SELECT * FROM tab_dados_dinamicos");
    expect(metrics).toContain('FROM "VmsetSale"');
  });

  it("só venda faturada (com nota), como o ao vivo filtra pela DATA_NOTA", () => {
    expect(liveSql).toContain("T.TIPO = 'Venda' AND T.DATA_NOTA >= :a");
    expect(metrics).toContain(`("type" = 'Venda' AND "invoiceDate" IS NOT NULL`);
  });

  it("mesmas lojas fora do faturamento (100–199 e 1000–2999)", () => {
    expect(liveSql).toContain("T.LOJA NOT BETWEEN 100 AND 199 AND T.LOJA NOT BETWEEN 1000 AND 2999");
    expect(metrics).toMatch(/NOT BETWEEN 100 AND 199[\s\S]*NOT BETWEEN 1000 AND 2999/);
    expect(metrics).toContain("AND ${SALES_LIVE_STORE_FILTER}");
  });
});
