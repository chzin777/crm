import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "@/lib/ai/agent-core";
import { DEFAULT_AI_SETTINGS } from "@/lib/ai/settings";
import { splitBubbles } from "@/lib/ai/bubbles";
import { buildProductCard, CARD_QUESTION, cardStore, commercialName, PRODUCT_CARD_TEMPLATE, type ProductCardFields } from "@/lib/ai/product-card";
import { cardGuidance, parseSheet, shortAttribute } from "@/lib/ai/product-details";

const justin: ProductCardFields = {
  ...commercialName("OCS RAY BAN REF-RB4165 JUSTIN 622/8G", "RAY BAN"),
  formatoArmacao: "Quadrada",
  acabamentoOuMaterial: "Emborrachado",
  valorFormatado: "R$ 1.210,27",
  totalUnidades: 1,
  lojasDisponiveis: [cardStore({ loja: "Loja Setor Marista — Rua 27, 2106", quantidade: 1, cidade: "Goiânia" })],
};

describe("ficha de produto no template visual do negócio", () => {
  it("campos estruturados: nome comercial limpo, referência e categoria (sem prefixo do ERP)", () => {
    expect(commercialName("OCS RAY BAN REF-RB4165 JUSTIN 622/8G", "RAY BAN")).toEqual({ nomeComercial: "Ray-Ban Justin", referencia: "RB4165", categoriaModelo: "Óculos de sol" });
    expect(commercialName("ARM MIUMIU REF 0MU 01XV 19P1O150", "MIUMIU")).toEqual({ nomeComercial: "Miu Miu", referencia: "MU 01XV", categoriaModelo: "Armação de grau" });
    // Cadastro real do ERP (sem apelido): nome comercial conhecido pela referência, sem o "0" interno.
    expect(commercialName("OCS RAY BAN REF 0RB4165L 622/T357", "RAY BAN")).toEqual({ nomeComercial: "Ray-Ban Justin", referencia: "RB4165L", categoriaModelo: "Óculos de sol" });
    expect(commercialName("ARM RAY BAN REF 0RX5429 2012  51", "RAY BAN")).toEqual({ nomeComercial: "Ray-Ban", referencia: "RX5429", categoriaModelo: "Armação de grau" });
    expect(commercialName("OCS OAKLEY REF 0OO9102 9102D555", "OAKLEY").nomeComercial).toBe("Oakley Holbrook");
    expect(cardStore({ loja: "Loja Taguatinga Centro (Taguatinga) — C 9", quantidade: 2, cidade: "Taguatinga (DF)" })).toEqual({ loja: "Loja Taguatinga Centro", cidade: "Taguatinga (DF)", endereco: "C 9", quantidade: 2 });
  });

  it("1 unidade em 1 loja: saudação, linhas com emojis, singular e 2ª bolha depois do ---SPLIT---", () => {
    const card = buildProductCard(justin);
    expect(card).toBe([
      "Temos sim! 😊",
      "",
      "🕶️ *Ray-Ban Justin | Ref. RB4165*",
      "Ⓜ️ *Modelo:* Óculos de sol",
      "👓 *Armação:* Quadrada",
      "✨ *Acabamento:* Emborrachado",
      "💵 *Valor:* R$ 1.210,27",
      "📦 *Estoque:* 1 unidade disponível na seguinte loja:",
      "📍 *Loja Setor Marista* – Goiânia (Rua 27, 2106)",
    ].join("\n"));
    // Resposta da IA copiando a ficha + pergunta: 2 mensagens, a ficha intacta na 1ª.
    const parts = splitBubbles(`${card}\n\n---SPLIT---\n\n${CARD_QUESTION}`);
    expect(parts).toEqual([card, CARD_QUESTION]);
  });

  it("várias lojas: plural \"nas seguintes lojas:\" e uma linha 📍 por unidade", () => {
    const card = buildProductCard({
      ...justin,
      totalUnidades: 3,
      lojasDisponiveis: [
        cardStore({ loja: "Loja Setor Marista — Rua 27, 2106", quantidade: 2, cidade: "Goiânia" }),
        cardStore({ loja: "Loja Taguatinga Centro (Taguatinga) — C 9", quantidade: 1, cidade: "Taguatinga (DF)" }),
      ],
    });
    expect(card).toContain("📦 *Estoque:* 3 unidades disponíveis nas seguintes lojas:\n📍 *Loja Setor Marista* – Goiânia (Rua 27, 2106)\n📍 *Loja Taguatinga Centro* – Taguatinga (DF) (C 9)");
    expect(card.match(/📍/g)).toHaveLength(2);
  });

  it("sem formato/acabamento/valor: omite só essas linhas, sem \"Não informado\" nem \"N/A\"", () => {
    const card = buildProductCard({ ...justin, formatoArmacao: null, acabamentoOuMaterial: null, valorFormatado: null });
    expect(card).not.toMatch(/Armação:|Acabamento:|Valor:|N\/A|Não informado/);
    expect(card).toContain("Ⓜ️ *Modelo:* Óculos de sol\n📦 *Estoque:*");
    // Lente de contato não tem linha de armação.
    expect(buildProductCard({ ...justin, categoriaModelo: "Lente de contato" })).not.toContain("👓");
    // Atributos da busca web: "N/A"/"não informado"/frase longa viram null.
    expect(shortAttribute("N/A")).toBeNull();
    expect(shortAttribute("não informado")).toBeNull();
    expect(shortAttribute("acetato")).toBe("Acetato");
    expect(parseSheet(JSON.stringify({ miniDescricao: "x", formato: "quadrada", acabamento: null }))).toMatchObject({ formato: "Quadrada", acabamento: null });
  });

  it("prompt traz o template exato e o resultado orienta copiar a fichaFormatada", () => {
    const prompt = buildSystemPrompt({ settings: DEFAULT_AI_SETTINGS, info: "" });
    expect(prompt).toContain(PRODUCT_CARD_TEMPLATE);
    for (const piece of ["Temos sim! 😊", "🕶️ *[Nome Comercial] | Ref. [Referência]*", "Ⓜ️ *Modelo:*", "👓 *Armação:*", "✨ *Acabamento:*", "💵 *Valor:*", "📦 *Estoque:*", "📍 *[Nome da Loja]* – [Cidade] ([Endereço completo])", "---SPLIT---", "nunca escreva \"Não informado\" ou \"N/A\""]) {
      expect(PRODUCT_CARD_TEMPLATE).toContain(piece);
    }
    expect(cardGuidance()).toContain("use o campo fichaFormatada exatamente como veio");
  });
});
