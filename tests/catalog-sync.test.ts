import { describe, expect, it } from "vitest";
import { diffProducts, diffStock, productHash } from "@/lib/catalog/catalog-sync";
import { indexCatalog, queryCatalog, syncAgeLabel, type CatalogProduct } from "@/lib/catalog/catalog-query";

const product = (code: string, patch: Partial<CatalogProduct> = {}): CatalogProduct => ({
  code, description: `ARMACAO RAY-BAN RB${code}`, reference: `RB${code}`, ean: null, brand: "RAY-BAN", category: "ARMACAO", subcategory: null,
  ncm: null, color: null, material: null, eyeSize: null, bridge: null, warrantyMonths: null, price: 500, priceMin: null, priceMax: null, ...patch,
});

describe("sincronização incremental do catálogo do VMSET", () => {
  it("banco vazio: tudo entra como novo", () => {
    const diff = diffProducts(new Map(), [product("1"), product("2")]);
    expect(diff).toMatchObject({ created: 2, updated: 0, unchanged: 0, deactivate: [] });
    expect(diff.upserts.map((item) => item.code)).toEqual(["1", "2"]);
  });

  it("só grava novos e alterados; sem mudança não regrava; sumido fica inativo (nunca apagado)", () => {
    const stored = new Map([
      ["1", { hash: productHash(product("1")), active: true }],
      ["2", { hash: productHash(product("2")), active: true }],
      ["3", { hash: productHash(product("3")), active: true }],
    ]);
    const diff = diffProducts(stored, [product("1"), product("2", { price: 650 }), product("4")]);
    expect(diff.upserts.map((item) => item.code)).toEqual(["2", "4"]);
    expect(diff).toMatchObject({ created: 1, updated: 1, unchanged: 1, deactivate: ["3"] });
  });

  it("produto inativo que volta ao retrato é reativado", () => {
    const stored = new Map([["1", { hash: productHash(product("1")), active: false }]]);
    expect(diffProducts(stored, [product("1")])).toMatchObject({ updated: 1, upserts: [expect.objectContaining({ code: "1" })] });
  });

  it("retrato vazio (falha do ERP) não desativa o catálogo", () => {
    const stored = new Map([["1", { hash: "x", active: true }]]);
    expect(diffProducts(stored, []).deactivate).toEqual([]);
  });

  it("saldo: só linhas alteradas e remoção das que sumiram", () => {
    const row = (code: string, unit: string, available: number) => ({ code, unit, erpName: `LOJA ${unit}`, available, reserved: 0 });
    const stored = new Map([["1|01", row("1", "01", 3)], ["1|02", row("1", "02", 1)], ["2|01", row("2", "01", 5)]]);
    const diff = diffStock(stored, [row("1", "01", 3), row("1", "02", 0), row("3", "01", 2)]);
    expect(diff.upserts.map((item) => `${item.code}|${item.unit}`)).toEqual(["1|02", "3|01"]);
    expect(diff.removals).toEqual([{ code: "2", unit: "01" }]);
  });

  it("leitura imediata do cache local: o catálogo persistido responde a busca sem o ERP", () => {
    const catalog = indexCatalog([product("4340", { category: "OCULOS SOLAR", description: "OCULOS SOLAR RAY-BAN RB4340" }), product("5154")]);
    const stock = new Map([["4340", [{ unit: "05", label: "LJ 05", available: 2, reserved: 0 }]]]);
    const result = queryCatalog(catalog, (code) => stock.get(code) ?? [], { q: "rb4340", inStock: true, sort: "relevancia", page: 1, pageSize: 24 });
    expect(result.total).toBe(1);
    expect(result.items[0].code).toBe("4340");
  });

  it("indicador de última sincronização", () => {
    const now = Date.parse("2026-11-24T18:00:00Z");
    expect(syncAgeLabel(null, now)).toBe("Ainda não sincronizado");
    expect(syncAgeLabel(now - 20_000, now)).toBe("Sincronizado agora");
    expect(syncAgeLabel(now - 12 * 60_000, now)).toBe("Última sincronização há 12 min");
    expect(syncAgeLabel(now - 3 * 3_600_000, now)).toBe("Última sincronização há 3 h");
  });
});
