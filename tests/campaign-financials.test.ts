import { describe, expect, it } from "vitest";
import { brDay, buildOrders, campaignFinancials, isAttributedSale, type SaleItemRow } from "@/lib/campaign-attribution";
import { phoneVariants } from "@/lib/chat/phone";

const item = (patch: Partial<SaleItemRow>): SaleItemRow => ({
  sourceKey: "cpf:1", type: "Venda", orderNumber: "100", day: "2026-11-11", store: "13", productCode: "A",
  amount: 100, invoiceNumber: "500", description: "LENTE", syncedAt: new Date("2026-11-11T15:00:00-03:00"), ...patch,
});

describe("pedidos do ERP", () => {
  it("itens do mesmo pedido viram um pedido; pedidos diferentes do mesmo cliente contam separados", () => {
    const orders = buildOrders([
      item({ productCode: "A", amount: 1404.9 }),
      item({ productCode: "B", amount: 345.1 }),
      item({ orderNumber: "101", productCode: "C", amount: 820 }),
    ]);
    expect(orders).toHaveLength(2);
    expect(orders.find((order) => order.pedido === "100")).toMatchObject({ total: 1750, itens: 2 });
    expect(new Set(orders.map((order) => order.sourceKey)).size).toBe(1); // 2 pedidos, 1 cliente
  });

  it("item devolvido sai do pedido; pedido todo devolvido some da soma", () => {
    const orders = buildOrders([
      item({ productCode: "A", amount: 1000 }),
      item({ productCode: "B", amount: 300 }),
      item({ type: "Devolucao Cliente", productCode: "B", amount: null }),
      item({ orderNumber: "200", productCode: "X", amount: 700 }),
      item({ orderNumber: "200", type: "Devolucao Cliente", productCode: "X", amount: null }),
    ]);
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ pedido: "100", total: 1000, itens: 1 });
  });

  it("devolução de outro cliente, ou de um pedido antigo com o mesmo número, não afeta", () => {
    const orders = buildOrders([
      item({ amount: 500 }),
      item({ sourceKey: "cpf:2", type: "Devolucao Cliente", amount: null }),
      // O ERP reaproveita números de pedido: a devolução de 2021 do pedido "100" não é deste pedido de 2026.
      item({ type: "Devolucao Cliente", amount: null, day: "2021-10-26" }),
    ]);
    expect(orders[0].total).toBe(500);
  });

  it("soma em centavos exatos", () => {
    expect(buildOrders([item({ productCode: "A", amount: 0.1 }), item({ productCode: "B", amount: 0.2 })])[0].total).toBe(0.3);
  });
});

describe("fuso horário da atribuição", () => {
  it("pedido que entrou no ERP minutos antes do disparo, no mesmo dia, não conta", () => {
    // Disparo 16:28 de Brasília (19:28 UTC); pedido sincronizado 15:58 de Brasília (18:58 UTC).
    const sentAt = new Date("2026-11-10T19:28:24Z");
    const firstSeen = new Date("2026-11-10T18:58:07Z");
    expect(isAttributedSale({ saleDay: "2026-11-10", firstSeen, sentDay: brDay(sentAt), sentAt, windowDays: 7 })).toBe(false);
  });

  it("disparo às 22h de Brasília (01h UTC do dia seguinte) usa o dia de Brasília", () => {
    const sentAt = new Date("2026-11-11T01:00:00Z");
    expect(brDay(sentAt)).toBe("2026-11-10");
    expect(isAttributedSale({ saleDay: "2026-11-11", firstSeen: new Date("2026-11-11T13:00:00Z"), sentDay: brDay(sentAt), sentAt, windowDays: 7 })).toBe(true);
  });
});

describe("indicadores financeiros", () => {
  // Números da campanha auditada: 3.928 entregues a R$ 0,34, 30 pedidos de 24 clientes, R$ 58.144,20.
  const result = campaignFinancials({ revenue: 58144.2, cost: 1335.52, buyers: 24, recipients: 3928, orders: 30 });

  it("retorno, ROAS, conversão e tickets", () => {
    expect(Number(result.roi?.toFixed(1))).toBe(4253.7);
    expect(Number(result.roas?.toFixed(1))).toBe(43.5);
    expect(Number(result.conversionRate?.toFixed(2))).toBe(0.61);
    // Como a tela formata (Intl, pt-BR): 58.144,20 ÷ 24 = 2.422,675 → R$ 2.422,68.
    const brl = (value: number | null) => value?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\s/g, " ");
    expect(brl(result.averageTicket)).toBe("R$ 2.422,68");
    expect(brl(result.ticketPerOrder)).toBe("R$ 1.938,14");
  });

  it("custo da Meta é entregues × tarifa", () => {
    expect(Math.round(3928 * 0.34 * 100) / 100).toBe(1335.52);
  });

  it("sem gasto, retorno e ROAS não se aplicam; sem compradores, ticket não se aplica", () => {
    const empty = campaignFinancials({ revenue: 0, cost: 0, buyers: 0, recipients: 0, orders: 0 });
    expect(empty).toEqual({ conversionRate: null, averageTicket: null, ticketPerOrder: null, roi: null, roas: null });
  });

  it("retorno negativo quando vende menos que o gasto", () => {
    expect(campaignFinancials({ revenue: 50, cost: 100, buyers: 1, recipients: 10, orders: 1 }).roi).toBe(-50);
  });
});

describe("cruzamento por telefone", () => {
  it("celular antigo sem o 9 ganha a variante; telefone fixo não", () => {
    expect(phoneVariants("6298887766")).toContain("62998887766");
    expect(phoneVariants("6232123456")).not.toContain("62932123456");
  });
});
