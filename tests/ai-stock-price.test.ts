import { describe, expect, it } from "vitest";
import { buildStockResult, createStockClient, formatBrl, mainPrice, STOCK_RULES, type StoreInfo } from "@/lib/ai/stock";
import { buildSystemPrompt, interpretDecision } from "@/lib/ai/agent-core";
import { DEFAULT_AI_SETTINGS } from "@/lib/ai/settings";

const stores = new Map<string, StoreInfo>([
  ["17", { name: "LJ 17 OTICAS BRASIL LTDA", address: "AVENIDA T-8", addressNumber: "235", neighborhood: "SETOR BUENO", city: "GOIANIA" }],
  ["36", { name: "LJ 36 THAIS MOTTA GOMES DE OLIVEIRA - EIRELI", address: "AVENIDA PADRE ORLANDO DE MORAIS", addressNumber: "2017", neighborhood: "PARQUE AMAZONIA", city: "GOIANIA" }],
  ["50", { name: "LJ 50 OTICAS BRASIL DF", address: "QS 1 RUA 210", addressNumber: null, neighborhood: "AREAL", city: "AGUAS CLARAS" }],
]);
const justin = [{ code: "108564", description: "OCS RAY BAN REF-RB4165 JUSTIN 601/8G", brand: "RAY BAN", price: 540 }];

/** Resposta da API de estoque do VMSet (saldo + preço de venda por loja). */
async function lookupWith(items: { code: string; unit: string; name: string; qty: number; price: number | null }[]) {
  const client = createStockClient({ url: "http://vmset", token: "t", fetch: async () => ({ ok: true, status: 200, json: async () => ({ items }) }) });
  return client.getStockByProductCodes(["108564"]);
}

describe("preço de venda e quantidade na tool de estoque", () => {
  it("devolve precoVenda em reais e quantidade por loja, total na rede e referência", async () => {
    const lookup = await lookupWith([
      { code: "108564", unit: "17", name: "LJ 17 OTICAS BRASIL LTDA", qty: 3, price: 1070 },
      { code: "108564", unit: "36", name: "LJ 36 THAIS MOTTA", qty: 2, price: 1070 },
      { code: "108564", unit: "50", name: "LJ 50 OTICAS BRASIL DF", qty: 1, price: 1122.55 },
    ]);
    const result = buildStockResult({ term: "Ray-Ban Justin", region: "Setor Bueno", products: justin, lookup, stores, withPrices: true });
    const [product] = result.produtos;
    expect(result.cenario).toBe("disponivel_na_regiao");
    expect(product).toMatchObject({ nomeProduto: "OCS RAY BAN REF-RB4165 JUSTIN 601/8G", referencia: "108564", precoVenda: "R$ 1.070,00", precoVariaPorLoja: true, precoSobConsulta: false, totalDisponivelRede: 6 });
    expect(product.lojasNaRegiao[0]).toMatchObject({ loja: expect.stringContaining("Setor Bueno"), quantidade: 3, precoVenda: "R$ 1.070,00" });
    expect(product.lojasComEstoque.find((store) => store.code === "50")).toMatchObject({ quantidade: 1, precoVenda: "R$ 1.122,55", cidade: "Águas Claras (DF)" });
    // Nunca a média de vendas com desconto (price: 540 do catálogo).
    expect(JSON.stringify(result)).not.toContain("540");
  });

  it("estoque com preço zerado/nulo no ERP → precoSobConsulta (só aí a IA oferece confirmar o valor)", async () => {
    const lookup = await lookupWith([{ code: "108564", unit: "17", name: "LJ 17 OTICAS BRASIL LTDA", qty: 2, price: null }, { code: "108564", unit: "36", name: "LJ 36", qty: 1, price: 0 }]);
    const [product] = buildStockResult({ term: "Justin", products: justin, lookup, stores, withPrices: true }).produtos;
    expect(product).toMatchObject({ precoVenda: null, precoSobConsulta: true, totalDisponivelRede: 3 });
  });

  it("sem a opção de informar preços em /ia, nenhum valor vai para a IA", async () => {
    const lookup = await lookupWith([{ code: "108564", unit: "17", name: "LJ 17", qty: 2, price: 1070 }]);
    const result = buildStockResult({ term: "Justin", products: justin, lookup, stores, withPrices: false });
    expect(JSON.stringify(result)).not.toMatch(/R\$|1070/);
    expect(result.produtos[0]).toMatchObject({ precoVenda: null, precoSobConsulta: false, totalDisponivelRede: 2 });
  });

  it("formato em reais e preço mais comum entre as lojas", () => {
    expect(formatBrl(1070)).toBe("R$ 1.070,00");
    expect(formatBrl(1122.550877)).toBe("R$ 1.122,55");
    expect(mainPrice([{ code: "1", loja: "a", quantidade: 1, precoVenda: "R$ 1.122,55" }, { code: "2", loja: "b", quantidade: 1, precoVenda: "R$ 1.070,00" }, { code: "3", loja: "c", quantidade: 1, precoVenda: "R$ 1.070,00" }])).toBe("R$ 1.070,00");
  });
});

describe("regras fixas: informar preço e quantidade sem transbordo", () => {
  it('"Quanto custa o Ray-Ban Justin e quantos tem no Setor Bueno?": preço em R$ e quantidade da loja, sem transferir', () => {
    const prompt = buildSystemPrompt({ settings: DEFAULT_AI_SETTINGS, info: "" });
    expect(prompt).toContain(STOCK_RULES);
    expect(STOCK_RULES).toContain("informe diretamente");
    expect(STOCK_RULES).toContain("O valor exato devolvido em precoVenda");
    expect(STOCK_RULES).toContain("informe quantas unidades constam");
    expect(STOCK_RULES).toContain("NÃO transfira para um atendente quando a ferramenta devolveu preço e estoque");
    expect(STOCK_RULES).not.toContain("não informe quantidades exatas");
    // Resposta esperada do modelo com os dados da tool: vira resposta ao cliente, não transferência.
    const outcome = interpretDecision({ action: "reply", reply: "O *Ray-Ban Justin* está saindo por *R$ 1.070,00* e temos 3 unidades na *Loja Setor Bueno*.\n---SPLIT---\nQuer que eu reserve uma pra você?" });
    expect(outcome.action).toBe("reply");
  });

  it("precoSobConsulta: informa a disponibilidade e oferece transferir para confirmar o orçamento", () => {
    expect(STOCK_RULES).toContain("precoSobConsulta for true (tem estoque mas sem preço no sistema: informe a disponibilidade e ofereça transferir para confirmar o orçamento)");
  });
});
