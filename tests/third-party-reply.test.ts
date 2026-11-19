import { describe, expect, it } from "vitest";
import { isThirdPartyBusinessText, looksLikeBusinessTemplate } from "@/lib/chat/third-party-reply";

describe("resposta automática de WhatsApp Business de terceiros", () => {
  it("reconhece saudação institucional, ausência e menu", () => {
    expect(isThirdPartyBusinessText("Olá! Obrigado por entrar em contato com a Auto Peças Silva. Em breve responderemos.")).toBe(true);
    expect(isThirdPartyBusinessText("Seja bem-vindo à Transportadora Rota Sul 🚚")).toBe(true);
    expect(isThirdPartyBusinessText("Atendemos toda a rota Goiânia–Anápolis. Deixe sua mensagem que retornaremos.")).toBe(true);
    expect(isThirdPartyBusinessText("Escolha uma opção:\n1 - Orçamento\n2 - Financeiro\n3 - Falar com atendente")).toBe(true);
    expect(isThirdPartyBusinessText("Digite 1 para vendas")).toBe(true);
  });

  it("não confunde com mensagem de cliente", () => {
    expect(isThirdPartyBusinessText("Oi, quero aproveitar a promoção")).toBe(false);
    expect(isThirdPartyBusinessText("Tem óculos de sol da Ray-Ban em Goiânia?")).toBe(false);
    expect(isThirdPartyBusinessText("Quero falar com um atendente")).toBe(false);
  });

  it("texto longo formatado sem relação com ótica é modelo pronto de empresa", () => {
    const template = "🌟 Studio Bella Unhas 🌟\nManicure, pedicure e alongamento\nSegunda a sábado das 8h às 19h\n📍 Rua 10, Centro\nAgende seu horário pelo link na bio 💅";
    expect(looksLikeBusinessTemplate(template)).toBe(true);
    expect(looksLikeBusinessTemplate("Vi a campanha dos óculos e queria saber se ainda tem o modelo aviador em Goiânia, pode me mandar as opções com preço por favor")).toBe(false);
  });
});
