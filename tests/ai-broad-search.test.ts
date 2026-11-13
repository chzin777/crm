import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "@/lib/ai/agent-core";
import { DEFAULT_AI_SETTINGS } from "@/lib/ai/settings";
import { splitAiResponseMessages } from "@/lib/ai/bubbles";
import { buildProductCard, cardStore, commercialName } from "@/lib/ai/product-card";
import { asksForPhoto, shouldSendProductPhoto } from "@/lib/ai/product-details";
import { buildStockResult, STOCK_TOOL, type StockLookup, type StoreInfo } from "@/lib/ai/stock";
import { expandModelNicknames, modelNickname } from "@/lib/ai/product-names";
import { allowsProductPhoto, BROAD_SEARCH_RULES, buildShowcaseResult, classifySearch, showcaseCandidates, showcaseQuestion } from "@/lib/ai/stock-showcase";

const stores = new Map<string, StoreInfo>([
  ["34", { name: "LJ 34 SETOR MARISTA", address: "Rua 27", addressNumber: "2106", neighborhood: "Setor Marista", city: "Goiânia" }],
  ["201", { name: "LJ 201 TAGUATINGA CENTRO", address: "C 9", addressNumber: null, neighborhood: "Taguatinga", city: "Taguatinga" }],
]);
const unit = (code: string, qty: number, price: number) => ({ unit: code, name: `LJ ${code} LOJA`, qty, price });

// Catálogo Ray-Ban (mais vendidos primeiro): Justin em 2 cores, Aviator, Erika sem estoque e Wayfarer.
const catalog = [
  { code: "101", description: "OCS RAY BAN REF-RB4165 JUSTIN 622/8G 54", brand: "RAY BAN" },
  { code: "102", description: "OCS RAY BAN REF-RB4165 JUSTIN 601/8G 54", brand: "RAY BAN" },
  { code: "103", description: "OCS RAY BAN REF-RB4165 JUSTIN 710/13 54", brand: "RAY BAN" },
  { code: "201", description: "OCS RAY BAN REF-RB3025 AVIATOR L0205 58", brand: "RAY BAN" },
  { code: "301", description: "OCS RAY BAN REF-RB4171 ERIKA 710/T5 54", brand: "RAY BAN" },
  { code: "401", description: "OCS RAY BAN REF-RB2140 WAYFARER 901 50", brand: "RAY BAN" },
];
const lookup: StockLookup = {
  stockStatus: "ok",
  fromCache: 0,
  requested: 6,
  byCode: {
    "101": [unit("34", 1, 1210.27)],
    "102": [unit("201", 2, 1210.27)],
    "201": [unit("34", 1, 1150)],
    "301": [],
    "401": [unit("201", 1, 1190)],
  },
};

describe("busca ampla (marca/categoria) x busca específica (modelo)", () => {
  it("classificação: só marca ou categoria é marca_ampla; modelo/referência é modelo_especifico", () => {
    for (const term of ["Ray-Ban", "rayban", "ray ban", "Tem Ray-Ban?", "oakley", "Óculos Prada", "miumiu", "armações femininas", "óculos de sol"]) expect(classifySearch(term)).toBe("marca_ampla");
    // Marca pura vence mesmo se a IA disser específica.
    expect(classifySearch("rayban", "modelo_especifico")).toBe("marca_ampla");
    // Modelo/referência no termo vence mesmo se a IA disser ampla.
    for (const term of ["Ray-Ban Justin", "Oakley Holbrook", "RB4165", "Ray-Ban Meta"]) expect(classifySearch(term, "marca_ampla")).toBe("modelo_especifico");
    for (const term of ["Ray-Ban Justin", "Justin", "RB4165", "Ray-Ban Meta", "Erika"]) expect(classifySearch(term)).toBe("modelo_especifico");
    // Marca só do cadastro do ERP também conta.
    expect(classifySearch("Hickmann Eyewear", undefined, ["HICKMANN EYEWEAR"])).toBe("marca_ampla");
    expect(STOCK_TOOL.function.parameters.properties.tipoBusca.enum).toEqual(["marca_ampla", "modelo_especifico"]);
  });

  it("\"Tem Ray-Ban?\": vitrine deduplicada com nome e preço, sem foto e 2ª bolha perguntando qual modelo ver", () => {
    const groups = showcaseCandidates(catalog);
    // Cores do mesmo modelo viram 1 grupo (até 2 códigos consultados por modelo).
    expect(groups.map((group) => group.map((product) => product.code))).toEqual([["101", "102"], ["201"], ["301"], ["401"]]);
    const result = buildShowcaseResult({ term: "Ray-Ban", groups, lookup, stores, withPrices: true });
    expect(result.tipoBusca).toBe("marca_ampla");
    expect(result.modelos.map((model) => model.nomeComercial)).toEqual(["Ray-Ban Justin", "Ray-Ban Aviator", "Ray-Ban Wayfarer"]);
    expect(result.modelos[0]).toMatchObject({ referencia: "RB4165", precoVenda: "R$ 1.210,27", totalDisponivelRede: 3 });
    expect(result.vitrineFormatada).toBe([
      "Temos vários modelos *Ray-Ban* disponíveis em estoque! Confira alguns deles:",
      "",
      "1. 🕶️ *Ray-Ban Justin (Ref. RB4165)* — R$ 1.210,27",
      "2. 🕶️ *Ray-Ban Aviator (Ref. RB3025)* — R$ 1.150,00",
      "3. 🕶️ *Ray-Ban Wayfarer (Ref. RB2140)* — R$ 1.190,00",
    ].join("\n"));
    // Sem foto e sem detalhamento por loja nesta etapa.
    expect(allowsProductPhoto(result)).toBe(false);
    expect(result.produtos).toEqual([]);
    expect(result.vitrineFormatada).not.toContain("📍");
    expect(result.orientacao).toContain("Não mande foto nem lista de lojas");
    // Resposta da IA: vitrine intacta na 1ª bolha e a pergunta na 2ª.
    const parts = splitAiResponseMessages(`${result.vitrineFormatada}\n\n---SPLIT---\n\n${showcaseQuestion(result.modelos.length)}`);
    expect(parts).toEqual([result.vitrineFormatada, "Gostaria de ver a foto, lojas disponíveis e mais detalhes de algum desses modelos?"]);
  });

  it("vitrine limitada a 8 modelos; sem estoque, sem preço e API fora do ar", () => {
    const many = Array.from({ length: 12 }, (_, index) => ({ code: String(500 + index), description: `OCS RAY BAN REF-RB${4000 + index} 601 54`, brand: "RAY BAN" }));
    const full = { ...lookup, byCode: Object.fromEntries(many.map((product) => [product.code, [unit("34", 1, 900)]])) };
    expect(buildShowcaseResult({ term: "Ray-Ban", groups: showcaseCandidates(many), lookup: full, stores, withPrices: true }).modelos).toHaveLength(8);
    expect(buildShowcaseResult({ term: "Ray-Ban", groups: [[catalog[4]]], lookup, stores, withPrices: true }).cenario).toBe("sem_estoque_na_rede");
    expect(buildShowcaseResult({ term: "Ray-Ban", groups: showcaseCandidates(catalog), lookup, stores, withPrices: false }).vitrineFormatada).not.toContain("R$");
    expect(buildShowcaseResult({ term: "Ray-Ban", groups: showcaseCandidates(catalog), lookup: { ...lookup, stockStatus: "unavailable_api" }, stores, withPrices: true }).cenario).toBe("unavailable_api");
  });

  it("\"Me manda foto do Justin\": modelo_especifico, libera a foto e mostra a ficha completa com estoque e lojas", () => {
    expect(classifySearch("Ray-Ban Justin", "modelo_especifico")).toBe("modelo_especifico");
    const result = buildStockResult({ term: "Ray-Ban Justin", products: [{ code: "101", description: catalog[0].description, brand: "RAY BAN", price: null }], lookup, stores, withPrices: true });
    expect(result.tipoBusca).toBe("modelo_especifico");
    expect(allowsProductPhoto(result)).toBe(true);
    expect(asksForPhoto("Me manda foto do Justin")).toBe(true);
    // Pedido de foto libera mesmo que a foto já tenha ido antes.
    expect(shouldSendProductPhoto({ sku: "101", sentSkus: ["101"], pendingText: "Me manda foto do Justin" })).toBe(true);
    const product = result.produtos[0];
    const card = buildProductCard({ ...commercialName(product.produto, product.marca), formatoArmacao: "Retangular", acabamentoOuMaterial: "Nylon", valorFormatado: product.precoVenda, totalUnidades: product.totalDisponivelRede, lojasDisponiveis: product.lojasComEstoque.map(cardStore) });
    expect(card).toContain("🕶️ *Ray-Ban Justin | Ref. RB4165*");
    expect(card).toContain("💵 *Valor:* R$ 1.210,27");
    expect(card).toContain("📦 *Estoque:* 1 unidade disponível na seguinte loja:\n📍 *");
  });

  it("cadastro real do ERP: apelido do modelo na vitrine e na busca (\"Justin\" → RB4165)", () => {
    const real = [
      { code: "145677", description: "OCS RAY BAN REF 0RB4165L 622/T357", brand: "RAY BAN" },
      { code: "147745", description: "OCS RAY BAN REF 0RB4165L 622/7157", brand: "RAY BAN" },
      { code: "145880", description: "OCS RAY BAN REF 0RB4340 601   50", brand: "RAY BAN" },
      { code: "145844", description: "ARM RAY BAN REF 0RX5429 2012  51", brand: "RAY BAN" },
      { code: "145605", description: "ARM RAY BAN REF 0RX5429 2012  53", brand: "RAY BAN" },
    ];
    const groups = showcaseCandidates(real);
    expect(groups).toHaveLength(3);
    const byCode = { "145677": [unit("34", 2, 1210.27)], "145880": [unit("201", 1, 899)], "145844": [], "145605": [unit("34", 1, 650)] };
    const result = buildShowcaseResult({ term: "Ray-Ban", groups, lookup: { ...lookup, byCode }, stores, withPrices: true });
    expect(result.vitrineFormatada).toContain("1. 🕶️ *Ray-Ban Justin (Ref. RB4165L)* — R$ 1.210,27\n2. 🕶️ *Ray-Ban (Ref. RB4340)* — R$ 899,00\n3. 👓 *Ray-Ban (Ref. RX5429)* — R$ 650,00");
    expect(expandModelNicknames("Ray-Ban Justin")).toBe("Ray-Ban RB4165");
    expect(expandModelNicknames("Justin")).toBe("RB4165");
    expect(expandModelNicknames("Oakley Holbrook XL")).toBe("Oakley OO9417");
    expect(expandModelNicknames("Ray-Ban RB3025")).toBe("Ray-Ban RB3025");
    expect(modelNickname("Ray-Ban", "RX4165")).toBeNull();
  });

  it("prompt traz as 2 etapas com os exemplos literais", () => {
    const prompt = buildSystemPrompt({ settings: DEFAULT_AI_SETTINGS, info: "" });
    expect(prompt).toContain(BROAD_SEARCH_RULES);
    for (const piece of ["Etapa 1 — descoberta", "tipoBusca \"marca_ampla\"", "SEM foto e SEM lista de lojas", "Temos vários modelos *Ray-Ban* disponíveis em estoque! Confira alguns deles:", "Gostaria de ver a foto, lojas disponíveis e mais detalhes de algum desses modelos?", "Etapa 2 — detalhamento", "tipoBusca \"modelo_especifico\"", "me manda foto do Justin"]) {
      expect(BROAD_SEARCH_RULES).toContain(piece);
    }
  });
});
