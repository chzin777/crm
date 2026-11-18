import { describe, expect, it } from "vitest";
import { triggerMatches } from "@/lib/automations/engine";
import { birthdayMatches, birthdayTarget, brDay, parseBirthDate, saleKey, saleMatches, saleMoment, saleVars, shiftDay, titleMatches, titleVars, type ErpSale, type ErpTitle } from "@/lib/automations/erp-triggers";
import { NODE_DEF, NODE_DEFS, NODE_CATEGORIES, validateGraph, type FlowNode, type NodeType } from "@/lib/automations/nodes";

const sale = (extra: Partial<ErpSale> = {}): ErpSale => ({ sourceKey: "cpf:123", store: "Loja Centro", orderNumber: "5501", orderDate: "2026-11-18", seenAt: new Date("2026-11-18T14:02:00Z"), total: 890.5, items: "Lente Varilux · Armação Ray-Ban", categories: "LENTE ARMACAO", seller: "Ana", priorOrders: 0, ...extra });
const node = (type: NodeType, config: Record<string, unknown> = {}, id = "t"): FlowNode => ({ id, type, position: { x: 0, y: 0 }, data: { config: { ...NODE_DEF[type].defaults, ...config } } });

describe("gatilhos do ERP VMSet", () => {
  it("catálogo agrupado por categoria, com os novos gatilhos", () => {
    expect(NODE_CATEGORIES.map((item) => item.id).slice(0, 4)).toEqual(["gatilho_crm", "gatilho_whatsapp", "erp_vendas", "erp_financeiro"]);
    expect(NODE_DEFS.filter((def) => def.category === "erp_vendas").map((def) => def.type)).toEqual(["trigger_erp_sale", "trigger_erp_after_sale", "trigger_erp_return"]);
    expect(NODE_DEF.trigger_erp_lab_ready.label).toBe("OS pronta para retirada");
    expect(validateGraph({ nodes: [node("trigger_erp_overdue", { amount: 0 }), node("notify", {}, "n")], edges: [{ id: "e", source: "t", target: "n" }] })).toContain("Cliente inadimplente há X: informe o tempo.");
  });

  it("evento do ERP casa só com o nó reservado", () => {
    expect(triggerMatches(node("trigger_erp_sale"), { type: "trigger_erp_sale", nodeId: "t" })).toBe(true);
    expect(triggerMatches(node("trigger_erp_sale"), { type: "trigger_erp_sale", nodeId: "outro" })).toBe(false);
    expect(triggerMatches(node("trigger_erp_sale"), { type: "trigger_erp_return", nodeId: "t" })).toBe(false);
  });

  it("venda: momento, filtros de primeira compra/recompra, valor, loja e categoria", () => {
    expect(saleMoment(sale())).toEqual(new Date("2026-11-18T14:02:00Z"));
    // Venda antiga vista pela primeira vez muito depois: meio-dia do pedido.
    expect(saleMoment(sale({ orderDate: "2025-01-10" }))).toEqual(new Date("2025-01-10T15:00:00Z"));
    expect(saleMatches({ customerType: "first" }, sale())).toBe(true);
    expect(saleMatches({ customerType: "repeat" }, sale())).toBe(false);
    expect(saleMatches({ customerType: "repeat" }, sale({ priorOrders: 2 }))).toBe(true);
    expect(saleMatches({ minAmount: 1000 }, sale())).toBe(false);
    expect(saleMatches({ store: "centro", category: "varilux" }, sale())).toBe(true);
    expect(saleMatches({ store: "shopping" }, sale())).toBe(false);
    expect(saleKey(sale())).toBe("venda:Loja Centro-5501-cpf:123");
    expect(saleVars(sale())["venda.valor"]).toContain("890,50");
    expect(saleVars(sale({ priorOrders: 1 }))["venda.tipo_cliente"]).toBe("recorrente");
  });

  it("financeiro: valor em aberto, filtros e variáveis de atraso", () => {
    const title: ErpTitle = { id: "T1", cpf: "12345678901", name: "Ana", phone: "62999990000", number: "880", installment: "3", due: "2026-11-08", amount: 150, paid: 50, paidAt: null, store: "Loja Centro", invoice: "F1", remaining: 2 };
    expect(titleMatches({ minAmount: 120 }, title, 100)).toBe(false);
    expect(titleMatches({ minAmount: 50, store: "centro" }, title, 100)).toBe(true);
    const vars = titleVars(title, "2026-11-18");
    expect(vars["financeiro.dias_atraso"]).toBe("10");
    expect(vars["financeiro.valor_aberto"]).toContain("100,00");
    expect(vars["financeiro.vencimento"]).toBe("08/11/2026");
  });

  it("datas: dia em Brasília, meses no calendário e aniversário nos formatos do cadastro", () => {
    expect(brDay(new Date("2026-11-19T02:30:00Z"))).toBe("2026-11-18");
    expect(shiftDay("2026-03-31", 1, "months", -1)).toBe("2026-02-28");
    expect(parseBirthDate("25/06/1980")).toEqual({ day: 25, month: 6, year: 1980 });
    expect(parseBirthDate("Wed Jun 25 1980 00:00:00 GMT+0000 (Coordinated Universal Time)")).toEqual({ month: 6, day: 25, year: 1980 });
    expect(parseBirthDate("1980-06-25T00:00:00.000Z")).toEqual({ year: 1980, month: 6, day: 25 });
    expect(parseBirthDate("lixo")).toBeNull();
    const target = birthdayTarget("2026-06-22", 3);
    expect(birthdayMatches({ month: 6, day: 25 }, target)).toBe(true);
    expect(birthdayMatches({ month: 2, day: 29 }, birthdayTarget("2027-02-28", 0))).toBe(true);
  });
});
