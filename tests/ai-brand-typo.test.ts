import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "@/lib/ai/agent-core";
import { DEFAULT_AI_SETTINGS } from "@/lib/ai/settings";
import { indexProduct } from "@/lib/ai/catalog-search";
import { BRAND_TYPO_RULES, broadCatalogMatches, catalogBrands, levenshtein, normalizeSearchToken, resolveBrandQuery, specificSearchScope } from "@/lib/ai/brand-resolve";
import { buildShowcaseResult } from "@/lib/ai/stock-showcase";

// Marcas reais do catálogo (amostra do ERP).
const REAL = ["RAY BAN", "VIZZANO", "VOGUE", "NAIROBY", "MARESIA", "SPEEDO", "RADDA", "STEPPER", "ST. PIERRE", "GUESS", "ARMANI EXCHANGE", "CARRERA", "OAKLEY", "PRADA", "MIUMIU", "ANA HICKMANN", "ATITUDE", "HB", "GUCCI", "RADDA LEITURA", "ESTOJO RADDA", "PRADA LINEA ROSSA", "RAY BAN META", "TIFFANY", "TOM FORD", "PERSOL", "JOLIE", "FILA", "BOSS", "HUGO", "LACOSTE", "VERSACE", "CARMIM", "JAGUAR"];
const row = (code: string, description: string, brand: string, sales: number) => indexProduct({ code, description, brand, category: "OCULOS SOLAR", subcategory: null, sales, price: null });
const catalog = [
  ...REAL.map((brand, index) => row(`B${index}`, `OCS ${brand} REF X${index} 01`, brand, 1)),
  row("1", "ARM BERLIN REF- RADDA DIVERSOS", "RADDA", 50),
  row("2", "OCS RADDA REF RD1020 C1", "RADDA", 40),
  row("3", "OCS RADDA LEITURA REF L200 +2.00", "RADDA LEITURA", 10),
  row("4", "ESTOJO RADDA", "ESTOJO RADDA", 99),
  row("5", "ARM PRADA REF- 0PR 04WV ROJ1O1", "PRADA", 90),
  row("6", "OCS MARESIA CANOA QUEBRADA C2", "MARESIA", 80),
  row("7", "OCS OAKLEY REF 0OO9102 9102D555", "OAKLEY", 70),
];
// Tamanho de catálogo realista (marcas pequenas só casam pelo nome exato).
const brands = catalogBrands(catalog).map((entry) => ({ ...entry, products: entry.brand === "ESTOJO RADDA" ? 1 : entry.products * 50 }));

describe("busca tolerante a erro de digitação de marca", () => {
  it("normalização: acento, hífen, espaço, letras dobradas, y→i, ph→f, w→v", () => {
    expect(normalizeSearchToken("RADDA")).toBe("rada");
    expect(normalizeSearchToken("OAKLEY")).toBe("oaklei");
    expect(normalizeSearchToken("Ray-Ban")).toBe("raiban");
    expect(normalizeSearchToken("CARRERA")).toBe(normalizeSearchToken("carera"));
    expect(normalizeSearchToken("Gucci")).toBe(normalizeSearchToken("guci"));
    expect(levenshtein("okley", "oaklei")).toBe(2);
    expect(levenshtein(normalizeSearchToken("okley"), normalizeSearchToken("OAKLEY"))).toBe(1);
  });

  it("\"tem rada?\": marca RADDA, só modelos RADDA (sem Prada, Canoa Quebrada nem estojo)", () => {
    expect(resolveBrandQuery("tem rada?", brands)).toMatchObject({ brand: "RADDA", exact: true, rest: [] });
    const broad = broadCatalogMatches(catalog, "tem rada?", brands);
    expect(broad.brand).toBe("RADDA");
    const codes = broad.products.map((product) => product.code);
    expect(codes).toEqual(expect.arrayContaining(["1", "2", "3"]));
    expect(codes).not.toContain("4");
    expect(codes).not.toContain("5");
    expect(codes).not.toContain("6");
    expect(broad.products.every((product) => product.brand?.startsWith("RADDA"))).toBe(true);
  });

  it("\"okley\", \"rayban\", \"miumiu\", \"carera\", \"guci\": marca certa", () => {
    expect(resolveBrandQuery("tem okley?", brands)?.brand).toBe("OAKLEY");
    expect(resolveBrandQuery("tem rayban?", brands)?.brand).toBe("RAY BAN");
    expect(resolveBrandQuery("ray ban", brands)?.brand).toBe("RAY BAN");
    expect(resolveBrandQuery("miu miu", brands)?.brand).toBe("MIUMIU");
    expect(resolveBrandQuery("oculos carera", brands)?.brand).toBe("CARRERA");
    expect(resolveBrandQuery("guci", brands)?.brand).toBe("GUCCI");
    // Específica com erro na marca: procura só na marca certa, com o nome real.
    const scope = specificSearchScope(catalog, "okley holbrook", brands);
    expect(scope).toMatchObject({ brand: "OAKLEY", term: "OAKLEY HOLBROOK" });
    expect(scope.pool.every((product) => product.brand === "OAKLEY")).toBe(true);
  });

  it("\"tem ada?\": sem falso positivo por substring (Pr-ada); nomes de modelo não viram marca", () => {
    expect(resolveBrandQuery("tem ada?", brands)).toBeNull();
    expect(broadCatalogMatches(catalog, "tem ada?", brands).products).toEqual([]);
    for (const word of ["prata", "titanio", "meta", "barato", "menina"]) expect(resolveBrandQuery(word, brands)).toBeNull();
    for (const model of ["justin", "erika", "aviator", "holbrook", "wayfarer", "clubmaster", "round", "polarizado", "RB4165", "4165"]) expect(resolveBrandQuery(model, brands)).toBeNull();
    // Marca reconhecida sem modelo em estoque: aviso claro, sem produtos de outras marcas.
    const missing = buildShowcaseResult({ term: "tem rada?", groups: [], lookup: null, stores: new Map(), withPrices: true, brand: "RADDA" });
    expect(missing).toMatchObject({ marcaResolvida: "RADDA", semEstoqueDaMarca: true, modelos: [] });
    expect(missing.orientacao).toContain("Não há modelos da marca RADDA em estoque no momento");
  });

  it("prompt: termo original do cliente e confirmação natural da marca", () => {
    expect(buildSystemPrompt({ settings: DEFAULT_AI_SETTINGS, info: "" })).toContain(BRAND_TYPO_RULES);
    expect(BRAND_TYPO_RULES).toContain("passe para consultarEstoqueProduto o termo como o cliente escreveu");
    expect(BRAND_TYPO_RULES).toContain("Temos vários modelos *RADDA* disponíveis em estoque! Confira alguns deles:");
    expect(BRAND_TYPO_RULES).toContain("sem corrigir o cliente");
  });
});
