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
const model = vi.hoisted(() => ({ script: null as null | ((tools: Record<string, Tool["run"]>) => Promise<Record<string, unknown>>) }));

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
vi.mock("@/lib/ai/catalog-db", () => ({ catalogProducts: vi.fn(async () => []), searchErpCatalog: vi.fn() }));
vi.mock("@/lib/ai/product-image-db", () => ({
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
});

describe("isolamento de sessão", () => {
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
    const turn1 = await simulateAgent(settings, history, "user-1", undefined, { sessionId: "sessao-rb3025" });
    expect(turn1.image?.sku).toBe(AVIATOR.codigo);
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

    // Turno 3b: o modelo nem chama a ferramenta e lista 4 lojas → o backend envia a localização fixada mesmo assim.
    model.script = async () => ({ reply: "Temos 4 lojas no Setor Marista:\n• Rua 9, 2106\n• Rua 9, 1855\n• Rua 27, 2106\n• Rua 135, 208\nQual delas?", action: "reply" });
    const fallback = await simulateAgent(settings, ask, "user-1", undefined, { sessionId: "sessao-rb3025" });
    expect(fallback.location?.endereco).toBe("Rua 9, 2106");
    expect(fallback.messages.join("\n")).not.toContain("1855");
    expect(fallback.messages[0]).toContain("Loja Setor Marista");
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
    // Modelo responde "não identifiquei" sem chamar a ferramenta: o backend resolve e envia mesmo assim.
    model.script = async () => ({ reply: "Não identifiquei essa unidade no cadastro. Pode me dizer o bairro?", action: "reply" });
    const fallback = await simulateAgent(settings, history, "user-1", undefined, { sessionId: "sessao-prada" });
    expect(fallback.location?.endereco).toBe("Av. Deputado Jamel Cecilio, 3300");
    expect(fallback.messages.join("\n")).not.toMatch(/não identifiquei/i);
  });
});

describe("vitrine Radda sem loop: \"tem radda?\" → \"esse de 120\" → \"esse primeiro\"", () => {
  it("lista numerada, pergunta número/referência no preço repetido e abre o 1º com foto e ficha", async () => {
    // Turno 1: busca ampla → vitrine numerada com referências reais (o item sem REF vai para o fim, com a ref. do cadastro).
    model.script = async (tools) => {
      const result = (await tools.consultarEstoqueProduto({ termoBusca: "Radda", tipoBusca: "marca_ampla" })) as { vitrineFormatada: string };
      return { reply: `${result.vitrineFormatada}\n---SPLIT---\nGostaria de ver a foto, lojas disponíveis e mais detalhes de algum desses modelos?`, action: "reply" };
    };
    const history: PlaygroundMessage[] = [{ from: "customer", text: "ta, tem radda?" }];
    const turn1 = await simulateAgent(settings, history, "user-1", undefined, { sessionId: "sessao-radda" });
    expect(turn1.messages[0]).toContain("1. 👓 *Radda (Ref. JC60020)* — R$ 120,00");
    expect(turn1.messages[0]).toContain("4. 👓 *Radda (Ref. OPBR 455)* — R$ 120,00");
    expect(turn1.messages[0]).not.toMatch(/\*Radda\* —/);
    history.push(...turn1.messages.map((text): PlaygroundMessage => ({ from: "ai", text })));

    // Turno 2: "esse de 120" com 4 itens a R$ 120 → o modelo tenta a busca ampla de novo; nada de vitrine repetida.
    const searchesBefore = calls.stock.length;
    model.script = async (tools) => {
      const again = (await tools.consultarEstoqueProduto({ termoBusca: "Radda", tipoBusca: "marca_ampla" })) as { vitrineFormatada?: string };
      return { reply: again.vitrineFormatada ?? turn1.messages[0], action: "reply" };
    };
    history.push({ from: "customer", text: "deixa eu ver esse de 120 ai" });
    const turn2 = await simulateAgent(settings, history, "user-1", undefined, { sessionId: "sessao-radda" });
    expect(calls.stock.length).toBe(searchesBefore);
    expect(turn2.messages.join("\n")).toBe("Vários desses modelos Radda estão por R$ 120,00! Qual número ou referência você quer ver primeiro? (ex.: o 1 - Ref. JC60020, ou o 2 - Ref. JC2501)");
    expect(turn2.image).toBeUndefined();
    history.push(...turn2.messages.map((text): PlaygroundMessage => ({ from: "ai", text })));

    // Turno 3: "esse primeiro" → o modelo insiste na marca, o backend força JC60020 específico: foto + ficha + lojas.
    calls.photos.length = 0;
    model.script = async (tools) => {
      const result = (await tools.consultarEstoqueProduto({ termoBusca: "Radda", tipoBusca: "marca_ampla" })) as { fichaFormatada?: string; vitrineFormatada?: string };
      return { reply: `${result.fichaFormatada ?? result.vitrineFormatada}\n---SPLIT---\nGostaria de reservar essa peça?`, action: "reply" };
    };
    history.push({ from: "customer", text: "ata, deixa eu ver esse primeiro" });
    const turn3 = await simulateAgent(settings, history, "user-1", undefined, { sessionId: "sessao-radda" });
    expect(calls.stock.at(-1)).toMatchObject({ termoBusca: "Radda JC60020", tipoBusca: "modelo_especifico" });
    expect(turn3.image?.sku).toBe("145145");
    expect(turn3.messages[0]).toContain("Radda | Ref. JC60020");
    expect(turn3.messages[0]).toContain("📍 *Loja Setor Marista*");
    expect(turn3.messages[0]).not.toMatch(/^\d\. /m);

    // Mesmo pedido, mas o modelo nem chama a ferramenta: o backend abre a ficha do 1º mesmo assim.
    calls.photos.length = 0;
    model.script = async () => ({ reply: "Qual modelo você quer ver?", action: "reply" });
    const fallback = await simulateAgent(settings, history, "user-1", undefined, { sessionId: "sessao-radda" });
    expect(fallback.messages[0]).toContain("Radda | Ref. JC60020");
    expect(fallback.image?.sku).toBe("145145");
  });
});
