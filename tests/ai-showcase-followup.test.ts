import { describe, expect, it } from "vitest";
import { buildVisualCatalog } from "@/lib/ai/catalog-search";
import { genericYesToDetails, isGenericYes, nextShowcaseIndex, offeredDetails, resolveListedChoice, whichOfShownQuestion, type ListedProduct } from "@/lib/ai/showcase-choice";
import type { ShowcaseModel } from "@/lib/ai/stock-showcase";

const listed: ListedProduct[] = [
  { index: 1, sku: "1", referencia: "RB3548", nomeComercial: "Ray-Ban Hexagonal", preco: 990 },
  { index: 2, sku: "2", referencia: "RB4340", nomeComercial: "Ray-Ban Wayfarer", preco: 890 },
  { index: 3, sku: "3", referencia: "RB3025", nomeComercial: "Ray-Ban Aviator", preco: 1090 },
];

describe("follow-up da vitrine", () => {
  it("\"Sim\" genérico depois da oferta de detalhes: pergunta qual dos já mostrados", () => {
    const ask = "Quer que eu te mostre mais detalhes de algum deles?";
    expect(offeredDetails(ask)).toBe(true);
    for (const text of ["Sim", "sim!", "Quero", "Pode mostrar", "Com certeza", "pode sim 😊"]) expect(isGenericYes(text), text).toBe(true);
    for (const text of ["do 2", "o hexagonal", "quero o segundo", "tem outras opções?"]) expect(isGenericYes(text), text).toBe(false);
    expect(genericYesToDetails({ text: "Sim", lastAiText: ask, listed })).toBe(true);
    expect(genericYesToDetails({ text: "Sim", lastAiText: "Posso te ajudar com mais alguma coisa?", listed })).toBe(false);
    expect(genericYesToDetails({ text: "Sim", lastAiText: ask, listed: [] })).toBe(false);
    expect(whichOfShownQuestion(listed)).toBe("Claro! Qual deles você curtiu mais? O 1 (Ray-Ban Hexagonal), o 2 (Ray-Ban Wayfarer) ou o 3 (Ray-Ban Aviator)? Me diz o número que eu te mando os detalhes.");
  });

  it("item especificado (\"do 2\", \"esse segundo\") abre o próprio item, sem nova lista", () => {
    expect(resolveListedChoice("do 2", listed)).toMatchObject({ type: "item", item: { index: 2 } });
    expect(resolveListedChoice("esse segundo", listed)).toMatchObject({ type: "item", item: { index: 2 } });
  });

  it("\"mostra mais opções\": a próxima vitrine sai numerada 4, 5, 6", () => {
    const model = (code: string, ref: string): ShowcaseModel => ({ nomeComercial: `Ray-Ban ${ref}`, referencia: ref, categoriaModelo: "OCULOS SOLAR", precoVenda: "R$ 900,00", totalDisponivelRede: 2, codigos: [code] });
    const models = [model("41", "RB2140"), model("42", "RB4171"), model("43", "RB3447")];
    const images = { "41": "https://img.test/41.jpg", "42": "https://img.test/42.jpg", "43": "https://img.test/43.jpg" };
    const catalog = buildVisualCatalog({ models, images, city: "Goiânia", opening: "", closing: "", startIndex: nextShowcaseIndex(listed) });
    expect(catalog?.items.map((item) => item.index)).toEqual([4, 5, 6]);
    expect(catalog?.items.map((item) => item.caption.trim().slice(0, 2))).toEqual(["4.", "5.", "6."]);

    // Na conversa, "gostei do 5" aponta o 5º card (e "o 2" continua sendo o da 1ª vitrine).
    const all: ListedProduct[] = [...listed, ...catalog!.items.map((item) => ({ index: item.index, sku: item.sku, referencia: item.ref, nomeComercial: item.name, preco: item.priceValue }))];
    expect(resolveListedChoice("gostei do 5", all)).toMatchObject({ type: "item", item: { index: 5, referencia: "RB4171" } });
    expect(resolveListedChoice("o 2", all)).toMatchObject({ type: "item", item: { index: 2, referencia: "RB4340" } });
    expect(nextShowcaseIndex(all)).toBe(7);
  });
});
