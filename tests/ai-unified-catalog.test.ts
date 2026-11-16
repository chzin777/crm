import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ requested: [] as string[], available: new Set<string>(), failed: new Set<string>() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: { store: { findMany: vi.fn(async () => [
  { id: "s1", name: "LJ 39", address: "Rua 1", addressNumber: "1", neighborhoods: [], city: "Goiânia", state: "GO", pinLat: null, pinLng: null },
]) } } }));
vi.mock("@/lib/ai/stock", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/stock")>();
  return {
    ...actual,
    createStockClient: () => ({
      getStockByProductCodes: async (codes: string[]) => {
        state.requested.push(...codes);
        const failed = codes.some((code) => state.failed.has(code));
        return {
          stockStatus: failed ? "unavailable_api" : "ok",
          byCode: Object.fromEntries(codes.map((code) => [code, state.available.has(code) ? [{ unit: "39", name: "LJ 39", qty: 1, price: 899 }] : []])),
          fromCache: 0, requested: codes.length,
        };
      },
    }),
  };
});

import { indexProduct, matchIconicProducts, readVision, VISION_PROMPT } from "@/lib/ai/catalog-search";
import { consultarEstoqueProduto } from "@/lib/ai/stock-db";
import { iconicModel } from "@/lib/ai/product-names";
import { welcomeReply } from "@/lib/ai/response-opening";

const product = (code: string, description: string, brand = "RAYBAN") => indexProduct({
  code, description, brand, category: "OCULOS SOLAR", subcategory: "", sales: 10, price: 899,
});
const products = [
  ...Array.from({ length: 7 }, (_, index) => product(`90070${index}`, `OCS RAY BAN REF 0RB4165L ${index} 54`)),
  product("901000", "OCS RAY BAN JUSTIN PRETO"),
  product("901001", "OCS RAY BAN REF RB2140 WAYFARER"),
  product("901002", "OCS RAY BAN REF RB2132"),
  product("901003", "OCS OAKLEY REF RB4165", "OAKLEY"),
  product("901004", "OCS RAY BAN REF RB3025"),
  product("901005", "OCS PRADA REF 0PR1234", "PRADA"),
];

beforeEach(() => {
  state.requested = [];
  state.available = new Set(["900706"]);
  state.failed = new Set();
});

describe("catálogo unificado de modelos", () => {
  it("lê legenda, modelo e cor, sem inventar referência visual", () => {
    const text = "Óculos de Sol Ray-Ban Justin Verde Escuro";
    const { query } = readVision({ kind: "produto", marca: "Ray-Ban", textoVisivelNaImagem: text, corLenteEArmacao: "Verde escuro" });
    expect(query).toMatchObject({ brand: "Ray-Ban", model: "Justin", visibleText: text, reference: "", color: "Verde escuro" });
    expect(VISION_PROMPT).toContain("Transcreva todo texto visível");
  });

  it.each([
    ["Justin", ["RB4165"]], ["Aviator", ["RB3025"]], ["Wayfarer", ["RB2140", "RB2132"]],
    ["Erika", ["RB4171"]], ["Clubmaster", ["RB3016"]], ["Round", ["RB3447"]], ["Hexagonal", ["RB3548"]],
  ])("%s resolve todas as referências equivalentes", (name, references) => {
    expect(iconicModel(`Ray-Ban ${name}`)?.references).toEqual(references);
  });

  it("nome, referência e foto usam o mesmo estoque e não misturam outra marca", async () => {
    for (const args of [
      { termoBusca: "Ray-Ban Justin" },
      { termoBusca: "Ray-Ban RB4165" },
      { marca: "Ray-Ban", nomeModelo: "Justin", textoVisivelNaImagem: "Óculos de Sol Ray-Ban Justin Verde Escuro", tipoBusca: "modelo_especifico" },
    ]) {
      state.requested = [];
      const { result } = await consultarEstoqueProduto(args, { products: async () => products, withPrices: true });
      expect(result.cenario).toBe("disponivel_em_lojas");
      expect(result.produtos.filter((item) => item.lojasComEstoque.length).map((item) => item.codigo)).toEqual(["900706"]);
      expect(state.requested).toContain("901000");
      expect(state.requested).not.toContain("901001");
      expect(state.requested).not.toContain("901003");
    }
    expect(matchIconicProducts(products, "Oakley Justin", "Oakley")).toBeNull();
    expect(matchIconicProducts(products, "Ray-Ban Wayfarer")?.products.map((item) => item.code)).toEqual(["901001", "901002"]);
  });

  it("não transforma indisponibilidade parcial da API em falta de estoque", async () => {
    state.failed.add("900706");
    const { result } = await consultarEstoqueProduto({ termoBusca: "Ray-Ban Justin" }, { products: async () => products, withPrices: true });
    expect(result.cenario).toBe("unavailable_api");
  });

  it("não trata o nome Aviator como busca ampla quando a IA classifica errado", async () => {
    state.available = new Set(["901004"]);
    const { result } = await consultarEstoqueProduto({ termoBusca: "Ray-Ban Aviator", tipoBusca: "marca_ampla" }, { products: async () => products, withPrices: true });
    expect(result.tipoBusca).toBe("modelo_especifico");
    expect(result.produtos.filter((item) => item.lojasComEstoque.length).map((item) => item.codigo)).toEqual(["901004"]);
  });

  it("não troca uma marca explícita por Ray-Ban ao procurar Justin", async () => {
    for (const args of [
      { termoBusca: "Prada Justin", tipoBusca: "modelo_especifico" },
      { termoBusca: "Prada Justin", tipoBusca: "modelo_especifico", marca: "Prada", nomeModelo: "Justin" },
    ]) {
      const { result } = await consultarEstoqueProduto(args, { products: async () => products, withPrices: true });
      expect(result.cenario).toBe("produto_nao_encontrado");
    }
    expect(state.requested).not.toContain("900706");
  });

  it("a escolha de uma variação consulta somente seu SKU", async () => {
    const { result } = await consultarEstoqueProduto({ termoBusca: "Ray-Ban Justin 900706" }, { products: async () => products, withPrices: true });
    expect(state.requested).toEqual(["900706"]);
    expect(result.produtos.map((item) => item.codigo)).toEqual(["900706"]);
  });
});

describe("abertura acolhedora", () => {
  const now = new Date("2026-11-16T11:00:00-03:00");
  it("inclui uma das três boas-vindas para cliente recorrente sem duplicar saudação", () => {
    const texts = [0, 1, 2].map((variant) => welcomeReply("Bom dia! Temos sim!", { first: true, returning: true, customer: "Maria Silva", pendingText: "bom dia", now, variant }));
    expect(texts).toEqual([
      "Bom dia, Maria! Que bom te ver por aqui de novo 😊 Temos sim!",
      "Bom dia, Maria! Que alegria falar com você novamente! 😊 Temos sim!",
      "Bom dia, Maria! Seja muito bem-vindo(a) de volta! 😊 Temos sim!",
    ]);
  });
  it("saúda um cliente novo e retribui saudação em turnos posteriores", () => {
    expect(welcomeReply("Temos sim!", { first: true, customer: "Maria", pendingText: "tem?", now })).toBe("Bom dia, Maria! 😊 Temos sim!");
    expect(welcomeReply("Temos sim!", { first: false, customer: "Maria", pendingText: "oi", now })).toBe("Bom dia, Maria! 😊 Temos sim!");
    expect(welcomeReply("Temos sim!", { first: false, customer: "Maria", pendingText: "tem?", now })).toBe("Temos sim!");
  });
});
