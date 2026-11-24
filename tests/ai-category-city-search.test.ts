import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ requested: [] as string[], units: {} as Record<string, string[]> }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: { store: { findMany: vi.fn(async () => [
  { id: "s1", name: "LJ 39", address: "Rua 1", addressNumber: "1", neighborhoods: [], city: "GOIANIA", state: "GO", pinLat: null, pinLng: null },
  { id: "s2", name: "LJ 40", address: "Rua 2", addressNumber: "1", neighborhoods: [], city: "Brasília", state: "DF", pinLat: null, pinLng: null },
  { id: "s4", name: "LJ 42", address: "Rua 4", addressNumber: "1", neighborhoods: [], city: "APARECIDA DE GOIANIA", state: "GO", pinLat: null, pinLng: null },
]) } } }));
vi.mock("@/lib/ai/stock", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/stock")>();
  return {
    ...actual,
    createStockClient: () => ({
      getStockByProductCodes: async (codes: string[]) => {
        state.requested.push(...codes);
        return {
          stockStatus: "ok",
          byCode: Object.fromEntries(codes.map((code) => [code, (state.units[code] ?? []).map((unit) => ({ unit, name: `LJ ${unit}`, qty: 2, price: 650 }))])),
          fromCache: 0, requested: codes.length,
        };
      },
    }),
  };
});

import { indexProduct } from "@/lib/ai/catalog-search";
import { EMPTY_CATALOG_CONTEXT, updateCatalogContext } from "@/lib/ai/catalog-context";
import { consultarEstoqueProduto } from "@/lib/ai/stock-db";
import { stripSearchNoise } from "@/lib/ai/stock-showcase";

const BRANDS = ["RAYBAN", "OAKLEY", "PRADA", "VOGUE", "CARRERA", "ARNETTE", "GUESS", "LACOSTE"];
const sunglasses = (count: number, offset = 0) => Array.from({ length: count }, (_, index) => indexProduct({
  code: String(800000 + offset + index),
  description: `OCS ${BRANDS[(offset + index) % BRANDS.length]} REF M${offset + index}X 55`,
  brand: BRANDS[(offset + index) % BRANDS.length],
  category: "OCULOS SOLAR", subcategory: "", sales: 1000 - offset - index, price: 650,
}));
const frames = Array.from({ length: 5 }, (_, index) => indexProduct({ code: String(700000 + index), description: `ARM RAYBAN REF RX${index}00 52`, brand: "RAYBAN", category: "ARMACAO", subcategory: "", sales: 5000, price: 500 }));
const CITIES = ["GOIANIA", "Brasília", "APARECIDA DE GOIANIA"];

beforeEach(() => {
  state.requested = [];
  state.units = {};
});

describe("busca geral de categoria depois da cidade (multi-turno)", () => {
  it("mantém a intenção de óculos de sol e só acrescenta a cidade quando o cliente responde \"Goiânia\"", () => {
    const first = updateCatalogContext(EMPTY_CATALOG_CONTEXT, "Queria uns modelos de óculos de sol pra presentear", CITIES);
    expect(first.context).toMatchObject({ category: "SOLAR", brand: "", preferredCity: "" });
    const second = updateCatalogContext(first.context, "Goiânia", CITIES);
    expect(second.city).toBeTruthy();
    expect(second.brand).toBeNull();
    expect(second.context.category).toBe("SOLAR");
    expect(second.context.preferredCity).toBeTruthy();
  });

  it("termo só com a cidade (como o modelo mandava) vira vitrine de sol com 3 a 5 modelos reais das lojas da cidade", async () => {
    const catalog = [...frames, ...sunglasses(10)];
    for (const item of catalog.slice(5, 12)) state.units[item.code!] = ["39"];
    for (const item of frames) state.units[item.code!] = ["39"];
    const { result } = await consultarEstoqueProduto({ termoBusca: "Goiânia", tipoBusca: "marca_ampla", tipo: "sol", cidade: "Goiânia" }, { products: async () => catalog, withPrices: true });
    if (result.tipoBusca !== "marca_ampla") throw new Error("Busca deveria ser ampla");
    expect(result.cenario).toBe("disponivel_em_lojas");
    expect(result.modelos.length).toBeGreaterThanOrEqual(3);
    expect(result.modelos.length).toBeLessThanOrEqual(5);
    // Só óculos de sol (nenhuma armação de grau) e todos com saldo em Goiânia.
    expect(result.modelos.flatMap((model) => model.codigos).every((code) => Number(code) >= 800000)).toBe(true);
  });

  it("\"óculos de sol pra presentear\" sem cidade no argumento acha a cidade no termo e não exige marca nem preço", async () => {
    const catalog = sunglasses(8);
    for (const item of catalog) state.units[item.code!] = ["39"];
    const { result } = await consultarEstoqueProduto({ termoBusca: "óculos de sol pra presentear em Goiânia", tipoBusca: "marca_ampla" }, { products: async () => catalog, withPrices: true });
    if (result.tipoBusca !== "marca_ampla") throw new Error("Busca deveria ser ampla");
    expect(result.modelos.length).toBeGreaterThanOrEqual(3);
  });

  it("primeiros candidatos sem saldo na cidade: amplia a busca e acha os que estão em Goiânia", async () => {
    const catalog = sunglasses(45);
    for (const item of catalog.slice(36)) state.units[item.code!] = ["39"];
    for (const item of catalog.slice(0, 36)) state.units[item.code!] = ["40"];
    const { result } = await consultarEstoqueProduto({ termoBusca: "óculos de sol", tipo: "sol", cidade: "Goiânia" }, { products: async () => catalog, withPrices: true });
    if (result.tipoBusca !== "marca_ampla") throw new Error("Busca deveria ser ampla");
    expect(result.cenario).toBe("disponivel_em_lojas");
    expect(result.modelos.length).toBeGreaterThanOrEqual(3);
    expect((result as { foraDaCidade?: boolean }).foraDaCidade).toBeUndefined();
  });

  it("nada com saldo na cidade: mostra os óculos de sol da rede em vez de \"não encontrei\"", async () => {
    const catalog = sunglasses(6);
    for (const item of catalog) state.units[item.code!] = ["40"];
    const { result } = await consultarEstoqueProduto({ termoBusca: "Goiânia", tipo: "sol", cidade: "Goiânia" }, { products: async () => catalog, withPrices: true });
    if (result.tipoBusca !== "marca_ampla") throw new Error("Busca deveria ser ampla");
    expect(result.modelos.length).toBeGreaterThanOrEqual(3);
    expect((result as { foraDaCidade?: boolean }).foraDaCidade).toBe(true);
  });
});

describe("limpeza do termo de busca", () => {
  it("tira cidade (sem acento, maior nome primeiro) e ocasião", () => {
    expect(stripSearchNoise("Goiânia", CITIES)).toEqual({ term: "", city: "GOIANIA", changed: true });
    expect(stripSearchNoise("óculos de sol pra presentear", CITIES).term).toBe("OCULOS DE SOL PRA");
    expect(stripSearchNoise("sol em aparecida de goiânia", CITIES).city).toBe("APARECIDA DE GOIANIA");
    expect(stripSearchNoise("RB4165", CITIES)).toMatchObject({ term: "RB4165", changed: false });
  });

  it("marca com ocasião continua sendo busca da marca", async () => {
    const catalog = sunglasses(16);
    for (const item of catalog) state.units[item.code!] = ["39"];
    const { result } = await consultarEstoqueProduto({ termoBusca: "ray-ban pra presentear", tipoBusca: "marca_ampla", cidade: "Goiânia" }, { products: async () => catalog, withPrices: true });
    if (result.tipoBusca !== "marca_ampla") throw new Error("Busca deveria ser ampla");
    expect(result.modelos.length).toBeGreaterThan(0);
    expect(result.modelos.every((model) => /ray/i.test(model.nomeComercial))).toBe(true);
  });
});
