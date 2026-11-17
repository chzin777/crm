import { describe, expect, it } from "vitest";
import { isPureGreeting, squeezeRepeats } from "@/lib/ai/greeting";
import { bareNameHint, detectStaffRequest, type StaffMember } from "@/lib/ai/staff-request";
import { welcomeReply } from "@/lib/ai/response-opening";

const STAFF: StaffMember[] = [{ id: "u1", name: "Leandro Martins", queueId: "q1", queueName: "Vendas" }];

describe("saudação informal pura", () => {
  it("letras repetidas viram uma", () => {
    expect(squeezeRepeats("opaaa")).toBe("opa");
    expect(squeezeRepeats("oiiii")).toBe("oi");
    expect(squeezeRepeats("bom diaaa")).toBe("bom dia");
  });

  it.each(["opaa", "opaaa", "oii", "oiii", "olaa", "Olá", "bom diaaa", "Boa tardee!", "boa noite", "eai", "eaí", "e aí", "fala", "salve", "blz", "beleza", "oii, tudo bem?", "Opa, tudo bom?", "oi pessoal", "eae td bem"])("%j é saudação pura", (text) => {
    expect(isPureGreeting(text)).toBe(true);
  });

  it.each(["Leandro", "fala com o Leandro", "oi, tem Ray-Ban?", "bom dia, queria uma armação", "opaa, sou de Goiânia", "salve, quero orçamento", "loja do bueno", "financeiro", ""])("%j não é saudação pura", (text) => {
    expect(isPureGreeting(text)).toBe(false);
  });

  it.each(["opaa", "oiii", "bom diaaa", "eai", "salve", "fala", "blz"])("%j não vira nome de atendente/loja/setor", (text) => {
    expect(bareNameHint(text, "Ana Souza")).toBe("");
    expect(detectStaffRequest(text, STAFF, "Ana Souza")).toBeNull();
  });

  it("nome solto continua sendo pedido de atendente", () => {
    expect(bareNameHint("Leandro", "Ana Souza")).toContain("falar com o Leandro");
    expect(detectStaffRequest("fala com o Leandro", STAFF, "Ana Souza")).toMatchObject({ name: "Leandro" });
  });

  it("a saudação é do modelo: o código não acrescenta frase pronta, só corrige o período errado", () => {
    const now = new Date("2026-11-17T17:00:00Z"); // 14h em Brasília
    expect(welcomeReply("Opa, tudo certo? Me conta o que você procura.", { first: false, customer: "Ana Souza", pendingText: "opaaa", now })).toBe("Opa, tudo certo? Me conta o que você procura.");
    expect(welcomeReply("Bom dia! Me conta o que você procura.", { first: true, customer: "5562999998888", pendingText: "eai", now })).toBe("Boa tarde! Me conta o que você procura.");
    expect(welcomeReply("Me conta o que você procura.", { first: true, customer: "Ana Souza", pendingText: "eai", now })).toBe("Me conta o que você procura.");
  });
});
