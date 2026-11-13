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
  ]);
});

// Catálogo: o Aviator pedido e o Justin (modelo que vazava de outra sessão).
const AVIATOR = { codigo: "7858001", produto: "OCS RAY BAN REF 0RB3025 004/78 58", marca: "RAY BAN" };
const JUSTIN = { codigo: "4165001", produto: "OCS RAY BAN REF 0RB4165L 622/8G 55", marca: "RAY BAN" };

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
  clearStoreDirectory: vi.fn(),
  consultarEstoqueProduto: vi.fn(async (args: Record<string, unknown>) => {
    calls.stock.push(args);
    const term = String(args.termoBusca ?? "");
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
import { anchoredStoreMatch, citesAddress, findStores, resolveStoreMatch } from "@/lib/ai/store-location";
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
