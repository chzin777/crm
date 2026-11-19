import { describe, expect, it } from "vitest";
import { indexCatalog, queryCatalog, stockStatus, whatsappSummary, type CatalogProduct, type CatalogStoreStock } from "@/lib/catalog/catalog-query";

const base: Omit<CatalogProduct, "code" | "description"> = {
  reference: null, ean: null, brand: null, category: "ARMACAO", subcategory: null, ncm: null, color: null, material: null,
  eyeSize: null, bridge: null, warrantyMonths: null, price: null, priceMin: null, priceMax: null,
};
const products = indexCatalog([
  { ...base, code: "145644", description: "OCS RAY BAN REF 0RB3025L 002/5862", reference: "0RB3025L 002/5862", brand: "RAY BAN", category: "OCULOS SOLAR", price: 899, ean: "7890000000011" },
  { ...base, code: "146011", description: "OCS RAY BAN REF 0RB3025L 001/5158", reference: "0RB3025L 001/5158", brand: "RAY BAN", category: "OCULOS SOLAR", price: 799 },
  { ...base, code: "200001", description: "ARM OAKLEY HOLBROOK RX", reference: "OX8156", brand: "OAKLEY", price: 650 },
  { ...base, code: "200002", description: "ARM ATITUDE AT1234", reference: "AT1234", brand: "ATITUDE", price: null },
]);
const stock: Record<string, CatalogStoreStock[]> = {
  "145644": [{ unit: "5", label: "LJ 05", available: 4, reserved: 0 }, { unit: "13", label: "LJ 13", available: 1, reserved: 1 }],
  "200001": [{ unit: "13", label: "LJ 13", available: 2, reserved: 0 }],
};
const stockOf = (code: string) => stock[code] ?? [];

describe("queryCatalog", () => {
  it("busca referência sem pontuação e por EAN", () => {
    expect(queryCatalog(products, stockOf, { q: "rb3025" }).items.map((item) => item.code).sort()).toEqual(["145644", "146011"]);
    expect(queryCatalog(products, stockOf, { q: "7890000000011" }).items[0].code).toBe("145644");
  });

  it("filtra só com estoque e pela loja, com saldo da loja", () => {
    const all = queryCatalog(products, stockOf, { inStock: true });
    expect(all.total).toBe(2);
    const store = queryCatalog(products, stockOf, { inStock: true, store: "13", sort: "maior_estoque" });
    expect(store.items.map((item) => [item.code, item.storeStock, item.totalStock])).toEqual([["200001", 2, 2], ["145644", 1, 5]]);
  });

  it("filtra por categoria, marca e preço e ordena por preço", () => {
    expect(queryCatalog(products, stockOf, { category: "OCULOS SOLAR", sort: "menor_preco" }).items.map((item) => item.price)).toEqual([799, 899]);
    expect(queryCatalog(products, stockOf, { brand: "OAKLEY" }).total).toBe(1);
    expect(queryCatalog(products, stockOf, { minPrice: 700, maxPrice: 850 }).items.map((item) => item.code)).toEqual(["146011"]);
  });

  it("pagina com tamanho permitido e limita a página", () => {
    const result = queryCatalog(products, stockOf, { pageSize: 12, page: 9 });
    expect(result).toMatchObject({ page: 1, pages: 1, pageSize: 12, total: 4 });
    expect(queryCatalog(products, stockOf, { pageSize: 7 }).pageSize).toBe(24);
  });

  it("mostra as lojas com mais peças primeiro", () => {
    const [item] = queryCatalog(products, stockOf, { q: "145644" }).items;
    expect(item.topStores.map((row) => row.label)).toEqual(["LJ 05", "LJ 13"]);
    expect(item.status).toBe("em_estoque");
  });
});

describe("stockStatus e resumo", () => {
  it("classifica o saldo", () => {
    expect([stockStatus(0), stockStatus(2), stockStatus(3)]).toEqual(["sem_estoque", "ultimas_unidades", "em_estoque"]);
  });

  it("monta o texto do WhatsApp", () => {
    const text = whatsappSummary({ description: "ARM OAKLEY", brand: "OAKLEY", reference: "OX8156", code: "200001", price: 650 }, [{ label: "LJ 13", available: 2 }, { label: "LJ 05", available: 0 }]);
    expect(text).toContain("Ref.: OX8156");
    expect(text).toContain("Disponível em: LJ 13");
    expect(text).not.toContain("LJ 05");
  });
});
