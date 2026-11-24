import { describe, expect, it } from "vitest";
import { buildShowcaseResult, modelShownIds, showcaseCandidates, type ShowcaseModel } from "@/lib/ai/stock-showcase";
import { buildVisualCatalog, catalogCaption, modelDisplayName, modelKindLabel, showcaseGuidance } from "@/lib/ai/catalog-search";
import { rememberShown, sanitizeCatalogContext, EMPTY_CATALOG_CONTEXT } from "@/lib/ai/catalog-context";
import { sanitizeAiResponse } from "@/lib/ai/sanitize";
import type { StockLookup, StoreInfo } from "@/lib/ai/stock";

const stores = new Map<string, StoreInfo>([["34", { name: "LJ 34 SETOR MARISTA", address: "Rua 27", addressNumber: "2106", neighborhood: "Setor Marista", city: "Goiânia" }]]);
const unit = (qty: number, price: number) => [{ unit: "34", name: "LJ 34 LOJA", qty, price }];
// Mesmo padrão do ERP de produção ("OCS RAY BAN REF 0RB4340 601 50"): 5 modelos de sol com estoque em Goiânia.
const catalog = [
  { code: "1", description: "OCS RAY BAN REF 0RB4340 601 50", brand: "RAY BAN" },
  { code: "2", description: "OCS RAY BAN REF 0RB4179 601S9A62", brand: "RAY BAN" },
  { code: "3", description: "OCS RAY BAN REF 0RB4455 13598752", brand: "RAY BAN" },
  { code: "4", description: "OCS RAY BAN REF 0RB3774D 001/8755", brand: "RAY BAN" },
  { code: "5", description: "OCS RAY BAN REF 0RB3767 001/1354", brand: "RAY BAN" },
];
const lookup: StockLookup = { stockStatus: "ok", fromCache: 0, requested: 5, byCode: Object.fromEntries(catalog.map((item, index) => [item.code, unit(1, 990 + index * 10)])) };
const search = (exclude?: string[]) => buildShowcaseResult({ term: "Ray-Ban", groups: showcaseCandidates(catalog), lookup, stores, withPrices: true, city: "Goiânia", exclude });

describe("vitrine com modelos reais e distintos, sem repetir na conversa", () => {
  it("busca de marca traz 3 modelos distintos com referência real (nunca um registro genérico da marca)", () => {
    const result = search();
    expect(result.modelos).toHaveLength(3);
    const names = result.modelos.map(modelDisplayName);
    expect(new Set(names).size).toBe(3);
    expect(names).toEqual(["Ray-Ban RB4340", "Ray-Ban RB4179", "Ray-Ban RB4455"]);
  });

  it("modelos já mostrados saem antes do corte: a próxima vitrine traz modelos novos", () => {
    const first = search();
    const shown = first.modelos.flatMap(modelShownIds);
    const second = search(shown);
    expect(second.modelos.map(modelDisplayName)).toEqual(["Ray-Ban RB3774D", "Ray-Ban RB3767"]);
    const third = search([...shown, ...second.modelos.flatMap(modelShownIds)]);
    expect(third).toMatchObject({ cenario: "todos_ja_mostrados", todosJaMostrados: true, modelos: [] });
    expect(third.orientacao).toMatch(/NÃO repita/);
  });

  it("memória de exibidos acumula na conversa e sobrevive ao aiContext salvo", () => {
    const context = { ...EMPTY_CATALOG_CONTEXT };
    rememberShown(context, ["1", "ref:4340"]);
    rememberShown(context, ["2", "1"]);
    expect(context.shownIds).toEqual(["ref:4340", "2", "1"]);
    expect(sanitizeCatalogContext(JSON.parse(JSON.stringify(context))).shownIds).toEqual(["ref:4340", "2", "1"]);
  });

  it("catálogo com fotos: todos os cards com foto (sem foto sai e a reserva com foto entra); legendas sem traço nem bloco de lojas", () => {
    const models: ShowcaseModel[] = [
      { nomeComercial: "Ray-Ban", referencia: "RB4340", categoriaModelo: "Óculos de sol", precoVenda: "R$ 990,00", precoVaria: true, totalDisponivelRede: 2, codigos: ["1"], lojas: ["Setor Central", "Setor Sul"] },
      { nomeComercial: "Ray-Ban", referencia: "RB7047", categoriaModelo: "Armação de grau", precoVenda: "R$ 750,00", totalDisponivelRede: 1, codigos: ["2"], lojas: ["Setor Marista"] },
      { nomeComercial: "Ray-Ban Justin", referencia: "RB4165", categoriaModelo: "Óculos de sol", precoVenda: "R$ 1.210,00", totalDisponivelRede: 1, codigos: ["3"] },
    ];
    const vogue: ShowcaseModel = { nomeComercial: "Vogue", referencia: "VO5625S", categoriaModelo: "Óculos de sol", precoVenda: "R$ 450,00", totalDisponivelRede: 1, codigos: ["4"] };
    // Sem reserva: só os que têm foto (nunca card em texto no meio dos com foto).
    const only = buildVisualCatalog({ models, images: { "1": "https://img.test/1.jpg", "3": "https://img.test/3.jpg" }, city: "Goiânia", opening: "", closing: "" })!;
    expect(only.items.map((item) => item.sku)).toEqual(["1", "3"]);
    expect(only.items.map((item) => item.index)).toEqual([1, 2]);
    // Mesma foto em dois modelos conta como sem foto para o segundo.
    const duplicated = buildVisualCatalog({ models, reserves: [vogue], images: { "1": "https://img.test/1.jpg", "2": "https://img.test/1.jpg", "3": "https://img.test/3.jpg", "4": "https://img.test/4.jpg" }, city: "Goiânia", opening: "", closing: "" })!;
    expect(duplicated.items.map((item) => item.sku)).toEqual(["1", "3", "4"]);
    const catalog = buildVisualCatalog({ models, images: { "1": "https://img.test/1.jpg", "2": "https://img.test/2.jpg", "3": "https://img.test/3.jpg" }, city: "Goiânia", opening: "Olha essas", closing: "Qual te agradou?" })!;
    expect(catalog.items).toHaveLength(3);
    expect(catalog.items.every((item) => item.imageUrl)).toBe(true);
    expect(catalog.items.map((item) => item.caption)).toEqual([
      "1. Ray-Ban RB4340, óculos de sol, a partir de R$ 990,00",
      "2. Ray-Ban RB7047, armação de grau, R$ 750,00",
      "3. Ray-Ban Justin RB4165, óculos de sol, R$ 1.210,00",
    ]);
    for (const item of catalog.items) {
      expect(item.caption).not.toMatch(/Lojas? em|[—–]| - /);
      expect(sanitizeAiResponse(item.caption)).toBe(item.caption);
    }
    // Sem nenhuma foto: a vitrine segue em texto (null aqui).
    expect(buildVisualCatalog({ models, images: {}, city: "Goiânia", opening: "", closing: "" })).toBeNull();
  });

  it("legenda e tipo: referência legível sem o 0 interno e sem código #", () => {
    expect(modelDisplayName({ nomeComercial: "Ray-Ban", referencia: "0RB4340" })).toBe("Ray-Ban RB4340");
    expect(modelDisplayName({ nomeComercial: "Ray-Ban", referencia: "#921093" })).toBe("Ray-Ban");
    expect(modelDisplayName({ nomeComercial: "Ray-Ban RB4340", referencia: "RB4340" })).toBe("Ray-Ban RB4340");
    expect(modelKindLabel("OCULOS SOLAR")).toBe("óculos de sol");
    expect(modelKindLabel("Armação")).toBe("armação de grau");
    expect(modelKindLabel("Lente de contato")).toBe("");
    expect(catalogCaption({ index: 2, name: "Oakley Holbrook", price: null })).toBe("2. Oakley Holbrook");
  });

  it("orientação da vitrine: singular com 1 item, sol x grau sinalizado e fechamento com pergunta", () => {
    const one = showcaseGuidance([{ nomeComercial: "Ray-Ban", referencia: "RB4340", categoriaModelo: "Óculos de sol", precoVenda: "R$ 990,00" }]);
    expect(one).toMatch(/SINGULAR/);
    const mixed = showcaseGuidance([
      { nomeComercial: "Ray-Ban", referencia: "RB4340", categoriaModelo: "Óculos de sol", precoVenda: null },
      { nomeComercial: "Ray-Ban", referencia: "RB7047", categoriaModelo: "Armação de grau", precoVenda: null },
    ]);
    expect(mixed).toMatch(/2 modelos distintos/);
    expect(mixed).toMatch(/sol e armações de grau/);
    expect(mixed).toMatch(/pergunta natural/);
    expect(mixed).toMatch(/sem travessões/);
  });
});
