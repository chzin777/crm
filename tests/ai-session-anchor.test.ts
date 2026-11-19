import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoreInfo } from "@/lib/ai/stock";

// Cadastro real do Setor Marista: Rua 9 tem duas unidades distintas (nº 2106, com 3 filiais no mesmo endereço, e nº 1855).
const STORES = vi.hoisted(() => {
  const marista = (name: string, address: string, addressNumber: string) => ({ id: name, name, address, addressNumber, neighborhood: "SETOR MARISTA", city: "GOIANIA", lat: null, lng: null });
  return new Map<string, StoreInfo>([
    ["36", marista("LJ 133 UNILENTES", "RUA 9", "2106")],
    ["15", marista("OPTICA BRASIL LJ 05 (BAIXADA)", "RUA 9", "1855")],
    ["133", marista("LJ 133 UNILENTES B", "RUA 9", "2106")],
    ["22", marista("LJ 34-ZVC MARISTA", "RUA 27", "2106")],
    ["30", marista("LJ 21 UNILENTES", "RUA 135 ESQUINA COM AVENIDA AMERICANO DO BRASIL", "208")],
    ["23", marista("LJ 33 BEATRIZ", "RUA 9", "2106")],
    ["19", { id: "19", name: "LJ 37", address: "RUA 95", addressNumber: "95", neighborhood: "SETOR SUL", city: "GOIANIA", lat: null, lng: null }],
    ["39", { id: "39", name: "LJ 39-ZVC FLAMBOYANT SAULO DE TARSO FERREIRA MOTTA LTDA", address: "AVENIDA DEPUTADO JAMEL CECILIO", addressNumber: "3300", neighborhood: "JARDIM GOIAS", city: "GOIANIA", lat: null, lng: null }],
    ["4", { id: "4", name: "LJ 04 UNILENTES IND COM DE LENTES LTDA", address: "AVENIDA DEPUTADO JAMEL CECILIO", addressNumber: "3300", neighborhood: "JARDIM GOIAS", city: "GOIANIA", lat: null, lng: null }],
  ]);
});

// Catálogo: o Aviator pedido e o Justin (modelo que vazava de outra sessão).
const AVIATOR = { codigo: "7858001", produto: "OCS RAY BAN REF 0RB3025 004/78 58", marca: "RAY BAN" };
const JUSTIN = { codigo: "4165001", produto: "OCS RAY BAN REF 0RB4165L 622/8G 55", marca: "RAY BAN" };
// Radda do cadastro real: o 1º mais vendido não tem "REF" (era o "Radda" genérico que abria o loop).
const RADDA = [
  { code: "140701", description: "ARM RADDA    OPBR 455 C2", brand: "RADDA", ref: "OPBR 455" },
  { code: "145145", description: "ARM RADDA       REF- JC60020 C6 53", brand: "RADDA", ref: "JC60020" },
  { code: "145154", description: "ARM RADDA       REF- JC2501 C6 53", brand: "RADDA", ref: "JC2501" },
  { code: "145149", description: "ARM RADDA       REF- JC60016 C4 54", brand: "RADDA", ref: "JC60016" },
];

const calls = vi.hoisted(() => ({ stock: [] as Record<string, unknown>[], details: [] as Record<string, unknown>[], photos: [] as string[], prompts: [] as string[] }));
type Tool = { definition: { function: { name: string } }; run: (args: Record<string, unknown>) => Promise<unknown> };
const model = vi.hoisted(() => ({ script: null as null | ((tools: Record<string, Tool["run"]>) => Promise<Record<string, unknown>>), vision: null as null | Record<string, unknown> }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/minio", () => ({ readFile: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { chatQueue: { findMany: vi.fn(async () => []) } } }));
vi.mock("@/lib/meta-whatsapp", () => ({ sendLocation: vi.fn(), sendTypingIndicator: vi.fn() }));
vi.mock("@/lib/chat/outbound", () => ({ ChatRuleError: class extends Error {}, sendAutomaticImage: vi.fn(), sendAutomaticMessage: vi.fn() }));
vi.mock("@/lib/chat/actions", () => ({ closeConversation: vi.fn() }));
vi.mock("@/lib/chat/nps", () => ({ sendSatisfactionSurvey: vi.fn() }));
vi.mock("@/lib/ai/assist", () => ({ catalog: vi.fn(async () => ""), conversationContext: vi.fn(), sessionStartedAt: vi.fn(async () => null) }));
vi.mock("@/lib/ai/store", () => ({ readAiSettings: vi.fn(), readAiStatus: vi.fn() }));
vi.mock("@/lib/store-pin", () => ({ ensureStorePin: vi.fn(async () => null) }));
vi.mock("@/lib/ai/staff-db", () => ({ activeStaff: vi.fn(async () => [{ id: "u-leandro", name: "Leandro Martins", queueId: "q-vendas", queueName: "Vendas" }]) }));
vi.mock("@/lib/ai/catalog-db",() => ({ catalogProducts: vi.fn(async () => []), searchErpCatalog: vi.fn() }));
vi.mock("@/lib/ai/product-image-db", () => ({
  catalogImages: vi.fn(async () => ({})),
  imageSearchStatus: () => true,
  invalidateProductImage: vi.fn(),
  searchAndCacheProductImage: vi.fn(async (product: { codigo: string }) => {
    calls.photos.push(product.codigo);
    return { sku: product.codigo, url: `https://img.test/${product.codigo}.jpg`, source: "web", query: product.codigo };
  }),
}));
vi.mock("@/lib/ai/stock-db", () => ({
  storeDirectory: vi.fn(async () => STORES),
  erpUnitDirectory: vi.fn(() => new Map<string, string>()),
  clearStoreDirectory: vi.fn(),
  consultarEstoqueProduto: vi.fn(async (args: Record<string, unknown>) => {
    calls.stock.push(args);
    const term = String(args.termoBusca ?? "");
    if (/miu miu/i.test(term)) {
      const { buildShowcaseResult, showcaseCandidates } = await import("@/lib/ai/stock-showcase");
      const models = [
        { code: "111", description: "ARM MIU MIU REF MU12345 52", brand: "MIU MIU" },
        { code: "222", description: "ARM MIU MIU REF MU54321 52", brand: "MIU MIU" },
      ];
      const unit = [{ unit: "36", name: "LJ 36", qty: 1, price: 899 }];
      const result = buildShowcaseResult({ term, groups: showcaseCandidates(models), lookup: { stockStatus: "ok", fromCache: 0, requested: 2, byCode: { "111": unit, "222": unit } }, stores: STORES, withPrices: true, brand: "MIU MIU", city: typeof args.cidade === "string" ? args.cidade : undefined });
      return { result, log: { term, region: "", scenario: result.cenario, products: result.modelos.length, stores: 0, ms: 1, cached: false, kind: "marca_ampla" } };
    }
    // Radda: só a marca → vitrine (a do código, com o item sem REF do cadastro real); com referência → o modelo.
    if (/radda/i.test(term)) {
      const { buildShowcaseResult, showcaseCandidates } = await import("@/lib/ai/stock-showcase");
      const raddaUnit = (qty: number) => [{ unit: "36", name: "LJ 36", qty, price: 120 }];
      if (!/\d/.test(term) && args.tipoBusca !== "modelo_especifico") {
        const result = buildShowcaseResult({ term, groups: showcaseCandidates(RADDA), lookup: { stockStatus: "ok", fromCache: 0, requested: 4, byCode: { "140701": raddaUnit(2), "145145": raddaUnit(1), "145154": raddaUnit(3), "145149": raddaUnit(1) } }, stores: STORES, withPrices: true, brand: "RADDA" });
        return { result, log: { term, region: "", scenario: result.cenario, products: result.modelos.length, stores: 0, ms: 1, cached: false, kind: "marca_ampla" } };
      }
      const chosen = RADDA.find((item) => term.toUpperCase().includes(item.ref)) ?? RADDA[0];
      const produtos = [{ codigo: chosen.code, produto: chosen.description, marca: "RADDA", preco: 120, precoVenda: "R$ 120,00", nomeProduto: chosen.description, referencia: "", lojasNaRegiao: [], precoVariaPorLoja: false, precoSobConsulta: false, totalDisponivelRede: 1, lojasComEstoque: [{ code: "36", loja: "Loja Setor Marista — Rua 9, 2106", quantidade: 1, cidade: "Goiânia" }] }];
      return { result: { tipoBusca: "modelo_especifico", cenario: "disponivel_em_lojas", termoBusca: term, regiao: "", regiaoReconhecida: false, produtos, orientacao: "" }, log: { term, region: "", scenario: "disponivel_em_lojas", products: 1, stores: 1, ms: 1, cached: false } };
    }
    // Prada Linea Rossa: marca → vitrine com 2 modelos; referência → o modelo com estoque em 2 lojas.
    if (/prada|07RV|02WV/i.test(term)) {
      const { buildShowcaseResult, showcaseCandidates } = await import("@/lib/ai/stock-showcase");
      const prada = [{ code: "900701", description: "ARM PRADA LINEA ROSSA REF PS 07RV 1AB 54", brand: "PRADA LINEA ROSSA" }, { code: "900702", description: "ARM PRADA LINEA ROSSA REF PS 02WV 1BO 55", brand: "PRADA LINEA ROSSA" }];
      if (args.tipoBusca !== "modelo_especifico") {
        const unit = (qty: number) => [{ unit: "36", name: "LJ 36", qty, price: 1960 }];
        const result = buildShowcaseResult({ term, groups: showcaseCandidates(prada), lookup: { stockStatus: "ok", fromCache: 0, requested: 2, byCode: { "900701": unit(2), "900702": unit(1) } }, stores: STORES, withPrices: true, brand: "PRADA LINEA ROSSA" });
        return { result, log: { term, region: "", scenario: result.cenario, products: result.modelos.length, stores: 0, ms: 1, cached: false, kind: "marca_ampla" } };
      }
      if (/05YS/i.test(term)) {
        return { result: { tipoBusca: "modelo_especifico", cenario: "sem_estoque_na_rede", termoBusca: term, produtos: [], orientacao: "" }, log: { term, region: "", scenario: "sem_estoque_na_rede", products: 0, stores: 0, ms: 1, cached: false } };
      }
      const chosen = /02WV/i.test(term) ? prada[1] : prada[0];
      const produtos = [{ codigo: chosen.code, produto: chosen.description, marca: chosen.brand, preco: 1960, precoVenda: "R$ 1.960,00", nomeProduto: chosen.description, referencia: "", lojasNaRegiao: [], precoVariaPorLoja: false, precoSobConsulta: false, totalDisponivelRede: 3, lojasComEstoque: [{ code: "39", loja: "Loja Jardim Goiás — Av. Deputado Jamel Cecilio, 3300", quantidade: 2, cidade: "Goiânia" }, { code: "36", loja: "Loja Setor Marista — Rua 9, 2106", quantidade: 1, cidade: "Goiânia" }] }];
      return { result: { tipoBusca: "modelo_especifico", cenario: "disponivel_em_lojas", termoBusca: term, regiao: "", regiaoReconhecida: false, produtos, orientacao: "" }, log: { term, region: "", scenario: "disponivel_em_lojas", products: 1, stores: 2, ms: 1, cached: false } };
    }
    // Lumen: só 1 modelo com estoque em Goiânia, com a referência quebrada do ERP ("DO -").
    if (/lumen/i.test(term)) {
      const lumen = { code: "880001", description: "OCS LUMEN PRAIA FORTE DO - 55", brand: "LUMEN" };
      if (args.tipoBusca !== "modelo_especifico") {
        const { buildShowcaseResult, showcaseCandidates } = await import("@/lib/ai/stock-showcase");
        const result = buildShowcaseResult({ term, groups: showcaseCandidates([lumen]), lookup: { stockStatus: "ok", fromCache: 0, requested: 1, byCode: { "880001": [{ unit: "36", name: "LJ 36", qty: 1, price: 440 }] } }, stores: STORES, withPrices: true, brand: "LUMEN", city: typeof args.cidade === "string" ? args.cidade : undefined });
        return { result, log: { term, region: "", scenario: result.cenario, products: result.modelos.length, stores: 0, ms: 1, cached: false, kind: "marca_ampla" } };
      }
      const produtos = [{ codigo: lumen.code, produto: lumen.description, marca: "LUMEN", preco: 440, precoVenda: "R$ 440,00", nomeProduto: lumen.description, referencia: "DO -", lojasNaRegiao: [], precoVariaPorLoja: false, precoSobConsulta: false, totalDisponivelRede: 1, lojasComEstoque: [{ code: "36", loja: "Loja Setor Marista — Rua 9, 2106", quantidade: 1, cidade: "Goiânia" }] }];
      return { result: { tipoBusca: "modelo_especifico", cenario: "disponivel_em_lojas", termoBusca: term, regiao: "", regiaoReconhecida: false, produtos, orientacao: "" }, log: { term, region: "", scenario: "disponivel_em_lojas", products: 1, stores: 1, ms: 1, cached: false } };
    }
    // Armação de grau sem marca (orçamento): 2 modelos em Goiânia (R$ 189 e R$ 239), 1 acima do teto e 1 só em Brasília.
    if (args.tipo === "grau") {
      const { buildShowcaseResult, showcaseCandidates } = await import("@/lib/ai/stock-showcase");
      const frames = [
        { code: "501", description: "ARM ATITUDE REF AT1001 52", brand: "ATITUDE" },
        { code: "502", description: "ARM VOGUE REF VO5300 51", brand: "VOGUE" },
        { code: "503", description: "ARM TECNOL REF TN3010 53", brand: "TECNOL" },
        { code: "504", description: "ARM RAY BAN REF RB7047 54", brand: "RAY BAN" },
      ];
      const at = (unit: string, price: number) => [{ unit, name: `LJ ${unit}`, qty: 1, price }];
      const result = buildShowcaseResult({
        term, groups: showcaseCandidates(frames), stores: new Map([...STORES, ["90", { id: "90", name: "LJ 90", address: "SCS QUADRA 2", addressNumber: "1", neighborhood: "ASA SUL", city: "BRASILIA", lat: null, lng: null }]]), withPrices: true,
        lookup: { stockStatus: "ok", fromCache: 0, requested: 4, byCode: { "501": at("36", 239), "502": at("39", 189), "503": at("90", 149), "504": at("36", 690) } },
        city: typeof args.cidade === "string" ? args.cidade : undefined,
        price: { maxPrice: typeof args.maxPrice === "number" ? args.maxPrice : undefined, sortBy: args.sortBy as "price_asc" | undefined },
      });
      return { result, log: { term, region: "", scenario: result.cenario, products: result.modelos.length, stores: 0, ms: 1, cached: false, kind: "marca_ampla" } };
    }
    // Busca aproximada que devolve o Justin primeiro (o vazamento original), com o Aviator logo atrás.
    const product = (item: typeof AVIATOR) => ({ ...item, preco: 899, precoVenda: "R$ 899,00", nomeProduto: item.produto, referencia: "", lojasNaRegiao: [], precoVariaPorLoja: false, precoSobConsulta: false, totalDisponivelRede: 1, lojasComEstoque: [{ code: "36", loja: "Loja Setor Marista — Rua 9, 2106", quantidade: 1, cidade: "Goiânia" }] });
    const produtos = /3025/.test(term) ? [product(JUSTIN), product(AVIATOR)] : [product(JUSTIN)];
    return { result: { tipoBusca: "modelo_especifico", cenario: "disponivel_em_lojas", termoBusca: term, regiao: "", regiaoReconhecida: false, produtos, orientacao: "" }, log: { term, region: "", scenario: "disponivel_em_lojas", products: produtos.length, stores: 1, ms: 1, cached: false } };
  }),
}));
vi.mock("@/lib/ai/product-details-db", () => ({
  productSummary: vi.fn(async () => ({ miniDescricao: null, avaliacaoWeb: null, formato: "Aviador", acabamento: "Metal", source: "cache" })),
  buscarDetalhesProduto: vi.fn(async (args: Record<string, unknown>) => {
    calls.details.push(args);
    const product = args.codigo === AVIATOR.codigo || /3025/.test(String(args.referencia ?? "")) ? AVIATOR : JUSTIN;
    return { result: { nomeProduto: product.produto }, log: { product: product.produto, source: "cache", variations: 0, ms: 1 }, product };
  }),
}));
vi.mock("@/lib/ai/openai", () => ({
  aiConfigured: () => true,
  AiError: class extends Error {},
  transcribeAudio: vi.fn(),
  aiJson: vi.fn(async (messages: { role: string; content: unknown }[], meta: { tools?: Tool[] }) => {
    // Chamada de visão (identificação da foto): devolve a análise roteirizada do teste.
    if (String(messages[0].content).startsWith("Você classifica a imagem")) return model.vision ?? { kind: "outro" };
    calls.prompts.push(String(messages[0].content));
    const tools = Object.fromEntries((meta.tools ?? []).map((tool) => [tool.definition.function.name, tool.run]));
    return model.script ? model.script(tools) : { reply: "Oi!", action: "reply" };
  }),
}));

import { simulateAgent, type PlaygroundMessage } from "@/lib/ai/agent";
import { DEFAULT_AI_SETTINGS } from "@/lib/ai/settings";
import { buildProductCard } from "@/lib/ai/product-card";
import { extractSessionAnchor, isProductFollowUp, isStoreFollowUp, mentionsOtherProduct, sessionRows, storesIn } from "@/lib/ai/session-anchor";
import { anchoredStoreMatch, citesAddress, findStores, normalizeStoreQuery, resolveStoreMatch, resolveStoreRequest, storeLocation, storeQueryMatches } from "@/lib/ai/store-location";
import { formatContext, transcriptLine, type TranscriptRow } from "@/lib/ai/agent-core";

const settings = { ...DEFAULT_AI_SETTINGS, sendProductImage: true, canQuotePrices: true, useStores: false, useOperatingHours: false, topics: [], aiChoosesQueue: false, maxAiReplies: 20, closeWhenResolved: false };
const AVIATOR_CARD = buildProductCard({ nomeComercial: "Ray-Ban Aviator Classic", referencia: "RB3025", categoriaModelo: "Óculos de sol", formatoArmacao: "Aviador", acabamentoOuMaterial: "Metal", valorFormatado: "R$ 899,00", totalUnidades: 1, lojasDisponiveis: [{ loja: "Loja Setor Marista", cidade: "Goiânia", endereco: "Rua 9, 2106", quantidade: 1 }] });

beforeEach(() => {
  calls.stock.length = 0;
  calls.details.length = 0;
  calls.photos.length = 0;
  calls.prompts.length = 0;
  model.script = null;
  model.vision = null;
});

describe("busca com 1 único modelo na cidade", () => {
  it("entrega direto a ficha com foto e lojas locais, sem lista \"1.\", sem \"(Ref. DO -)\", sem ---SPLIT--- e sem oferecer ver as lojas", async () => {
    model.script = async (tools) => {
      const result = (await tools.consultarEstoqueProduto({ termoBusca: "Lumen", tipoBusca: "marca_ampla" })) as { fichaFormatada?: string; vitrineFormatada?: string };
      return { reply: `Separei uma opção em Goiânia pra você:\n${result.fichaFormatada ?? result.vitrineFormatada}\n\n---SPLIT---\n\nÉ uma ótima pedida. Quer que eu veja em quais lojas de Goiânia tem essa peça pra você provar?`, action: "reply" };
    };
    const turn = await simulateAgent(settings, [{ from: "customer", text: "tem Lumen?" }], "user-1", undefined, { sessionId: "sessao-unico", knownCity: "Goiânia" });
    expect(calls.stock.at(-1)).toMatchObject({ tipoBusca: "modelo_especifico", cidade: "Goiânia" });
    expect(turn.image?.sku).toBe("880001");
    const text = turn.messages.join("\n");
    expect(text).toContain("📍 *Loja Setor Marista*");
    expect(text).toContain("R$ 440,00");
    expect(text).not.toMatch(/^\s*1\.\s/m);
    expect(text).not.toMatch(/Ref\. DO|\(Ref\. -\)/);
    expect(text).not.toMatch(/SPLIT/);
    expect(text).not.toMatch(/em quais lojas/i);
    expect(text).toMatch(/unidade mais perto de você pra provar\?/);
    expect(turn.interactiveList).toBeUndefined();
  });
});

describe("saudação informal pura no agente", () => {
  it.each(["opaa", "oiii", "bom diaaa", "eai"])("%j → abertura acolhedora, sem tratar como nome/loja/setor", async (text) => {
    model.script = async () => ({ reply: "Oi, Michel! Me conta o que você está procurando.", action: "reply" });
    const run = await simulateAgent(settings, [{ from: "customer", text }], "user-1", undefined, { contactName: "Michel" });
    expect(run.action).toBe("reply");
    expect(run.handoffQueue).toBe("");
    // A abertura é a do modelo, sem frase pronta acrescentada pelo código.
    expect(run.reply).toBe("Oi, Michel! Me conta o que você está procurando.");
    expect(run.reply).not.toMatch(/falar com/i);
    expect(calls.prompts.at(-1)).toContain("SAUDAÇÃO PURA NESTE TURNO");
    expect(calls.prompts.at(-1)).not.toContain("ATENÇÃO NESTE TURNO");
    expect(calls.stock).toHaveLength(0);
  });
});

describe("isolamento de sessão", () => {
  it("sem cidade pergunta antes de listar; com a cidade lista só lá; a correção abre com as palavras da IA", async () => {
    // Turno 1: marca pedida, cidade desconhecida → nenhuma consulta de estoque, a IA pergunta a cidade.
    model.script = async () => ({ reply: "Que presente lindo! Em qual cidade você está?", action: "reply" });
    const first = await simulateAgent(settings, [{ from: "customer", text: "Queria armação da miumiu para presentear minha esposa" }], "user-1", undefined, { contactName: "Michel" });
    expect(calls.stock).toHaveLength(0);
    expect(first.reply).toMatch(/cidade/i);
    expect(first.interactiveList).toBeUndefined();
    expect(first.catalogContext).toMatchObject({ brand: "Miu Miu", category: "ARMACAO", preferredCity: "" });
    expect(calls.prompts.at(-1)).toContain("CIDADE DESCONHECIDA");

    // Turno 2: cidade informada → busca da marca só em Goiânia; a abertura é a que a IA escreveu (sem prefixo fixo).
    const messages: PlaygroundMessage[] = [
      { from: "customer", text: "Queria armação da miumiu para presentear minha esposa", catalogContext: first.catalogContext },
      { from: "ai", text: first.reply },
      { from: "customer", text: "estou em Goiânia e Brasilia é muito longe" },
    ];
    model.script = async () => ({ reply: "Que presente lindo! Separei as Miu Miu que estão em Goiânia:", action: "reply" });
    const city = await simulateAgent(settings, messages, "user-1");
    expect(city.catalogContext?.preferredCity).toBe("Goiânia");
    expect(calls.stock.at(-1)).toMatchObject({ marca: "Miu Miu", cidade: "Goiânia" });
    expect(city.interactiveList?.rows).toHaveLength(2);
    expect(city.reply).toMatch(/^Que presente lindo! Separei as Miu Miu que estão em Goiânia:\n/);
    expect(city.reply).toContain("Miu Miu");
    expect(city.reply).not.toMatch(/Que presente especial|Confira as opções em/);
    expect(calls.prompts.at(-1)).toContain("BUSCA JÁ FEITA NESTA RESPOSTA");

    // Turno 3: correção com a cidade já conhecida → nova busca, desculpa escrita pela IA.
    messages.push({ from: "ai", text: city.reply, catalogContext: city.catalogContext }, { from: "customer", text: "vc errou, pedi armação miumiu" });
    model.script = async () => ({ reply: "Perdão pela confusão! Aqui estão as Miu Miu certinhas:", action: "reply" });
    const correction = await simulateAgent(settings, messages.map((message, index) => (index === 0 ? { ...message, catalogContext: city.catalogContext } : message)), "user-1");
    expect(correction.reply).toContain("Perdão pela confusão!");
    expect(correction.interactiveList?.rows).toHaveLength(2);
    expect(calls.stock.at(-1)).toMatchObject({ marca: "Miu Miu", cidade: "Goiânia" });
  });
  it("consultora: \"armação de grau barata\" sem cidade → pergunta cidade e orçamento; \"Goiânia até 250\" → só opções locais até R$ 250", async () => {
    // Turno 1: a IA tenta buscar mesmo assim; a ferramenta recusa listar sem cidade (nada de outro estado).
    let gated: unknown = null;
    model.script = async (tools) => {
      gated = await tools.consultarEstoqueProduto({ tipo: "grau", sortBy: "price_asc" });
      return { reply: "Consigo te mostrar umas bem em conta! De qual cidade você fala?", action: "reply" };
    };
    const history: PlaygroundMessage[] = [{ from: "customer", text: "vocês têm armação de grau barata?" }];
    const ask = await simulateAgent(settings, history, "user-1", undefined, { contactName: "Ana" });
    expect(calls.stock).toHaveLength(0);
    expect(gated).toMatchObject({ cenario: "cidade_desconhecida", produtos: [] });
    // Cidade desconhecida: pergunta SÓ a cidade, simples, sem acumular orçamento na mesma frase.
    expect(ask.reply).toMatch(/de qual cidade você fala/i);
    expect(ask.reply).not.toMatch(/R\$|faixa de valor|quanto|gastar|investir|bairro/i);
    expect(ask.reply.match(/\?/g)).toHaveLength(1);
    expect(ask.reply).not.toMatch(/\d\.\s/);
    expect(ask.interactiveList).toBeUndefined();
    expect(calls.prompts.at(-1)).toContain("CIDADE DESCONHECIDA");
    expect(calls.prompts.at(-1)).toContain("UMA PERGUNTA SÓ");

    // Turno 2: cidade + teto → preferredCity salvo e busca grau/até 250/mais baratas primeiro, só em Goiânia.
    history.push({ from: "ai", text: ask.reply }, { from: "customer", text: "sou de Goiânia e queria algo até 250 reais" });
    model.script = async (tools) => {
      const result = (await tools.consultarEstoqueProduto({ tipo: "grau", maxPrice: 250, sortBy: "price_asc", cidade: "Goiânia" })) as { vitrineFormatada: string };
      return { reply: `Separei duas ótimas opções aqui em Goiânia dentro do seu orçamento:\n${result.vitrineFormatada}\n---SPLIT---\nA Vogue é leve pro dia a dia; a Atitude é mais resistente. Quer provar na loja ou mandar a receita pra orçar as lentes junto?`, action: "reply" };
    };
    const offer = await simulateAgent(settings, history, "user-1", undefined, { contactName: "Ana" });
    expect(offer.catalogContext?.preferredCity).toBe("Goiânia");
    expect(calls.stock.at(-1)).toMatchObject({ tipo: "grau", maxPrice: 250, sortBy: "price_asc", cidade: "Goiânia" });
    const text = offer.messages.join("\n");
    expect(text).toMatch(/1\. 👓 \*Vogue[^\n]*R\$ 189,00/);
    expect(text).toMatch(/2\. 👓 \*Atitude[^\n]*R\$ 239,00/);
    expect(text).not.toMatch(/Tecnol|149,00/); // só em Brasília
    expect(text).not.toMatch(/690,00/); // acima do orçamento
    expect(text).toMatch(/receita/);
  });

  it("\"quero um óculos mais em conta\" sem cidade nem tipo → pergunta só a cidade; depois só grau ou sol, sem catálogo", async () => {
    model.script = async (tools) => {
      await tools.consultarEstoqueProduto({ sortBy: "price_asc" });
      return { reply: "Claro! Em qual cidade você está?", action: "reply" };
    };
    const ask = await simulateAgent(settings, [{ from: "customer", text: "quero um óculos mais em conta" }], "user-1", undefined, { contactName: "Ana" });
    expect(calls.stock).toHaveLength(0);
    // A pergunta é a do modelo (nada acrescentado pelo código); a regra de 1 pergunta está no prompt.
    expect(ask.reply).toBe("Claro! Em qual cidade você está?");
    expect(calls.prompts.at(-1)).toContain("pergunte só a cidade dele");
    expect(calls.prompts.at(-1)).toContain("UMA PERGUNTA SÓ");

    // Cidade conhecida, tipo ainda não: continua sem listar e pergunta só grau ou sol.
    const history: PlaygroundMessage[] = [{ from: "customer", text: "quero um óculos mais em conta" }, { from: "ai", text: ask.reply }, { from: "customer", text: "sou de Goiânia" }];
    model.script = async (tools) => {
      const result = (await tools.consultarEstoqueProduto({ sortBy: "price_asc", cidade: "Goiânia" })) as { cenario: string };
      return { reply: result.cenario === "tipo_desconhecido" ? "Perfeito! E você procura de grau ou de sol?" : "Olha essas:", action: "reply" };
    };
    const type = await simulateAgent(settings, history, "user-1", undefined, { contactName: "Ana" });
    expect(calls.stock).toHaveLength(0);
    expect(type.reply).toMatch(/^Perfeito! .*de grau ou de sol\?/);
    expect(type.reply).not.toMatch(/cidade/i);

    // "De grau": agora busca só armações, e o valor vem com o aviso das lentes à parte.
    history.push({ from: "ai", text: type.reply }, { from: "customer", text: "de grau, até 250" });
    model.script = async (tools) => {
      const result = (await tools.consultarEstoqueProduto({ tipo: "grau", maxPrice: 250, sortBy: "price_asc", cidade: "Goiânia" })) as { vitrineFormatada: string };
      return { reply: `Separei estas em Goiânia, leves pro dia a dia:\n${result.vitrineFormatada}\n---SPLIT---\nO valor é só da armação; as lentes a gente orça pela sua receita.`, action: "reply" };
    };
    const offer = await simulateAgent(settings, history, "user-1", undefined, { contactName: "Ana" });
    expect(calls.stock.at(-1)).toMatchObject({ tipo: "grau", maxPrice: 250 });
    const text = offer.messages.join("\n");
    expect(text).toMatch(/1\. 👓 \*Vogue/);
    // O aviso das lentes é escrito pelo modelo (a regra está no prompt); o código não acrescenta nota nem CTA fixo.
    expect(text).toContain("as lentes a gente orça pela sua receita");
    expect(calls.prompts.at(-1)).toContain("lentes são orçadas conforme a receita");
    expect(text).not.toMatch(/Qual desses estilos combinou mais com você\?|esses valores são da armação/);
  });

  it("orçamento dito antes da cidade vira filtro mesmo se a IA esquecer de passar", async () => {
    model.script = async (tools) => {
      await tools.consultarEstoqueProduto({ tipo: "grau" });
      return { reply: "Olha essas:", action: "reply" };
    };
    const history: PlaygroundMessage[] = [
      { from: "customer", text: "queria uma armação de grau baratinha, até 200 reais" },
      { from: "ai", text: "De qual cidade você fala?" },
      { from: "customer", text: "Goiânia" },
    ];
    await simulateAgent(settings, history, "user-1");
    expect(calls.stock[0]).toMatchObject({ tipo: "grau", maxPrice: 200, sortBy: "price_asc", cidade: "Goiânia" });
  });

  it("cidade do cadastro do contato já libera a vitrine sem perguntar", async () => {
    model.script = async (tools) => {
      const result = (await tools.consultarEstoqueProduto({ tipo: "grau", sortBy: "price_asc" })) as { vitrineFormatada: string };
      return { reply: result.vitrineFormatada, action: "reply" };
    };
    const run = await simulateAgent(settings, [{ from: "customer", text: "tem armação barata?" }], "user-1", undefined, { knownCity: "goiania" });
    expect(calls.stock.at(-1)).toMatchObject({ cidade: "Goiânia" });
    expect(run.catalogContext?.preferredCity).toBe("Goiânia");
    expect(run.reply).not.toMatch(/de qual cidade/i);
  });

  it("novo atendimento após encerramento: mensagens da sessão encerrada não entram no prompt, só o nome do cliente", () => {
    const closedAt = new Date("2026-11-10T15:00:00-03:00");
    const rows: TranscriptRow[] = [
      { author: "customer", authorName: null, text: "Tem o Ray-Ban Justin?", internal: false, attachment: null, createdAt: new Date("2026-11-10T14:00:00-03:00") },
      { author: "bot", authorName: "Assistente IA", text: "🕶️ *Ray-Ban Justin | Ref. RB4165L*", internal: false, attachment: null, createdAt: new Date("2026-11-10T14:01:00-03:00") },
      { author: "customer", authorName: null, text: "Oi, boa tarde", internal: false, attachment: null, createdAt: new Date("2026-11-13T10:00:00-03:00") },
    ];
    const conversation = sessionRows(rows, closedAt).map((row) => transcriptLine(row)).filter(Boolean).join("\n");
    const context = formatContext({ contactName: "Christofer", queueName: null, subject: "", includeHistory: false, history: null, conversation });
    expect(context).toContain("Christofer");
    expect(context).toContain("Oi, boa tarde");
    expect(context).not.toMatch(/Justin|RB4165/);
    // Sem mensagens da IA na sessão nova: nenhum produto ou loja fixados.
    expect(extractSessionAnchor([])).toEqual({ activeProduct: null, activeStore: null });
  });

  it("teste novo no /ia (Limpar): sem produto nem loja fixados no prompt", async () => {
    await simulateAgent(settings, [{ from: "customer", text: "Oi" }], "user-1", undefined, { sessionId: "sessao-nova-123" });
    expect(calls.prompts[0]).not.toContain("activeProduct:");
    expect(calls.prompts[0]).not.toContain("activeStore:");
    expect(calls.prompts[0]).toContain("ÂNCORA DA SESSÃO (regra fixa)");
  });
});

describe("âncora de produto e loja", () => {
  it("ficha do RB3025 fixa activeProduct e activeStore (Rua 9, 2106)", () => {
    const anchor = extractSessionAnchor([{ text: AVIATOR_CARD, imageSku: AVIATOR.codigo, imageUrl: "https://img.test/a.jpg" }, { text: "Gostaria de reservar essa peça ou saber mais detalhes sobre o modelo?" }]);
    expect(anchor.activeProduct).toMatchObject({ sku: AVIATOR.codigo, referencia: "RB3025", nomeComercial: "Ray-Ban Aviator Classic", marca: "Ray-Ban", ultimaFotoEnviadaUrl: "https://img.test/a.jpg" });
    expect(anchor.activeStore).toMatchObject({ nome: "Loja Setor Marista", cidade: "Goiânia", enderecoCompleto: "Rua 9, 2106" });
  });

  it("texto livre e mensagem de localização também fixam a loja; duas lojas na mesma mensagem não fixam", () => {
    expect(storesIn("Ele está na *Loja Setor Marista* (Rua 9, 2106) 😊")[0]).toMatchObject({ nome: "Loja Setor Marista", enderecoCompleto: "Rua 9, 2106" });
    expect(storesIn("📍 *Óticas Brasil - Loja Setor Sul*\nRua 95, 95\nhttps://maps.google.com/?q=x")[0]).toMatchObject({ nome: "Loja Setor Sul", enderecoCompleto: "Rua 95, 95" });
    expect(extractSessionAnchor([{ text: "• *Loja Setor Sul* — Rua 95\n• *Loja Setor Sul* — Rua 90, 118" }]).activeStore).toBeNull();
  });

  it("follow-up de detalhes sem citar outro modelo usa o produto fixado; outro modelo ou marca solta a âncora", () => {
    const anchor = extractSessionAnchor([{ text: AVIATOR_CARD, imageSku: AVIATOR.codigo }]);
    expect(isProductFollowUp("me dê mais detalhes", anchor)).toBe(true);
    expect(isProductFollowUp("como ele é?", anchor)).toBe(true);
    expect(isProductFollowUp("fala mais dele", anchor)).toBe(true);
    expect(isProductFollowUp("mais detalhes do RB3025", anchor)).toBe(true);
    expect(mentionsOtherProduct("e o Justin? me dá mais detalhes", anchor.activeProduct!)).toBe(true);
    expect(isProductFollowUp("mais detalhes do RB4165", anchor)).toBe(false);
    expect(isProductFollowUp("tem mais detalhes do Oakley Holbrook?", anchor)).toBe(false);
  });

  it("localização no singular usa a loja fixada; plural ou outro lugar não", () => {
    const anchor = extractSessionAnchor([{ text: AVIATOR_CARD }]);
    expect(isStoreFollowUp("vc poderia me enviar a localização da loja?", anchor)).toBe(true);
    expect(isStoreFollowUp("onde fica essa loja?", anchor)).toBe(true);
    expect(isStoreFollowUp("manda a localização das lojas", anchor)).toBe(false);
    expect(isStoreFollowUp("e a localização da loja do Setor Bueno?", anchor)).toBe(false);
  });

  it("Rua 9, 2106 x Rua 9, 1855: o número citado decide a unidade (sem listar as 4 do Setor Marista)", () => {
    const directory = [...STORES].map(([code, store]) => ({ code, store }));
    expect(citesAddress("Loja Setor Marista – Goiânia (Rua 9, 2106)", STORES.get("36")!)).toBe(true);
    expect(citesAddress("Loja Setor Marista – Goiânia (Rua 9, 2106)", STORES.get("15")!)).toBe(false);
    expect(anchoredStoreMatch(directory, "Loja Setor Marista Rua 9, 2106")?.store.addressNumber).toBe("2106");
    // Pedido nomeando outra loja: a âncora não vale.
    expect(anchoredStoreMatch(directory, "Loja Setor Marista Rua 9, 2106", findStores(STORES, "Setor Sul"))).toBeNull();
    const resolved = resolveStoreMatch(findStores(STORES, "Setor Marista"), { wanted: "Setor Marista", recentAiTexts: [AVIATOR_CARD] });
    expect(resolved.type).toBe("found");
    expect(resolved.type === "found" && resolved.match.store.address).toBe("RUA 9");
    expect(resolved.type === "found" && resolved.match.store.addressNumber).toBe("2106");
  });
});

describe("fluxo completo RB3025 → mais detalhes → localização da loja", () => {
  it("mantém o RB3025 e a loja da Rua 9, 2106 do início ao fim", async () => {
    // Turno 1: referência exata → ficha e foto do Aviator (mesmo com o Justin vindo primeiro na busca).
    model.script = async (tools) => {
      const stock = (await tools.consultarEstoqueProduto({ termoBusca: "Ray-Ban 0RB3025 004/7858", tipoBusca: "modelo_especifico" })) as { fichaFormatada: string };
      return { reply: `${stock.fichaFormatada}\n---SPLIT---\nGostaria de reservar essa peça ou saber mais detalhes sobre o modelo?`, action: "reply" };
    };
    const history: PlaygroundMessage[] = [{ from: "customer", text: "OCS RAY BAN REF 0RB3025 004/7858" }];
    const turn1 = await simulateAgent(settings, history, "user-1", undefined, { sessionId: "sessao-rb3025" });    expect(turn1.image?.sku).toBe(AVIATOR.codigo);
    expect(turn1.messages[0]).toContain("Ray-Ban Aviator Classic | Ref. RB3025");
    expect(turn1.messages[0]).toContain("(Rua 9, 2106)");
    expect(turn1.anchor?.activeProduct).toBeNull();
    history.push(...turn1.messages.map((text, index): PlaygroundMessage => ({ from: "ai", text, ...(index === 0 && turn1.image ? { imageSku: turn1.image.sku, imageUrl: turn1.image.url } : {}) })));

    // Turno 2: o modelo erra e pede detalhes do Justin; o backend força o RB3025 e não manda foto de outro óculos.
    calls.photos.length = 0;
    model.script = async (tools) => {
      await tools.buscarDetalhesProdutoWeb({ nomeProduto: "Ray-Ban Justin", referencia: "RB4165" });
      await tools.consultarEstoqueProduto({ termoBusca: "Ray-Ban Justin", tipoBusca: "modelo_especifico" });
      return { reply: "O Aviator Classic tem armação de metal e lentes G-15.", action: "reply" };
    };
    history.push({ from: "customer", text: "me dê mais detalhes" });
    const turn2 = await simulateAgent(settings, history, "user-1", undefined, { sessionId: "sessao-rb3025" });
    expect(turn2.anchor?.activeProduct).toMatchObject({ referencia: "RB3025", sku: AVIATOR.codigo });
    expect(turn2.anchor?.activeStore).toMatchObject({ enderecoCompleto: "Rua 9, 2106" });
    expect(calls.details.at(-1)).toMatchObject({ codigo: AVIATOR.codigo, referencia: "RB3025", nomeProduto: "Ray-Ban Aviator Classic" });
    expect(String(calls.stock.at(-1)?.termoBusca)).toContain("RB3025");
    expect(calls.photos).not.toContain(JUSTIN.codigo);
    expect(turn2.image).toBeUndefined();
    expect(calls.prompts.at(-1)).toContain("activeProduct: Ray-Ban Aviator Classic | Ref. RB3025");
    history.push(...turn2.messages.map((text): PlaygroundMessage => ({ from: "ai", text })));

    // Turno 3a: o modelo chama a localização só com o bairro → sai a Rua 9, 2106, sem lista de unidades.
    model.script = async (tools) => {
      const result = (await tools.enviarLocalizacaoLoja({ nomeLoja: "Setor Marista" })) as { enviado: boolean; lojasPossiveis?: string[] };
      expect(result.enviado).toBe(true);
      expect(result.lojasPossiveis).toBeUndefined();
      return { reply: "Claro! Te mandei a localização aqui embaixo 👇", action: "reply" };
    };
    const ask = [...history, { from: "customer" as const, text: "vc poderia me enviar a localização da loja?" }];
    const turn3 = await simulateAgent(settings, ask, "user-1", undefined, { sessionId: "sessao-rb3025" });
    expect(turn3.location?.endereco).toBe("Rua 9, 2106");

    // Turno 3b: o modelo nem chama a ferramenta → a loja fixada já chega resolvida no prompt (fato), ele confirma com
    // as próprias palavras e o backend envia a localização; nenhuma frase pronta substitui a resposta.
    model.script = async () => ({ reply: "Prontinho, é a do Setor Marista, pertinho de você.", action: "reply" });
    const fallback = await simulateAgent(settings, ask, "user-1", undefined, { sessionId: "sessao-rb3025" });
    expect(fallback.location?.endereco).toBe("Rua 9, 2106");
    expect(calls.prompts.at(-1)).toMatch(/LOCALIZAÇÃO JÁ RESOLVIDA: [^\n]*Setor Marista[^\n]*Rua 9, 2106/);
    expect(fallback.messages).toEqual(["Prontinho, é a do Setor Marista, pertinho de você."]);
  });
});

describe("localização de loja listada pelo estoque (cascata sessão → CRM → ERP)", () => {
  const PRADA_CARD = buildProductCard({ nomeComercial: "Prada Linea Rossa", referencia: "PS 07RV", categoriaModelo: "Armação de grau", formatoArmacao: null, acabamentoOuMaterial: null, valorFormatado: "R$ 1.290,00", totalUnidades: 2, lojasDisponiveis: [{ loja: "Loja Jardim Goiás", cidade: "Goiânia", endereco: "Av. Deputado Jamel Cecilio, 3300", quantidade: 1 }, { loja: "Loja Setor Marista", cidade: "Goiânia", endereco: "Rua 9, 2106", quantidade: 1 }] });
  const ASK = "Manda a localização dessa loja do jardim goias ai pra eu comprar ele";

  it("normaliza o pedido sem acento, prefixo nem ruído", () => {
    expect(normalizeStoreQuery("essa loja do jardim goias")).toBe("jardim goias");
    expect(normalizeStoreQuery("Óticas Brasil - Filial Jardim Goiás")).toBe("jardim goias");
    expect(normalizeStoreQuery(ASK)).toBe("jardim goias");
    expect(storeQueryMatches("dessa loja do jardim goias", "Loja Jardim Goiás")).toBe(true);
  });

  it("turno 1 lista a loja do Jardim Goiás → turno 2 sem acento e com \"dessa loja do\" resolve de primeira", () => {
    const resolved = resolveStoreRequest({ queries: ["dessa loja do jardim goias", ASK], sessionStores: storesIn(PRADA_CARD), directory: STORES, recentAiTexts: [PRADA_CARD] });
    expect(resolved).toMatchObject({ type: "found", source: "crm" });
    expect(resolved.type === "found" && storeLocation(resolved.code, resolved.store).endereco).toBe("Av. Deputado Jamel Cecilio, 3300");
  });

  it("loja só na conversa (sem cadastro no CRM): usa o endereço exibido e o link do Maps", () => {
    const resolved = resolveStoreRequest({ queries: [ASK], sessionStores: storesIn(PRADA_CARD), directory: new Map() });
    expect(resolved).toMatchObject({ type: "found", source: "session" });
    const location = resolved.type === "found" ? storeLocation(resolved.code, resolved.store) : null;
    expect(location?.endereco).toContain("Jamel Cecilio, 3300");
    expect(location?.mapsUrl).toMatch(/^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=.*Jamel/);
  });

  it("filial só no espelho do ERP (sem cadastro no CRM): encontra pela filial e envia a localização", () => {
    const erpUnits = new Map([["50", "LJ 50 OTICA BRASIL BURITI SHOPPING LTDA"]]);
    const byName = resolveStoreRequest({ queries: ["manda a localização da loja do buriti shopping"], sessionStores: [], directory: STORES, erpUnits });
    expect(byName).toMatchObject({ type: "found", source: "erp", code: "50" });
    const location = byName.type === "found" ? storeLocation(byName.code, byName.store) : null;
    expect(location?.nome).toContain("Buriti Shopping");
    expect(location?.mapsUrl).toContain("Buriti");
    // Listada na conversa com endereço: o endereço completo vai junto.
    const listed = resolveStoreRequest({ queries: ["essa loja do buriti"], sessionStores: storesIn("📍 *Loja Buriti Shopping* – Aparecida de Goiânia (Av. Rio Verde, 1234)"), directory: STORES, erpUnits });
    expect(listed.type === "found" && storeLocation(listed.code, listed.store).endereco).toContain("Av. Rio Verde, 1234");
  });

  const TWO_PINS = "📍 Loja Jardim Nova Era - Aparecida de Goiânia (Av. Rio Verde)\n📍 Loja Jardim Goiás - Goiânia (Av. Deputado Jamel Cecilio, 3300)";

  it("lista com duas lojas em linhas 📍: extrai 2 lojas limpas, sem a segunda colada no endereço da primeira", () => {
    expect(storesIn(TWO_PINS)).toEqual([
      { lojaId: null, nome: "Loja Jardim Nova Era", cidade: "Aparecida de Goiânia", enderecoCompleto: "Av. Rio Verde" },
      { lojaId: null, nome: "Loja Jardim Goiás", cidade: "Goiânia", enderecoCompleto: "Av. Deputado Jamel Cecilio, 3300" },
    ]);
    expect(storesIn(TWO_PINS.replace("\n", "\r\n"))).toHaveLength(2);
    expect(storesIn(TWO_PINS).every((store) => !/📍|\n/u.test(`${store.nome}${store.cidade}${store.enderecoCompleto}`))).toBe(true);
  });

  it("\"Manda a localização dessa loja do jardim goias\" → só a Loja Jardim Goiás, sem desambiguação", () => {
    const query = "Manda a localização dessa loja do jardim goias";
    const session = resolveStoreRequest({ queries: [query], sessionStores: storesIn(TWO_PINS), directory: new Map() });
    expect(session).toMatchObject({ type: "found", source: "session", store: { name: "Loja Jardim Goiás", address: "Av. Deputado Jamel Cecilio, 3300" } });
    // Endereço de outra loja citando "Jardim Goiás" não disputa com o nome da unidade.
    const polluted = [{ nome: "Loja Jardim Nova Era", cidade: "Aparecida de Goiânia", enderecoCompleto: "Av. Rio Verde, perto do Jardim Goiás" }, ...storesIn(TWO_PINS).slice(1)];
    expect(resolveStoreRequest({ queries: [query], sessionStores: polluted, directory: new Map() })).toMatchObject({ type: "found", store: { name: "Loja Jardim Goiás" } });
    expect(resolveStoreRequest({ queries: [query], sessionStores: storesIn(TWO_PINS), directory: STORES })).toMatchObject({ type: "found", source: "crm" });
  });

  it("fluxo /ia: Ray-Ban Meta RW4014 em 2 lojas → \"manda a localização dessa loja do jardim goias\" envia direto", async () => {
    const card = buildProductCard({ nomeComercial: "Ray-Ban Meta Wayfarer", referencia: "RW4014", categoriaModelo: "Óculos inteligente", formatoArmacao: null, acabamentoOuMaterial: null, valorFormatado: "R$ 2.499,00", totalUnidades: 2, lojasDisponiveis: [{ loja: "Loja Jardim Nova Era", cidade: "Aparecida de Goiânia", endereco: "Av. Rio Verde", quantidade: 1 }, { loja: "Loja Jardim Goiás", cidade: "Goiânia", endereco: "Av. Deputado Jamel Cecilio, 3300", quantidade: 1 }] });
    const history: PlaygroundMessage[] = [
      { from: "customer", text: "Tem o Ray-Ban Meta RW4014?" },
      { from: "ai", text: card },
      { from: "customer", text: "Manda a localização dessa loja do jardim goias" },
    ];
    model.script = async (tools) => {
      const result = (await tools.enviarLocalizacaoLoja({ nomeLoja: "jardim goias" })) as { enviado: boolean; lojasPossiveis?: string[] };
      expect(result.lojasPossiveis).toBeUndefined();
      expect(result.enviado).toBe(true);
      return { reply: "Claro! Te mandei a localização aqui embaixo 👇", action: "reply" };
    };
    const run = await simulateAgent(settings, history, "user-1", undefined, { sessionId: "sessao-rw4014" });
    expect(run.location?.endereco).toBe("Av. Deputado Jamel Cecilio, 3300");
  });

  it("card com quantidade por loja: 3 unidades em 2 lojas e o sufixo não contamina endereço nem localização", () => {
    const card = buildProductCard({ nomeComercial: "Ray-Ban Meta Wayfarer", referencia: "RW4014", categoriaModelo: "Óculos inteligente", formatoArmacao: null, acabamentoOuMaterial: null, valorFormatado: "R$ 2.499,00", totalUnidades: 3, lojasDisponiveis: [{ loja: "Loja Setor Bueno", cidade: "Goiânia", endereco: "Av. T 8 Esquina com Rua-27, 235", quantidade: 2 }, { loja: "Loja Jardim Nova Era", cidade: "Aparecida de Goiânia", endereco: "Av. Rio Verde", quantidade: 1 }] });
    expect(card).toContain("📦 *Estoque:* 3 unidades disponíveis nas seguintes lojas:\n📍 *Loja Setor Bueno* - Goiânia (Av. T 8 Esquina com Rua-27, 235) — 2 unidades\n📍 *Loja Jardim Nova Era* - Aparecida de Goiânia (Av. Rio Verde) — 1 unidade");
    expect(storesIn(card)).toEqual([
      { lojaId: null, nome: "Loja Setor Bueno", cidade: "Goiânia", enderecoCompleto: "Av. T 8 Esquina com Rua-27, 235" },
      { lojaId: null, nome: "Loja Jardim Nova Era", cidade: "Aparecida de Goiânia", enderecoCompleto: "Av. Rio Verde" },
    ]);
    const resolved = resolveStoreRequest({ queries: ["manda a localização da loja do jardim nova era"], sessionStores: storesIn(card), directory: new Map() });
    expect(resolved).toMatchObject({ type: "found", source: "session", store: { name: "Loja Jardim Nova Era", address: "Av. Rio Verde" } });
  });

  it("1 loja só: singular/plural certo e a localização dessa loja sai direto", async () => {
    const one = (quantidade: number) => buildProductCard({ nomeComercial: "Prada Linea Rossa", referencia: "PS 07RV", categoriaModelo: "Armação de grau", formatoArmacao: null, acabamentoOuMaterial: null, valorFormatado: "R$ 1.290,00", totalUnidades: quantidade, lojasDisponiveis: [{ loja: "Loja Jardim Goiás", cidade: "Goiânia", endereco: "Av. Deputado Jamel Cecilio, 3300", quantidade }] });
    expect(one(1)).toContain("📦 *Estoque:* 1 unidade disponível na seguinte loja:\n📍 *Loja Jardim Goiás* - Goiânia (Av. Deputado Jamel Cecilio, 3300) — 1 unidade");
    expect(one(2)).toContain("📦 *Estoque:* 2 unidades disponíveis na seguinte loja:\n📍 *Loja Jardim Goiás* - Goiânia (Av. Deputado Jamel Cecilio, 3300) — 2 unidades");
    expect(storesIn(one(2))[0].enderecoCompleto).toBe("Av. Deputado Jamel Cecilio, 3300");
    const history: PlaygroundMessage[] = [
      { from: "customer", text: "Tem o Prada PS 07RV?" },
      { from: "ai", text: one(2) },
      { from: "customer", text: "me manda a localização dessa loja" },
    ];
    model.script = async (tools) => {
      expect(await tools.enviarLocalizacaoLoja({ nomeLoja: "Loja Jardim Goiás" })).toMatchObject({ enviado: true });
      return { reply: "Claro! Te mandei a localização aqui embaixo 👇", action: "reply" };
    };
    const run = await simulateAgent(settings, history, "user-1", undefined, { sessionId: "sessao-uma-loja" });
    expect(run.location?.endereco).toBe("Av. Deputado Jamel Cecilio, 3300");
  });

  it("nome da filial no CRM (\"Flamboyant\") também resolve", () => {
    expect(resolveStoreRequest({ queries: ["Flamboyant"], sessionStores: [], directory: STORES })).toMatchObject({ type: "found", source: "crm" });
  });

  it("fluxo /ia: Prada PS 07RV → \"manda a localização dessa loja do jardim goias\" envia a localização de primeira", async () => {
    const history: PlaygroundMessage[] = [
      { from: "customer", text: "Tem o Prada Linea Rossa PS 07RV?" },
      { from: "ai", text: PRADA_CARD },
      { from: "ai", text: "Gostaria de reservar essa peça ou saber mais detalhes sobre o modelo?" },
      { from: "customer", text: ASK },
    ];
    // Modelo chama a ferramenta com o nome como veio na ficha.
    model.script = async (tools) => {
      const result = (await tools.enviarLocalizacaoLoja({ nomeLoja: "Loja Jardim Goiás - Goiânia" })) as { enviado: boolean };
      expect(result.enviado).toBe(true);
      return { reply: "Claro! Te mandei a localização aqui embaixo 👇", action: "reply" };
    };
    const viaTool = await simulateAgent(settings, history, "user-1", undefined, { sessionId: "sessao-prada" });
    expect(viaTool.location?.endereco).toBe("Av. Deputado Jamel Cecilio, 3300");
    // Modelo não chama a ferramenta: a loja já chega resolvida no prompt (fato) e o backend envia a localização;
    // a confirmação é a do modelo, sem regex trocando o texto dele.
    model.script = async () => ({ reply: "Prontinho! É a do Jardim Goiás.", action: "reply" });
    const fallback = await simulateAgent(settings, history, "user-1", undefined, { sessionId: "sessao-prada" });
    expect(fallback.location?.endereco).toBe("Av. Deputado Jamel Cecilio, 3300");
    expect(calls.prompts.at(-1)).toContain("LOCALIZAÇÃO JÁ RESOLVIDA");
    expect(fallback.messages).toEqual(["Prontinho! É a do Jardim Goiás."]);
  });
});

describe("vitrine Radda sem loop: \"tem radda?\" → \"esse de 120\" → \"esse primeiro\"", () => {
  it("lista numerada, pergunta número/referência no preço repetido e abre o 1º com foto e ficha", async () => {
    // Turno 1: busca ampla → vitrine numerada com referências reais (o item sem REF vai para o fim, com a ref. do cadastro).
    model.script = async (tools) => {
      const result = (await tools.consultarEstoqueProduto({ termoBusca: "Radda", tipoBusca: "marca_ampla" })) as { vitrineFormatada: string };
      return { reply: `Tem sim! Separei as Radda que estão aqui:\n${result.vitrineFormatada}\n---SPLIT---\nAs fotos não estão no sistema agora, mas me diz qual número te chamou atenção.`, action: "reply" };
    };
    const history: PlaygroundMessage[] = [{ from: "customer", text: "ta, tem radda?" }];
    const turn1 = await simulateAgent(settings, history, "user-1", undefined, { sessionId: "sessao-radda", knownCity: "Goiânia" });
    // Sem foto cadastrada: vitrine em texto limpo, sem código "Ref."; a ordem fica em lastShownProducts.
    expect(turn1.messages[0]).toContain("1. 👓 *Radda* — R$ 120,00");
    expect(turn1.messages[0]).toContain("3. 👓 *Radda* — R$ 120,00");
    expect(turn1.messages[0]).not.toMatch(/Ref\./);
    // A ferramenta já avisou o modelo de que não há fotos (fotosNoCatalogo: 0); o aviso é dele, não do código.
    expect(turn1.messages.join("\n")).toContain("As fotos não estão no sistema agora");
    expect(turn1.catalogContext?.lastShownProducts?.map((item) => item.ref)).toEqual(["JC60020", "JC2501", "JC60016"]);
    history.push(...turn1.messages.map((text, index): PlaygroundMessage => ({ from: "ai", text, ...(index === 0 ? { catalogContext: turn1.catalogContext } : {}) })));

    // Turno 2: "esse de 120" com 4 itens a R$ 120 → o modelo tenta a busca ampla de novo; nada de vitrine repetida.
    const searchesBefore = calls.stock.length;
    model.script = async (tools) => {
      const again = (await tools.consultarEstoqueProduto({ termoBusca: "Radda", tipoBusca: "marca_ampla" })) as { vitrineFormatada?: string; orientacao?: string };
      seen = again;
      return { reply: "Os quatro estão por R$ 120! Qual número você quer ver primeiro?", action: "reply" };
    };
    let seen: { vitrineFormatada?: string; orientacao?: string } | null = null;
    history.push({ from: "customer", text: "deixa eu ver esse de 120 ai" });
    const turn2 = await simulateAgent(settings, history, "user-1", undefined, { sessionId: "sessao-radda", knownCity: "Goiânia" });
    expect(calls.stock.length).toBe(searchesBefore);
    // A ferramenta não devolve a vitrine de novo e orienta perguntar o número (sem frase pronta nem código "Ref.").
    expect(seen).toMatchObject({ vitrineJaEnviada: true, opcoesComEssePreco: [1, 2, 3] });
    expect(seen!.orientacao).not.toMatch(/Ref\.|"/);
    expect(turn2.messages.join("\n")).toBe("Os quatro estão por R$ 120! Qual número você quer ver primeiro?");
    expect(turn2.image).toBeUndefined();
    history.push(...turn2.messages.map((text): PlaygroundMessage => ({ from: "ai", text })));

    // Turno 3: "esse primeiro" → o modelo insiste na marca, o backend força JC60020 específico: foto + ficha + lojas.
    calls.photos.length = 0;
    model.script = async (tools) => {
      const result = (await tools.consultarEstoqueProduto({ termoBusca: "Radda", tipoBusca: "marca_ampla" })) as { fichaFormatada?: string; vitrineFormatada?: string };
      return { reply: `${result.fichaFormatada ?? result.vitrineFormatada}\n---SPLIT---\nGostaria de reservar essa peça?`, action: "reply" };
    };
    history.push({ from: "customer", text: "ata, deixa eu ver esse primeiro" });
    const turn3 = await simulateAgent(settings, history, "user-1", undefined, { sessionId: "sessao-radda", knownCity: "Goiânia" });
    expect(calls.stock.at(-1)).toMatchObject({ termoBusca: "Radda JC60020", tipoBusca: "modelo_especifico" });
    expect(turn3.image?.sku).toBe("145145");
    expect(turn3.messages[0]).toContain("Radda | Ref. JC60020");
    expect(turn3.messages[0]).toContain("📍 *Loja Setor Marista*");
    expect(turn3.messages[0]).not.toMatch(/^\d\. /m);

    // Mesmo pedido, mas o modelo nem chama a ferramenta: o backend abre a ficha do 1º mesmo assim.
    calls.photos.length = 0;
    model.script = async () => ({ reply: "Qual modelo você quer ver?", action: "reply" });
    const fallback = await simulateAgent(settings, history, "user-1", undefined, { sessionId: "sessao-radda", knownCity: "Goiânia" });
    expect(fallback.messages[0]).toContain("Radda | Ref. JC60020");
    expect(fallback.image?.sku).toBe("145145");
  });
});

describe("vitrine como Lista Interativa nativa do WhatsApp", () => {
  it("\"Vocês têm Prada Linea Rossa?\" → lista com botão Ver modelos; toque em PS 07RV → foto + ficha + lojas", async () => {
    const { readContent } = await import("@/lib/chat/inbound-content");
    model.script = async (tools) => {
      const result = (await tools.consultarEstoqueProduto({ termoBusca: "Prada Linea Rossa", tipoBusca: "marca_ampla" })) as { vitrineFormatada: string };
      return { reply: `${result.vitrineFormatada}\n---SPLIT---\nQual desses te interessou?`, action: "reply" };
    };
    const history: PlaygroundMessage[] = [{ from: "customer", text: "Vocês têm Prada Linea Rossa?" }];
    const turn1 = await simulateAgent(settings, history, "user-1", undefined, { sessionId: "sessao-lista", knownCity: "Goiânia" });
    expect(turn1.interactiveList).toMatchObject({ buttonText: "Ver modelos", sectionTitle: "Modelos em estoque" });
    expect(turn1.interactiveList?.rows.map((row) => row.id)).toEqual(["product_select:PS 07RV", "product_select:PS 02WV"]);
    expect(turn1.interactiveList?.rows[0]).toMatchObject({ title: "Ref. PS 07RV", description: "Prada Linea Rossa • R$ 1.960,00" });
    history.push(...turn1.messages.map((text): PlaygroundMessage => ({ from: "ai", text })));

    // Webhook: list_reply com o id do modelo → mensagem legível + referência escolhida.
    const tapped = readContent({ type: "interactive", interactive: { type: "list_reply", list_reply: { id: "product_select:PS 07RV", title: "Ref. PS 07RV", description: "Prada Linea Rossa • R$ 1.960,00" } } });
    expect(tapped).toEqual({ text: "Quero ver o modelo: Prada Linea Rossa (Ref. PS 07RV)", media: null, selectedProductRef: "PS 07RV" });

    // Turno 2: mesmo com o modelo pedindo a marca de novo, a escolha abre o PS 07RV específico.
    calls.photos.length = 0;
    model.script = async (tools) => {
      const result = (await tools.consultarEstoqueProduto({ termoBusca: "Prada", tipoBusca: "marca_ampla" })) as { fichaFormatada?: string; vitrineFormatada?: string };
      return { reply: `${result.fichaFormatada ?? result.vitrineFormatada}\n---SPLIT---\nGostaria de reservar essa peça?`, action: "reply" };
    };
    history.push({ from: "customer", text: tapped.text, selectedProductRef: tapped.selectedProductRef });
    const turn2 = await simulateAgent(settings, history, "user-1", undefined, { sessionId: "sessao-lista", knownCity: "Goiânia" });
    expect(calls.stock.at(-1)).toMatchObject({ tipoBusca: "modelo_especifico" });
    expect(String(calls.stock.at(-1)?.termoBusca)).toContain("PS 07RV");
    expect(turn2.image?.sku).toBe("900701");
    expect(turn2.messages[0]).toContain("Ref. PS 07RV");
    expect(turn2.messages[0]).toContain("📍 *Loja Jardim Goiás* - Goiânia (Av. Deputado Jamel Cecilio, 3300) — 2 unidades");
    expect(turn2.interactiveList).toBeUndefined();
  });
});

describe("foto de óculos: cascata referência → marca/linha e pergunta informativa sem transbordo", () => {
  const PHOTO = { name: "oculos.jpg", mime: "image/jpeg", data: new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70, 73, 70]) };
  it("foto de Prada Linea Rossa sem a ref exata → identifica, avisa e mostra os modelos da linha; \"Qual o nome desse modelo?\" responde sem transferir", async () => {
    model.vision = { kind: "produto", marca: "Prada", linha: "Linea Rossa", modeloOuReferenciaProvavel: "PS 05YS", caracteristicasVisuais: { tipo: "Óculos de sol", formato: "Retangular", cor: "Preto fosco" } };
    // A IA recebe os fatos (modelo identificado, indisponível na cidade, outras opções da linha) e escreve com as
    // próprias palavras; a vitrine real da linha é anexada pelo sistema depois do comentário dela.
    model.script = async () => ({ reply: "Esse aí é um Prada Linea Rossa! Ele não está em Goiânia agora, mas olha outras da mesma linha:", action: "reply" });
    const history: PlaygroundMessage[] = [{ from: "customer", text: "" }];
    const turn1 = await simulateAgent(settings, history, "user-1", PHOTO, { sessionId: "sessao-foto", knownCity: "Goiânia" });
    expect(turn1.action).toBe("reply");
    expect(turn1.messages).toHaveLength(1);
    expect(calls.prompts.at(-1)).toContain("mas esse modelo não está disponível em Goiânia");
    expect(turn1.messages[0]).toMatch(/^Esse aí é um Prada Linea Rossa! Ele não está em Goiânia agora, mas olha outras da mesma linha:\s+1\. /);
    expect(calls.stock.at(-1)).toMatchObject({ termoBusca: "Prada Linea Rossa", tipoBusca: "marca_ampla" });
    expect(turn1.interactiveList?.rows.map((row) => row.id)).toEqual(["product_select:PS 07RV", "product_select:PS 02WV"]);
    expect(turn1.imageAnalysis).toMatchObject({ marca: "Prada", linha: "Linea Rossa", modeloProvavel: "PS 05YS", tipo: "Óculos de sol" });
    expect(calls.prompts.at(-1)).toContain("ANÁLISE DA ÚLTIMA FOTO DE PRODUTO DO CLIENTE");

    // Turno 2: a análise fica na mensagem da foto (sessão); o modelo tenta transferir e o código responde.
    history[0] = { ...history[0], imageAnalysis: turn1.imageAnalysis };
    history.push(...turn1.messages.map((text): PlaygroundMessage => ({ from: "ai", text })));
    history.push({ from: "customer", text: "Qual o nome desse modelo?" });
    model.script = async () => ({ reply: "Vou te passar para um dos nossos atendentes, só um instante! 😊", action: "handoff", reason: "Cliente quer saber o nome do modelo" });
    const turn2 = await simulateAgent(settings, history, "user-1", undefined, { sessionId: "sessao-foto", knownCity: "Goiânia" });
    expect(turn2.action).toBe("reply");
    expect(turn2.handoffQueue).toBe("");
    expect(turn2.messages[0]).toContain("Esse modelo é um *Prada Linea Rossa*");
    expect(turn2.messages.join("\n")).not.toMatch(/atendente/i);
    expect(calls.prompts.at(-1)).toContain("Referência provável: PS 05YS");
  });

  it("referência legível e em estoque → ficha completa do modelo exato (sem vitrine)", async () => {
    model.vision = { kind: "produto", marca: "Prada", linha: "Linea Rossa", modeloOuReferenciaProvavel: "0PS 07RV", caracteristicasVisuais: { tipo: "Armação de grau" } };
    model.script = async () => ({ reply: "Temos sim!", action: "reply" });
    const turn = await simulateAgent(settings, [{ from: "customer", text: "Tem esse?" }], "user-1", PHOTO, { sessionId: "sessao-ref" });
    expect(calls.stock.at(-1)).toMatchObject({ termoBusca: "Prada 0PS 07RV", tipoBusca: "modelo_especifico" });
    expect(turn.messages[0]).toContain("Ref. PS 07RV");
    expect(turn.image?.sku).toBe("900701");
    expect(turn.interactiveList).toBeUndefined();
  });
});

describe("cliente pede um atendente pelo nome", () => {
  it("Vivi: \"Oi\" → saudação; \"Leandro\" → não vira o nome dela, confirma e transfere para o Leandro", async () => {
    model.script = async () => ({ reply: "Boa noite, Vivi! 😊 Em que posso te ajudar?", action: "reply" });
    const history: PlaygroundMessage[] = [{ from: "customer", text: "Oi" }];
    const turn1 = await simulateAgent(settings, history, "user-1", undefined, { sessionId: "sessao-vivi", contactName: "Vivi" });
    expect(turn1.messages[0]).toMatch(/^(Bom dia|Boa tarde|Boa noite), Vivi! 😊 Em que posso te ajudar\?$/);
    history.push({ from: "ai", text: turn1.messages[0] }, { from: "customer", text: "Leandro" });

    // O código decide a transferência para o Leandro (não vira o nome dela), mas quem escreve a confirmação é o LLM,
    // com o fato no prompt; nenhuma frase pronta.
    model.script = async () => ({ reply: "Claro, Vivi! Já te passo pro Leandro, ele te responde por aqui.", action: "reply" });
    const prompts = calls.prompts.length;
    const turn2 = await simulateAgent({ ...settings, handoffMessage: "" }, history, "user-1", undefined, { sessionId: "sessao-vivi", contactName: "Vivi" });
    expect(calls.prompts.length).toBe(prompts + 1);
    expect(calls.prompts.at(-1)).toContain("PEDIDO DE PESSOA ESPECÍFICA: o cliente pediu para falar com Leandro Martins");
    expect(turn2).toMatchObject({ action: "handoff", trigger: "staff", reason: "Cliente solicitou atendimento direto com Leandro Martins.", assignee: "Leandro Martins" });
    expect(turn2.messages).toEqual(["Claro, Vivi! Já te passo pro Leandro, ele te responde por aqui."]);
  });

  it("\"Preciso falar com Leandro\" → confirmação ao cliente antes da fila (nunca transferência silenciosa)", async () => {
    model.script = async () => ({ reply: "", action: "handoff", reason: "Cliente pediu o Leandro" });
    const turn = await simulateAgent({ ...settings, handoffMessage: "" }, [{ from: "customer", text: "Preciso falar com Leandro" }], "user-1", undefined, { sessionId: "sessao-leandro", contactName: "Vivi" });
    expect(turn.action).toBe("handoff");
    // Resposta vazia do modelo: só aí entra a confirmação padrão (nunca transferência silenciosa).
    expect(turn.messages[0]).toMatch(/^Claro, Vivi! Vou te transferir/);
  });

  it("transferência decidida pela IA sem texto e sem mensagem configurada: aviso padrão em vez de silêncio", async () => {
    model.script = async () => ({ reply: "", action: "handoff", reason: "Reclamação" });
    const turn = await simulateAgent({ ...settings, handoffMessage: "" }, [{ from: "customer", text: "Meu óculos quebrou e estou muito chateada" }], "user-1", undefined, { sessionId: "sessao-silencio", contactName: "Vivi" });
    expect(turn.action).toBe("handoff");
    expect(turn.messages).toEqual(["Claro, Vivi! Vou te transferir agora mesmo para um dos nossos atendentes. Só um instante! 😊"]);
  });
});
