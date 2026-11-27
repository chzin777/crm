import { describe, expect, it } from "vitest";
import {
  attendantKpis,
  buildAttributableOrders,
  matchOrderToConversation,
  parseAttendanceVerdict,
  type AttendanceCandidate,
  type VmsetLine,
} from "@/lib/attendants/attribution";
import { cpfKey, phoneMatchKey } from "@/lib/commercial/insights";

const attendance: AttendanceCandidate = {
  id: "conv-1",
  attendanceAt: new Date("2026-11-03T14:00:00.000Z"),
  attendanceDay: "2026-11-03",
  contactKeys: ["cpf:12345678901", "phone:5562987654321"],
  contactName: "Ana Maria Silva",
};

const line = (overrides: Partial<VmsetLine>): VmsetLine => ({
  sourceKey: "cpf:12345678901",
  customerName: "Ana Maria Silva",
  store: "13",
  seller: "Vendedor VMSET",
  orderNumber: "456",
  invoiceNumber: "NF-99",
  orderDay: "2026-11-05",
  invoiceDay: "2026-11-05",
  type: "Venda",
  productCode: "ARM-1",
  description: "Armação",
  category: "ARMAÇÃO",
  amount: 800,
  syncedAt: new Date("2026-11-05T16:00:00.000Z"),
  ...overrides,
});

describe("atribuição de vendas a atendimentos humanos", () => {
  it("cruza cadastro por telefone ou CPF e respeita a janela de 7 ou 15 dias", () => {
    expect(phoneMatchKey("+55 (62) 98765-4321")).toBe("6287654321");
    expect(cpfKey("123.456.789-01")).toBe("12345678901");
    expect(matchOrderToConversation({ sourceKey: "cpf:12345678901", customerName: "Ana", invoiceDay: "2026-11-10", firstSeen: null }, [attendance], 7)?.id).toBe("conv-1");
    expect(matchOrderToConversation({ sourceKey: "phone:5562987654321", customerName: "Ana", invoiceDay: "2026-11-18", firstSeen: null }, [attendance], 15)?.id).toBe("conv-1");
    expect(matchOrderToConversation({ sourceKey: "cpf:12345678901", customerName: "Ana", invoiceDay: "2026-11-18", firstSeen: null }, [attendance], 7)).toBeNull();
  });

  it("exclui linhas devolvidas e pedidos não faturados/cancelados do valor atribuído", () => {
    const orders = buildAttributableOrders([
      line({ amount: 500, productCode: "ARM-1" }),
      line({ amount: 300, productCode: "LENTE-1", description: "Lente" }),
      line({ type: "Devolucao Cliente", invoiceDay: null, amount: null, productCode: "ARM-1" }),
      line({ orderNumber: "789", type: "Venda", invoiceDay: null }),
      line({ orderNumber: "999", type: "Cancelada" }),
    ]);
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ orderNumber: "456", netAmount: 300, invoiceDay: "2026-11-05" });

    expect(buildAttributableOrders([
      line({ amount: 500, productCode: "ARM-2" }),
      line({ type: "Devolucao Cliente", invoiceDay: null, amount: null, productCode: "ARM-2" }),
    ])).toEqual([]);
  });

  it("rejeita compras que já estavam no espelho antes do atendimento no mesmo dia", () => {
    expect(matchOrderToConversation(
      { sourceKey: "cpf:12345678901", customerName: "Ana", invoiceDay: "2026-11-03", firstSeen: new Date("2026-11-03T13:00:00.000Z") },
      [attendance],
      7,
    )).toBeNull();
  });
});

describe("veredito estruturado da auditoria IA", () => {
  it("aceita o formato esperado e rejeita confiança fora da faixa ou campos extras", () => {
    expect(parseAttendanceVerdict({
      is_qualified_attendance: true,
      confidence_score: 92,
      ai_summary: "Consultou armações e encaminhou para a loja Bueno.",
      target_store_indicated: "Loja Bueno",
    })).toMatchObject({ is_qualified_attendance: true, confidence_score: 92 });
    expect(() => parseAttendanceVerdict({
      is_qualified_attendance: false,
      confidence_score: 101,
      ai_summary: "Enviou apenas uma saudação.",
      target_store_indicated: null,
    })).toThrow();
    expect(() => parseAttendanceVerdict({
      is_qualified_attendance: false,
      confidence_score: 40,
      ai_summary: "Enviou apenas uma saudação.",
      target_store_indicated: null,
      extra: "unexpected",
    })).toThrow();
  });
});

describe("KPIs e previsão de premiação", () => {
  const records = [
    { conversationId: "conv-1", saleKey: null, aiStatus: "completed", aiQualified: true, manualDecision: null, netAmount: null },
    { conversationId: "conv-1", saleKey: "sale-1", aiStatus: "completed", aiQualified: true, manualDecision: null, netAmount: 1250.5 },
    { conversationId: "conv-2", saleKey: null, aiStatus: "completed", aiQualified: false, manualDecision: null, netAmount: null },
    { conversationId: "conv-2", saleKey: "sale-2", aiStatus: "completed", aiQualified: false, manualDecision: true, netAmount: 750 },
    { conversationId: "conv-3", saleKey: "sale-3", aiStatus: "completed", aiQualified: true, manualDecision: false, netAmount: 500 },
  ];

  it("calcula venda válida, faturamento, conversão e comissão fixa sem duplicar conversa", () => {
    expect(attendantKpis(records, { mode: "sale", value: 25 })).toEqual({
      qualifiedAttendances: 2,
      validSales: 2,
      revenue: 2000.5,
      conversionRate: 100,
      averageTicket: 1000.25,
      commissionForecast: 50,
    });
  });

  it("calcula comissão percentual sobre o líquido elegível", () => {
    expect(attendantKpis(records, { mode: "percentage", value: 5 }).commissionForecast).toBe(100.03);
  });
});
