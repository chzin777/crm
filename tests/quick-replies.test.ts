import { describe, expect, it } from "vitest";
import { matchesQuickReply, normalizeShortcut } from "@/lib/chat/quick-replies";

describe("respostas rápidas", () => {
  it("normaliza o atalho", () => {
    expect(normalizeShortcut("/Pix Rápido")).toBe("pix-rapido");
    expect(normalizeShortcut("//garantia!")).toBe("garantia");
    expect(normalizeShortcut("  ")).toBe("");
  });

  it("busca por atalho com ou sem barra, título, categoria e texto", () => {
    const item = { shortcut: "pix", title: "Pagamento", category: "Financeiro", text: "Chave Pix: 123" };
    expect(matchesQuickReply(item, "/pi")).toBe(true);
    expect(matchesQuickReply(item, "financ")).toBe(true);
    expect(matchesQuickReply(item, "chave")).toBe(true);
    expect(matchesQuickReply(item, "boleto")).toBe(false);
  });
});
