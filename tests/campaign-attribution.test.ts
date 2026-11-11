import { describe, expect, it } from "vitest";
import { addDays, brDay, isAttributedSale } from "@/lib/campaign-attribution";

const sentAt = new Date("2026-11-10T14:00:00-03:00");
const base = { sentDay: "2026-11-10", sentAt, windowDays: 7 };

describe("atribuição de venda a campanha", () => {
  it("não conta compra feita antes do dia do disparo", () => {
    expect(isAttributedSale({ ...base, saleDay: "2026-11-09", firstSeen: new Date("2026-11-09T10:00:00-03:00") })).toBe(false);
  });

  it("conta compra nos dias seguintes, dentro da janela de 7 dias", () => {
    expect(isAttributedSale({ ...base, saleDay: "2026-11-12", firstSeen: new Date("2026-11-12T11:00:00-03:00") })).toBe(true);
    expect(isAttributedSale({ ...base, saleDay: "2026-11-17", firstSeen: null })).toBe(true);
  });

  it("não conta compra depois da janela", () => {
    expect(isAttributedSale({ ...base, saleDay: "2026-11-18", firstSeen: null })).toBe(false);
  });

  it("no mesmo dia, só conta se o pedido entrou no ERP depois da mensagem", () => {
    expect(isAttributedSale({ ...base, saleDay: "2026-11-10", firstSeen: new Date("2026-11-10T16:30:00-03:00") })).toBe(true);
    expect(isAttributedSale({ ...base, saleDay: "2026-11-10", firstSeen: new Date("2026-11-10T09:15:00-03:00") })).toBe(false);
  });

  it("no mesmo dia sem registro de sincronização, conta (não há como provar que veio antes)", () => {
    expect(isAttributedSale({ ...base, saleDay: "2026-11-10", firstSeen: null })).toBe(true);
  });

  it("respeita janela configurada diferente", () => {
    expect(isAttributedSale({ ...base, windowDays: 3, saleDay: "2026-11-13", firstSeen: null })).toBe(true);
    expect(isAttributedSale({ ...base, windowDays: 3, saleDay: "2026-11-14", firstSeen: null })).toBe(false);
  });
});

describe("datas no fuso de Brasília", () => {
  it("disparo às 23h de Brasília ainda é do mesmo dia (UTC já virou)", () => {
    expect(brDay(new Date("2026-11-11T02:30:00Z"))).toBe("2026-11-10");
  });

  it("soma dias atravessando o mês", () => {
    expect(addDays("2026-11-28", 7)).toBe("2026-12-05");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });
});
