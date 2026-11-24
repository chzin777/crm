import { describe, expect, it, vi } from "vitest";
import { createProductImageService, imageQuery, photoCategory, rankByCategory, type ImageCacheRow } from "@/lib/ai/product-image";
import { buildVisualCatalog } from "@/lib/ai/catalog-search";
import type { ShowcaseModel } from "@/lib/ai/stock-showcase";

const model = (sku: string, ref: string, categoria = "Óculos de sol"): ShowcaseModel => ({ nomeComercial: ref.startsWith("VO") ? "Vogue" : "Ray-Ban", referencia: ref, categoriaModelo: categoria, precoVenda: "R$ 500,00", totalDisponivelRede: 1, codigos: [sku] });

describe("foto coerente com a categoria", () => {
  it("busca leva referência e tipo (sol x grau)", () => {
    expect(imageQuery({ produto: "Ray-Ban RB4340", categoria: "Óculos de sol" })).toBe("Ray-Ban RB4340 óculos de sol");
    expect(imageQuery({ produto: "Ray-Ban RB7047", categoria: "Armação de grau" })).toBe("Ray-Ban RB7047 armação óculos de grau");
    expect(imageQuery({ produto: "Ray-Ban RB4340" })).toBe("Ray-Ban RB4340 óculos");
    expect(photoCategory("SOLAR")).toBe("sol");
    expect(photoCategory("ARMACAO")).toBe("grau");
    expect(photoCategory("Lente de contato")).toBe("");
  });

  it("óculos de sol descarta foto de armação de grau (optical/eyeglasses/RX) e prioriza a de sol", () => {
    const urls = [
      "https://loja.test/ray-ban-rx4340-optical-eyeglasses.jpg",
      "https://loja.test/produto/rb4340.jpg",
      "https://loja.test/ray-ban-rb4340-sunglasses.jpg",
    ];
    expect(rankByCategory(urls, "sol")).toEqual(["https://loja.test/ray-ban-rb4340-sunglasses.jpg", "https://loja.test/produto/rb4340.jpg"]);
    expect(rankByCategory(urls, "grau")[0]).toBe("https://loja.test/ray-ban-rx4340-optical-eyeglasses.jpg");
    expect(rankByCategory(urls, "")).toEqual(urls);
  });

  it("foto em cache buscada sem o tipo é refeita quando o tipo é conhecido; a de grau não entra em óculos de sol", async () => {
    const rows = new Map<string, ImageCacheRow>([["900", { sku: "900", query: "Ray-Ban óculos", imageUrl: "https://loja.test/armacao-transparente.jpg", source: "web", updatedAt: new Date() }]]);
    const search = vi.fn(async () => ["https://loja.test/rb4340-eyeglasses-optical.jpg", "https://loja.test/rb4340-sunglasses.jpg"]);
    const service = createProductImageService({
      cache: { get: async (sku) => rows.get(sku) ?? null, set: async (row) => { rows.set(row.sku, { ...row, updatedAt: new Date() }); }, invalidate: async () => undefined },
      search,
      validate: async () => true,
    });
    const image = await service({ codigo: "900", produto: "Ray-Ban RB4340", categoria: "Óculos de sol" });
    expect(search).toHaveBeenCalledWith("Ray-Ban RB4340 óculos de sol");
    expect(image?.url).toBe("https://loja.test/rb4340-sunglasses.jpg");
    // Segunda vez: cache já com o tipo, sem nova busca.
    await service({ codigo: "900", produto: "Ray-Ban RB4340", categoria: "Óculos de sol" });
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("URL que não baixa (validação falha) não é gravada: segue para a próxima candidata", async () => {
    const service = createProductImageService({
      cache: { get: async () => null, set: async () => undefined, invalidate: async () => undefined },
      search: async () => ["https://loja.test/quebrada-sunglasses.jpg", "https://loja.test/ok-sunglasses.jpg"],
      validate: async (url) => !url.includes("quebrada"),
    });
    expect((await service({ codigo: "1", produto: "Vogue VO5625S", categoria: "Óculos de sol" }))?.url).toBe("https://loja.test/ok-sunglasses.jpg");
  });
});

describe("vitrine só com foto válida", () => {
  it("item sem foto (Vogue VO5625S) dá lugar à próxima reserva com foto, mantendo 3 cards com foto", () => {
    const models = [model("1", "RB4340"), model("2", "RB2140"), model("3", "VO5625S")];
    const reserves = [model("4", "RB3025"), model("5", "VO5211S")];
    const catalog = buildVisualCatalog({ models, reserves, images: { "1": "https://i.test/1.jpg", "2": "https://i.test/2.jpg", "5": "https://i.test/5.jpg" }, city: "Goiânia", opening: "", closing: "" })!;
    expect(catalog.items.map((item) => item.sku)).toEqual(["1", "2", "5"]);
    expect(catalog.items.every((item) => item.imageUrl.startsWith("https://"))).toBe(true);
    expect(catalog.items.map((item) => item.caption)[2]).toMatch(/^3\. Vogue VO5211S/);
  });

  it("sem foto em nenhum modelo nem reserva: vitrine em texto (null)", () => {
    expect(buildVisualCatalog({ models: [model("1", "RB4340")], reserves: [model("2", "RB2140")], images: {}, city: "", opening: "", closing: "" })).toBeNull();
  });
});
