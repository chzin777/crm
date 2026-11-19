import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ requested: [] as string[], available: new Set<string>(), failed: new Set<string>(), units: {} as Record<string, string[]> }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: { store: { findMany: vi.fn(async () => [
  { id: "s1", name: "LJ 39", address: "Rua 1", addressNumber: "1", neighborhoods: [], city: "Goiânia", state: "GO", pinLat: null, pinLng: null },
  { id: "s2", name: "LJ 40", address: "Rua 2", addressNumber: "1", neighborhoods: [], city: "Brasília", state: "DF", pinLat: null, pinLng: null },
  { id: "s3", name: "LJ 41", address: "Rua 3", addressNumber: "1", neighborhoods: [], city: "Taguatinga", state: "DF", pinLat: null, pinLng: null },
  { id: "s4", name: "LJ 42", address: "Rua 4", addressNumber: "1", neighborhoods: [], city: "Aparecida de Goiânia", state: "GO", pinLat: null, pinLng: null },
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
          byCode: Object.fromEntries(codes.map((code) => [code, (state.units[code] ?? (state.available.has(code) ? ["39"] : [])).map((unit) => ({ unit, name: `LJ ${unit}`, qty: 1, price: 899 }))])),
          fromCache: 0, requested: codes.length,
        };
      },
    }),
  };
});

import { explicitBrand, indexProduct, matchIconicProducts, normalizeBrandQuery, readVision, VISION_PROMPT } from "@/lib/ai/catalog-search";
import { EMPTY_CATALOG_CONTEXT, extractPreferredCity, updateCatalogContext } from "@/lib/ai/catalog-context";
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
  state.units = {};
});

describe("marca falada e cidade de estoque", () => {
  const frames = [
    indexProduct({ code: "111111", description: "ARM MIU MIU REF MU 01 52", brand: "MIU MIU", category: "ARMACAO", subcategory: "", sales: 3, price: 899 }),
    indexProduct({ code: "222222", description: "ARM MIU MIU REF MU 02 52", brand: "MIU MIU", category: "ARMACAO", subcategory: "", sales: 2, price: 899 }),
    indexProduct({ code: "333333", description: "ARM RAY BAN REF RB 01 52", brand: "RAYBAN", category: "ARMACAO", subcategory: "", sales: 4, price: 899 }),
  ];
  it.each([
    ["miumiu", "Miu Miu"], ["miu-miu", "Miu Miu"], ["miú miú", "Miu Miu"], ["mew mew", "Miu Miu"],
    ["rayban", "Ray-Ban"], ["raiban", "Ray-Ban"], ["prada linearossa", "Prada Linea Rossa"],
    ["dolce & gabbana", "Dolce & Gabbana"], ["tomford", "Tom Ford"], ["carolinaherrera", "Carolina Herrera"],
  ])("normaliza %s", (source, expected) => {
    expect(normalizeBrandQuery(source)).toBe(expected);
    expect(explicitBrand(`armação ${source}`)).toBe(expected);
  });
  it("não troca marca nem mostra produtos de fora da cidade na vitrine", async () => {
    state.units = { "111111": ["39", "40"], "222222": ["40", "41", "42"], "333333": ["39"] };
    const { result } = await consultarEstoqueProduto({ termoBusca: "armação miumiu", cidade: "gyn" }, { products: async () => frames, withPrices: true });
    expect(result.tipoBusca).toBe("marca_ampla");
    if (result.tipoBusca !== "marca_ampla") throw new Error("Busca deveria ser ampla");
    expect(result.modelos.flatMap((model) => model.codigos)).toEqual(["111111"]);
    expect(state.requested).not.toContain("333333");
    expect(result.modelos[0].totalDisponivelRede).toBe(1);
  });
  it("vitrine por orçamento exclui linha infantil por padrão e inclui quando o cliente fala de criança", async () => {
    const budgetFrames = [
      indexProduct({ code: "700001", description: "ARM SP KIDS REF LW1839 46", brand: "SP KIDS", category: "ARMACAO", subcategory: "", sales: 9, price: 200 }),
      indexProduct({ code: "700002", description: "ARM ATITUDE INFANTIL REF AT3000 45", brand: "ATITUDE", category: "ARMACAO", subcategory: "", sales: 8, price: 180 }),
      indexProduct({ code: "700003", description: "ARM VOGUE REF VO5300 51", brand: "VOGUE", category: "ARMACAO", subcategory: "", sales: 5, price: 189 }),
      indexProduct({ code: "700004", description: "ARM TECNOL TEEN REF TN1 49", brand: "TECNOL", category: "ARMACAO", subcategory: "", sales: 4, price: 150 }),
    ];
    state.units = { "700001": ["39"], "700002": ["39"], "700003": ["39"], "700004": ["39"] };
    const search = (extra: Record<string, unknown> = {}) => consultarEstoqueProduto({ tipo: "grau", sortBy: "price_asc", cidade: "Goiânia", ...extra }, { products: async () => budgetFrames, withPrices: true });
    const adult = await search();
    if (adult.result.tipoBusca !== "marca_ampla") throw new Error("Busca deveria ser ampla");
    expect(adult.result.modelos.flatMap((model) => model.codigos)).toEqual(["700003"]);
    expect(state.requested).not.toContain("700001");
    const kids = await search({ publicoInfantil: true });
    if (kids.result.tipoBusca !== "marca_ampla") throw new Error("Busca deveria ser ampla");
    expect(kids.result.modelos).toHaveLength(3);
    expect(kids.result.modelos.flatMap((model) => model.codigos)).toEqual(expect.arrayContaining(["700002", "700004"]));
    // Pedido da própria marca infantil ("tem Sp Kids?") não é bloqueado.
    const brand = await consultarEstoqueProduto({ termoBusca: "Sp Kids", cidade: "Goiânia" }, { products: async () => budgetFrames, withPrices: true });
    expect(JSON.stringify(brand.result)).toContain("700001");
  });
  it("marca sem saldo na cidade não é substituída por outra marca", async () => {
    state.units = { "111111": ["40"], "222222": ["41"], "333333": ["39"] };
    const { result } = await consultarEstoqueProduto({ termoBusca: "miumiu", cidade: "Goiânia" }, { products: async () => frames, withPrices: false });
    expect(result.cenario).toBe("sem_estoque_na_cidade");
    expect(result.orientacao).toContain("Goiânia");
    expect(state.requested).not.toContain("333333");
    if (result.tipoBusca !== "marca_ampla") throw new Error("Busca deveria ser ampla");
    expect(result.modelos).toEqual([]);
  });
  it("ficha específica contém somente lojas locais e não inclui produto sem saldo local", async () => {
    state.units = { "111111": ["39", "40"], "222222": ["41"] };
    const first = await consultarEstoqueProduto({ termoBusca: "Miu Miu 111111", cidade: "goiania" }, { products: async () => frames, withPrices: true });
    expect(first.result.produtos[0].lojasComEstoque.map((store) => store.code)).toEqual(["39"]);
    const second = await consultarEstoqueProduto({ termoBusca: "Miu Miu 222222", cidade: "Goiânia" }, { products: async () => frames, withPrices: true });
    expect(second.result.produtos).toEqual([]);
    expect(second.result.orientacao).toContain("Goiânia");
  });
  it("não confunde Goiânia e Aparecida, nem cidade e DF", async () => {
    state.units = { "111111": ["39", "40"], "222222": ["41", "42"] };
    const find = (cidade: string) => consultarEstoqueProduto({ termoBusca: "Miu Miu", cidade }, { products: async () => frames, withPrices: false });
    const aparecida = await find("aparecida de goiania");
    const df = await find("df");
    if (aparecida.result.tipoBusca !== "marca_ampla" || df.result.tipoBusca !== "marca_ampla") throw new Error("Busca deveria ser ampla");
    expect(aparecida.result.modelos.flatMap((item) => item.codigos)).toEqual(["222222"]);
    expect(df.result.modelos.flatMap((item) => item.codigos).sort()).toEqual(["111111", "222222"]);
  });
  it("guarda a cidade desejada e ignora cidade considerada distante", () => {
    expect(extractPreferredCity("estou em Goiânia e Brasilia é muito longe", ["Goiânia", "Brasília"])).toBe("Goiânia");
    const first = updateCatalogContext(EMPTY_CATALOG_CONTEXT, "Queria armação da miumiu para presentear minha esposa", []);
    const second = updateCatalogContext(first.context, "preciso apenas de Goiânia", ["Goiânia"]);
    expect(second.context).toMatchObject({ brand: "Miu Miu", category: "ARMACAO", preferredCity: "Goiânia" });
    expect(second.changed).toBe(true);
  });
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
  it("boas-vindas do cliente que voltou são escritas pelo modelo: o código não injeta frase pronta", () => {
    const texts = [0, 1, 2].map((variant) => welcomeReply("Bom dia, Maria! Que bom ter você de volta. Temos sim!", { first: true, returning: true, customer: "Maria Silva", pendingText: "bom dia", now, variant }));
    expect(new Set(texts)).toEqual(new Set(["Bom dia, Maria! Que bom ter você de volta. Temos sim!"]));
  });
  it("corrige só o período errado da saudação e tira a saudação repetida", () => {
    expect(welcomeReply("Boa noite, Maria! Temos sim!", { first: true, customer: "Maria", pendingText: "tem?", now })).toBe("Bom dia, Maria! Temos sim!");
    expect(welcomeReply("Temos sim!", { first: true, customer: "Maria", pendingText: "tem?", now })).toBe("Temos sim!");
    expect(welcomeReply("Bom dia, Maria! Temos sim!", { first: false, customer: "Maria", pendingText: "tem?", now })).toBe("Temos sim!");
  });
});
