import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "@/lib/ai/agent-core";
import { DEFAULT_AI_SETTINGS } from "@/lib/ai/settings";
import { asksAvailability, buildProductCard, cardOpening, cardStore, commercialName, DETAILS_OPENING, PRODUCT_CARD_TEMPLATE } from "@/lib/ai/product-card";
import { modelFamilyKey, referenceKey } from "@/lib/ai/product-names";
import { type StoreInfo } from "@/lib/ai/stock";
import { BROAD_SEARCH_RULES, buildShowcaseResult, showcaseCandidates } from "@/lib/ai/stock-showcase";

const stores = new Map<string, StoreInfo>([["34", { name: "LJ 34 SETOR MARISTA", address: "Rua 27", addressNumber: "2106", neighborhood: null, city: "Goiânia" }]]);
const unit = (qty: number, price: number) => [{ unit: "34", name: "LJ 34 LOJA", qty, price }];

describe("abertura do card e vitrine sem referência duplicada", () => {
  it("\"4165L\" e \"RB4165L\" são o mesmo modelo: 1 item na vitrine, com \"a partir de\" quando o preço varia", () => {
    expect(referenceKey("0RB4165L")).toBe("4165L");
    expect(referenceKey("RB4165L")).toBe("4165L");
    expect(referenceKey("4165L")).toBe("4165L");
    expect(modelFamilyKey("OCS RAY BAN REF 4165L 622/T357", "RAY BAN")).toBe(modelFamilyKey("OCS RAY BAN REF 0RB4165L 601/8G57", "RAY BAN"));
    const catalog = [
      { code: "1", description: "OCS RAY BAN REF 0RB4165L 622/T357", brand: "RAY BAN" },
      { code: "2", description: "OCS RAY BAN REF 4165L 601/8G57", brand: "RAY BAN" },
      { code: "3", description: "OCS RAY BAN REF RB3025L 001/5158", brand: "RAY BAN" },
      { code: "4", description: "OCS RAY BAN REF 3025L 004/5158", brand: "RAY BAN" },
    ];
    const groups = showcaseCandidates(catalog);
    expect(groups.map((group) => group.map((product) => product.code))).toEqual([["1", "2"], ["3", "4"]]);
    const result = buildShowcaseResult({ term: "Ray-Ban", groups, lookup: { stockStatus: "ok", fromCache: 0, requested: 4, byCode: { "1": unit(2, 1070), "2": unit(1, 830), "3": unit(1, 1290), "4": unit(3, 1290) } }, stores, withPrices: true });
    expect(result.modelos).toHaveLength(2);
    expect(result.vitrineFormatada).toContain("🕶️ *Ray-Ban Justin (Ref. RB4165L)* — a partir de R$ 830,00");
    expect(result.vitrineFormatada).toContain("🕶️ *Ray-Ban Aviator Classic (Ref. RB3025L)* — R$ 1.290,00");
    expect(result.vitrineFormatada!.match(/Justin/g)).toHaveLength(1);
    // Etapa 2 usa a referência exata da vitrine (preço do card bate com a lista).
    expect(BROAD_SEARCH_RULES).toContain("referência EXATA exibida na vitrine");
  });

  it("abertura: \"Temos sim! 😊\" só para pergunta de disponibilidade; pedido de ver → apresentação", () => {
    for (const text of ["Vocês têm o Ray-Ban Justin?", "Tem Ray-Ban Justin?", "ainda tem o aviator disponível?", "vcs tem esse?"]) expect(cardOpening(text)).toBe("Temos sim! 😊");
    for (const text of ["Deixa eu ver esse Aviator Classic", "Me mostra o Justin", "Quero saber mais sobre o Justin", "me manda foto do Erika"]) {
      expect(asksAvailability(text)).toBe(false);
      expect(cardOpening(text)).toBe(DETAILS_OPENING);
    }
    const fields = { ...commercialName("OCS RAY BAN REF 0RB3025L 001/5158", "RAY BAN"), formatoArmacao: null, acabamentoOuMaterial: null, valorFormatado: "R$ 1.290,00", totalUnidades: 1, lojasDisponiveis: [cardStore({ loja: "Loja Setor Marista — Rua 27, 2106", quantidade: 1, cidade: "Goiânia" })] };
    const card = buildProductCard(fields, cardOpening("Deixa eu ver esse Aviator Classic"));
    expect(card.startsWith("Aqui estão os detalhes desse modelo! 😊\n\n🕶️ *Ray-Ban Aviator Classic | Ref. RB3025L*")).toBe(true);
    expect(card).not.toContain("Temos sim");
  });

  it("prompt diferencia as aberturas", () => {
    expect(buildSystemPrompt({ settings: DEFAULT_AI_SETTINGS, info: "" })).toContain(PRODUCT_CARD_TEMPLATE);
    for (const piece of ["ABERTURA CONFORME A INTENÇÃO", "\"Temos sim! 😊\" só quando o cliente perguntou se existe/tem", "\"Aqui estão os detalhes desse modelo! 😊\"", "NUNCA \"Temos sim! 😊\" nesse caso"]) expect(PRODUCT_CARD_TEMPLATE).toContain(piece);
  });
});
