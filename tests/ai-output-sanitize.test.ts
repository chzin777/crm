import { describe, expect, it } from "vitest";
import { withoutDashes, withoutSplitMarkers } from "@/lib/chat/text";
import { cleanReference, commercialName, buildProductCard } from "@/lib/ai/product-card";
import { formatShowcase, type ShowcaseModel } from "@/lib/ai/stock-showcase";
import { withoutRedundantStoreQuestion } from "@/lib/ai/sales-consultant";

describe("---SPLIT--- nunca chega ao cliente", () => {
  const real = "Separei uma opção da Prada em Goiânia pra você, com bom preço.\n\n1. 👓 Prada Linea Rossa Praia Forte (Ref. DO -) — R$ 440,00\n\n---SPLIT---\n\nEssa é uma opção interessante. Quer provar?";
  it.each([real, "a\n---SPLIT---\nb", "a ---SPLIT--- b", "a\n--- split ---\nb", "a [SPLIT] b", "a\n\n---SPLIT---\n\n\nb"])("%j", (text) => {
    const clean = withoutSplitMarkers(text);
    expect(clean).not.toMatch(/split/i);
    expect(clean).not.toMatch(/\n{3,}/);
    expect(withoutDashes(text)).not.toMatch(/split/i);
  });
  it("vira quebra de parágrafo e não mexe em texto sem marcador", () => {
    expect(withoutSplitMarkers("Olá!\n---SPLIT---\nTudo bem?")).toBe("Olá!\n\nTudo bem?");
    expect(withoutSplitMarkers("  texto normal  ")).toBe("  texto normal  ");
  });
});

describe("referência inválida não aparece", () => {
  it.each([["DO -", null], ["-", null], ["DO", null], ["N/A", null], ["null", null], ["undefined", null], ["", null], [null, null], ["DO - 7", null], ["RB4165", "RB4165"], ["PS 07RV", "PS 07RV"], ["DO 1234", "1234"], ["#145145", "#145145"]])("%j → %j", (value, expected) => {
    expect(cleanReference(value)).toBe(expected);
  });
  it("vitrine e ficha sem \"(Ref. DO -)\"", () => {
    const model: ShowcaseModel = { nomeComercial: "Prada Linea Rossa Praia Forte", referencia: "DO -", categoriaModelo: "Armação", precoVenda: "R$ 440,00", totalDisponivelRede: 1, codigos: ["1"] };
    const two = formatShowcase([model, { ...model, nomeComercial: "Prada X", referencia: "-" }]) ?? "";
    expect(two).toContain("1. 👓 *Prada Linea Rossa Praia Forte* — R$ 440,00");
    expect(two).not.toMatch(/\(Ref\./);
    expect(String(commercialName("OCS PRADA LINEA ROSSA PRAIA FORTE DO - 55", "PRADA LINEA ROSSA").referencia ?? "")).not.toMatch(/^DO|^-/);
    const card = buildProductCard({ nomeComercial: "Prada Linea Rossa Praia Forte", referencia: "DO -", categoriaModelo: "Armação de grau", formatoArmacao: null, acabamentoOuMaterial: null, valorFormatado: "R$ 440,00", totalUnidades: 1, lojasDisponiveis: [{ loja: "Loja Setor Marista", cidade: "Goiânia", endereco: "Rua 9, 2106", quantidade: 1 }] });
    expect(card).toContain("🕶️ *Prada Linea Rossa Praia Forte*");
    expect(card).not.toContain("Ref.");
  });
});

describe("ficha com lojas não oferece \"ver as lojas\"", () => {
  it("troca a pergunta redundante por provar na unidade ou mandar a receita", () => {
    const reply = "📍 *Loja Setor Marista* - Goiânia — 1 unidade\n---SPLIT---\nÓtima escolha. Quer que eu veja em quais lojas de Goiânia tem essa peça pra você provar?";
    const fixed = withoutRedundantStoreQuestion(reply);
    expect(fixed).not.toMatch(/em quais lojas/);
    expect(fixed).toContain("Ótima escolha. Quer passar na unidade mais perto de você pra provar?");
    expect(withoutRedundantStoreQuestion("Quer que eu verifique em qual loja de Goiânia fica mais fácil pra você provar?")).toMatch(/em qual loja/);
  });
});
