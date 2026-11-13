import { describe, expect, it, vi } from "vitest";
import { buildStockResult, createStockClient, isRetailUnit, retailStock, STOCK_CACHE_TTL_MS, STOCK_RULES, STOCK_TIMEOUT_MS, storeCity, storeLabel, stockSearchTerms, type StoreInfo } from "@/lib/ai/stock";
import { agentRules } from "@/lib/ai/agent-core";
import { DEFAULT_AI_SETTINGS } from "@/lib/ai/settings";

const ok = (items: unknown[]) => ({ ok: true, status: 200, json: async () => ({ items }) });

const stores = new Map<string, StoreInfo>([
  ["36", { name: "LJ 36 THAIS MOTTA GOMES DE OLIVEIRA - EIRELI", address: "AVENIDA PADRE ORLANDO DE MORAIS", addressNumber: "2017", neighborhood: "PARQUE AMAZONIA", city: "GOIANIA" }],
  ["13", { name: "LJ 13 UNILENTES IND COM DE LENTES LTDA", address: "AVENIDA RIO VERDE", addressNumber: "S/N", neighborhood: "JARDIM NOVA ERA", city: "APARECIDA DE GOIANIA" }],
  ["23", { name: "LJ 23 UNILENTES IND COM DE LENTES LTDA", address: "RUA SAO BENTO", addressNumber: "16", neighborhood: "SETOR CENTRAL", city: "APARECIDA DE GOIANIA" }],
]);

describe("cliente de estoque do VMSet", () => {
  it("cache de 3 minutos: a segunda consulta não chama a API", async () => {
    let clock = 1_000;
    const fetch = vi.fn(async () => ok([{ code: "146011", unit: "36", name: "LJ 36 THAIS", qty: 2 }]));
    const client = createStockClient({ url: "http://vmset", token: "t", fetch, now: () => clock });
    const first = await client.getStockByProductCodes(["146011"]);
    clock += STOCK_CACHE_TTL_MS - 1;
    const second = await client.getStockByProductCodes(["146011"]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(second).toMatchObject({ stockStatus: "ok", fromCache: 1, requested: 0 });
    expect(second.byCode).toEqual(first.byCode);
    clock += 2;
    await client.getStockByProductCodes(["146011"]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(STOCK_CACHE_TTL_MS).toBe(180_000);
  });

  it("consulta só os códigos sem cache e no máximo 5", async () => {
    const fetch = vi.fn(async (_url: string) => ok([]));
    const client = createStockClient({ url: "http://vmset", token: "t", fetch });
    await client.getStockByProductCodes(["1"]);
    await client.getStockByProductCodes(["1", "2", "3", "4", "5", "6", "7"]);
    expect(fetch.mock.calls[1][0]).toBe("http://vmset/stock?codes=2,3,4,5");
  });

  it("timeout de 3 s vira unavailable_api sem lançar erro", async () => {
    expect(STOCK_TIMEOUT_MS).toBe(3_000);
    const fetch = vi.fn((_url: string, init: { signal: AbortSignal }) => new Promise<never>((_, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason))));
    const client = createStockClient({ url: "http://vmset", token: "t", fetch, timeoutMs: 20 });
    const result = await client.getStockByProductCodes(["146011"]);
    expect(result.stockStatus).toBe("unavailable_api");
    // Falha não entra no cache: a próxima pergunta tenta de novo.
    await client.getStockByProductCodes(["146011"]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("erro HTTP também cai no fallback seguro", async () => {
    const client = createStockClient({ url: "http://vmset", token: "t", fetch: async () => ({ ok: false, status: 503, json: async () => ({}) }) });
    await expect(client.getStockByProductCodes(["1"])).resolves.toMatchObject({ stockStatus: "unavailable_api" });
  });
});

describe("lojas de varejo", () => {
  it("remove unidades administrativas e devolve só varejo com saldo > 0", () => {
    expect(isRetailUnit("ADM UNILENTES IND COM DE LENTES LTDA")).toBe(false);
    expect(isRetailUnit("M3 PROCESSO APOIO E INFORMACAO LTDA")).toBe(false);
    expect(isRetailUnit("CENTRO DISTRIBUICAO OPTICO LTDA")).toBe(false);
    expect(isRetailUnit("UNILENTES IND COM DE LENTES LTDA")).toBe(false);
    expect(isRetailUnit("TO ADM - LJ 10 OTICAS BRASIL")).toBe(false);
    expect(isRetailUnit("LJ 13 UNILENTES IND COM DE LENTES LTDA")).toBe(true);
    expect(isRetailUnit("OPTICA BRASIL LTDA LJ 05 (BAIXADA)")).toBe(true);

    const list = retailStock([
      { unit: "56", name: "ADM UNILENTES IND COM DE LENTES LTDA", qty: 9 },
      { unit: "16", name: "M3 PROCESSO APOIO E INFORMACAO LTDA", qty: 4 },
      { unit: "64", name: "CENTRO DISTRIBUICAO OPTICO LTDA", qty: 80 },
      { unit: "13", name: "LJ 13 UNILENTES IND COM DE LENTES LTDA", qty: 0 },
      { unit: "36", name: "LJ 36 THAIS MOTTA GOMES DE OLIVEIRA - EIRELI", qty: 2 },
    ], stores);
    expect(list).toEqual([{ code: "36", loja: "Loja Parque Amazônia — Av. Padre Orlando de Morais, 2017", quantidade: 2, cidade: "Goiânia" }]);
    expect(storeCity({ name: "LJ 50", address: null, addressNumber: null, neighborhood: null, city: "AGUAS CLARAS" })).toBe("Águas Claras (DF)");
    expect(storeCity({ name: "LJ 13", address: null, addressNumber: null, neighborhood: null, city: "APARECIDA DE GOIANIA" })).toBe("Aparecida de Goiânia");
  });

  it("nome comercial limpo, com cidade fora de Goiânia e sem S/N", () => {
    expect(storeLabel("13", stores.get("13"))).toBe("Loja Jardim Nova Era (Aparecida de Goiânia) — Av. Rio Verde");
    expect(storeLabel("99", undefined)).toBe("Loja 99");
  });
});

describe("cenários da tool consultarEstoqueProduto", () => {
  const products = [{ code: "146011", description: "OCS RAY BAN REF 0RB3025L 001/5158", brand: "RAY BAN", price: 1290 }];
  const lookup = (units: { unit: string; name: string; qty: number }[]) => ({ stockStatus: "ok" as const, byCode: { "146011": units }, fromCache: 0, requested: 1 });

  it("saldo na região pedida", () => {
    const result = buildStockResult({ term: "ray ban rb3025", region: "Parque Amazônia", products, lookup: lookup([{ unit: "36", name: "LJ 36 THAIS", qty: 1 }, { unit: "13", name: "LJ 13 UNILENTES", qty: 3 }]), stores, withPrices: false });
    expect(result.cenario).toBe("disponivel_na_regiao");
    expect(result.produtos[0].lojasNaRegiao[0].loja).toContain("Parque Amazônia");
    expect(result.produtos[0].lojasComEstoque[0].code).toBe("36");
    expect(result.produtos[0].preco).toBeNull();
  });

  it("esgotado na região, disponível em outras", () => {
    const result = buildStockResult({ term: "rb3025", region: "parque amazonia", products, lookup: lookup([{ unit: "36", name: "LJ 36 THAIS", qty: 0 }, { unit: "23", name: "LJ 23 UNILENTES", qty: 1 }]), stores, withPrices: false });
    expect(result.cenario).toBe("esgotado_na_regiao_disponivel_em_outras");
    expect(result.produtos[0].lojasComEstoque.map((store) => store.code)).toEqual(["23"]);
  });

  it("sem estoque na rede, API fora e produto inexistente", () => {
    expect(buildStockResult({ term: "rb3025", products, lookup: lookup([{ unit: "64", name: "CENTRO DISTRIBUICAO OPTICO LTDA", qty: 50 }]), stores, withPrices: false }).cenario).toBe("sem_estoque_na_rede");
    expect(buildStockResult({ term: "rb3025", products, lookup: { stockStatus: "unavailable_api", byCode: {}, fromCache: 0, requested: 1 }, stores, withPrices: false }).cenario).toBe("unavailable_api");
    expect(buildStockResult({ term: "xyz", products: [], lookup: null, stores, withPrices: false }).cenario).toBe("produto_nao_encontrado");
  });

  it("regras fixas no prompt proíbem a resposta evasiva", () => {
    const rules = agentRules({ ...DEFAULT_AI_SETTINGS, extraInstructions: "" }, []);
    expect(rules).toContain(STOCK_RULES);
    expect(STOCK_RULES).toContain('NUNCA diga "a disponibilidade precisa ser confirmada na loja"');
    expect(STOCK_RULES).toContain("unavailable_api");
  });

  it("termos de busca: todas as palavras primeiro, depois menos", () => {
    expect(stockSearchTerms("óculos Ray-Ban RB3025")).toEqual([["RAYBAN", "RB3025"].join("")].map((joined) => [joined]).concat([["RAYBAN", "RB3025"], ["RAYBAN"]]));
  });
});
