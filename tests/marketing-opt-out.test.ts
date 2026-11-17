import { describe, expect, it } from "vitest";
import { detectOptOutCommand, normalizeCommand, optOutKeys, withoutOptedOut } from "@/lib/marketing-opt-out";

describe("comandos de opt-out", () => {
  it.each(["SAIR", "sair", "Parar", " parar! ", "Cancelar recebimento", "Não quero mais", "nao quero mais.", "DESCADASTRAR"])("%s descadastra", (text) => {
    expect(detectOptOutCommand(text)).toBe("opt_out");
  });

  it.each(["REATIVAR", "voltar", "Voltar!"])("%s reativa", (text) => {
    expect(detectOptOutCommand(text)).toBe("opt_in");
  });

  it.each(["quero sair mais cedo", "posso parar no estacionamento?", "oi", "", null, undefined])("%s não é comando", (text) => {
    expect(detectOptOutCommand(text)).toBeNull();
  });

  it("normaliza acento, caixa e pontuação", () => {
    expect(normalizeCommand("  Não   QUERO mais!!! 😡 ")).toBe("NAO QUERO MAIS");
  });
});

describe("campanha não envia para quem pediu SAIR", () => {
  const recipients = [
    { id: "c1", nome: "Ana", telefone: "62999887766" },
    { id: "c2", nome: "Bruno", telefone: "62988776655" },
    { id: "c3", nome: "Carla", telefone: "(62) 97777-6666" },
  ];

  it("contato marcado (marketingOptOut = true) sai da lista por id", () => {
    const keys = optOutKeys([{ id: "c2", phone: null }]);
    expect(withoutOptedOut(recipients, keys).map((item) => item.id)).toEqual(["c1", "c3"]);
  });

  it("cadastro duplicado com o mesmo telefone em outro formato também sai", () => {
    // SAIR veio pelo WhatsApp (5562...) e marcou outro cadastro do mesmo número.
    const keys = optOutKeys([{ id: "outro", phone: "5562977776666" }]);
    expect(withoutOptedOut(recipients, keys).map((item) => item.id)).toEqual(["c1", "c2"]);
  });

  it("sem opt-out ninguém é removido", () => {
    expect(withoutOptedOut(recipients, new Set())).toHaveLength(3);
  });
});
