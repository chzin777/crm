import { describe, expect, it } from "vitest";
import { buildShowcaseList, interactiveListPayload, LIST_LIMITS, productSelectRef, selectionText } from "@/lib/ai/interactive-showcase";

const model = (index: number, extra: Record<string, unknown> = {}) => ({
  nomeComercial: `Prada Linea Rossa Edição Especial Colecionador Modelo Muito Comprido ${index}`,
  referencia: index % 3 === 0 ? `#${1000 + index}` : `PS 0${index}RV EXTRA LONGA REFERENCIA`,
  precoVenda: "R$ 1.960,00",
  precoVaria: index % 2 === 0,
  codigos: [String(1000 + index)],
  ...extra,
});

describe("Lista Interativa da vitrine (limites da Meta Cloud API)", () => {
  it("nenhuma linha passa de 24/72, botão ≤ 20, seção ≤ 24 e no máximo 10 linhas", () => {
    const list = buildShowcaseList(Array.from({ length: 14 }, (_, index) => model(index + 1)), "Prada Linea Rossa")!;
    const payload = interactiveListPayload("5562999999999", list);
    expect(payload).toMatchObject({ type: "interactive", interactive: { type: "list" } });
    const { action, body } = payload.interactive;
    expect(body.text.length).toBeLessThanOrEqual(LIST_LIMITS.body);
    expect(action.button.length).toBeLessThanOrEqual(20);
    expect(action.sections).toHaveLength(1);
    expect(action.sections[0].title.length).toBeLessThanOrEqual(24);
    expect(action.sections[0].rows.length).toBeLessThanOrEqual(10);
    expect(action.sections[0].rows.length).toBe(8);
    for (const row of action.sections[0].rows) {
      expect(row.title.length).toBeLessThanOrEqual(24);
      expect((row.description ?? "").length).toBeLessThanOrEqual(72);
      expect(row.id.length).toBeLessThanOrEqual(200);
      expect(row.id.startsWith("product_select:")).toBe(true);
    }
    expect(new Set(action.sections[0].rows.map((row) => row.id)).size).toBe(8);
  });

  it("título curto \"Ref. PS 07RV\", descrição com nome e preço; 1 modelo só não vira lista", () => {
    const list = buildShowcaseList([model(1, { nomeComercial: "Prada Linea Rossa", referencia: "PS 07RV", precoVaria: false }), model(2, { nomeComercial: "Prada Linea Rossa", referencia: "PS 02WV", precoVaria: true })], "Prada Linea Rossa")!;
    expect(list.rows).toEqual([
      { id: "product_select:PS 07RV", title: "Ref. PS 07RV", description: "Prada Linea Rossa • R$ 1.960,00" },
      { id: "product_select:PS 02WV", title: "Ref. PS 02WV", description: "Prada Linea Rossa • a partir de R$ 1.960,00" },
    ]);
    expect(list.bodyText).toBe("Temos vários modelos *Prada Linea Rossa* disponíveis em estoque! Toque no botão abaixo para escolher um modelo e ver a foto e os detalhes:");
    expect(buildShowcaseList([model(1)])).toBeNull();
  });

  it("id da escolha e texto legível no histórico", () => {
    expect(productSelectRef("product_select:PS 07RV")).toBe("PS 07RV");
    expect(productSelectRef("menu_2")).toBeNull();
    expect(selectionText("PS 07RV", "Ref. PS 07RV", "Prada Linea Rossa • R$ 1.960,00")).toBe("Quero ver o modelo: Prada Linea Rossa (Ref. PS 07RV)");
    expect(selectionText("1003", "Radda", "")).toBe("Quero ver o modelo: Radda (Ref. 1003)");
  });
});
