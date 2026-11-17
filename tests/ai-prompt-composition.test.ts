import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoreInfo } from "@/lib/ai/stock";

const STORES = vi.hoisted(() => new Map<string, StoreInfo>([
  ["36", { id: "36", name: "LJ 36", address: "RUA 9", addressNumber: "2106", neighborhood: "SETOR MARISTA", city: "Goiânia", lat: null, lng: null }],
  ["90", { id: "90", name: "LJ 90", address: "SCS QUADRA 2", addressNumber: "1", neighborhood: "ASA SUL", city: "Brasília", lat: null, lng: null }],
]));

// Miu Miu só em Brasília (loja 90); marcas equivalentes com saldo em Goiânia (loja 36), Versace sem nada.
const INVENTORY = vi.hoisted(() => ({
  MIUMIU: [{ code: "m1", description: "ARM MIU MIU REF MU01 52", brand: "MIU MIU", unit: "90" }, { code: "m2", description: "ARM MIU MIU REF MU05 53", brand: "MIU MIU", unit: "90" }],
  PRADA: [{ code: "p1", description: "ARM PRADA REF PR12 52", brand: "PRADA", unit: "36" }],
  DOLCEGABBANA: [{ code: "d1", description: "ARM DOLCE GABBANA REF DG3300 52", brand: "DOLCE & GABBANA", unit: "36" }],
  VERSACE: [] as { code: string; description: string; brand: string; unit: string }[],
  TIFFANY: [{ code: "t1", description: "ARM TIFFANY REF TF2200 52", brand: "TIFFANY", unit: "36" }],
  VOGUE: [{ code: "v1", description: "ARM VOGUE REF VO5300 51", brand: "VOGUE", unit: "36" }],
} as Record<string, { code: string; description: string; brand: string; unit: string }[]>));

const calls = vi.hoisted(() => ({ stock: [] as Record<string, unknown>[], prompts: [] as string[] }));
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
vi.mock("@/lib/ai/staff-db", () => ({ activeStaff: vi.fn(async () => []) }));
vi.mock("@/lib/ai/catalog-db", () => ({ catalogProducts: vi.fn(async () => []), searchErpCatalog: vi.fn() }));
vi.mock("@/lib/ai/product-image-db", () => ({ imageSearchStatus: () => false, invalidateProductImage: vi.fn(), searchAndCacheProductImage: vi.fn(async () => null) }));
vi.mock("@/lib/ai/product-details-db", () => ({
  productSummary: vi.fn(async () => ({ miniDescricao: null, avaliacaoWeb: null, formato: "", acabamento: "", source: "cache" })),
  buscarDetalhesProduto: vi.fn(async () => ({ result: {}, log: { product: "", source: "cache", variations: 0, ms: 1 }, product: null })),
}));
vi.mock("@/lib/ai/stock-db", () => ({
  storeDirectory: vi.fn(async () => STORES),
  erpUnitDirectory: vi.fn(() => new Map<string, string>()),
  clearStoreDirectory: vi.fn(),
  consultarEstoqueProduto: vi.fn(async (args: Record<string, unknown>) => {
    calls.stock.push(args);
    const term = String(args.termoBusca ?? "");
    const brand = String(args.marca ?? "");
    const key = brand.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const items = INVENTORY[key] ?? [];
    const { buildShowcaseResult, showcaseCandidates } = await import("@/lib/ai/stock-showcase");
    const result = buildShowcaseResult({
      term, stores: STORES, withPrices: true, brand: brand.toUpperCase(), city: typeof args.cidade === "string" ? args.cidade : undefined,
      groups: showcaseCandidates(items.map(({ code, description, brand: itemBrand }) => ({ code, description, brand: itemBrand }))),
      lookup: { stockStatus: "ok", fromCache: 0, requested: items.length, byCode: Object.fromEntries(items.map((item) => [item.code, [{ unit: item.unit, name: `LJ ${item.unit}`, qty: 1, price: 999 }]])) },
    });
    return { result, log: { term, region: "", scenario: result.cenario, products: result.modelos.length, stores: 0, ms: 1, cached: false, kind: "marca_ampla" } };
  }),
}));
vi.mock("@/lib/ai/openai", () => ({
  aiConfigured: () => true,
  AiError: class extends Error {},
  transcribeAudio: vi.fn(),
  aiJson: vi.fn(async (messages: { role: string; content: unknown }[], meta: { tools?: Tool[] }) => {
    calls.prompts.push(String(messages[0].content));
    const tools = Object.fromEntries((meta.tools ?? []).map((tool) => [tool.definition.function.name, tool.run]));
    return model.script ? model.script(tools) : { reply: "Certo!", action: "reply" };
  }),
}));

import { composeSystemPrompt, loadPromptModule, PROMPT_MODULES, selectPromptModules } from "@/lib/ai/prompt-composer";
import { simulateAgent, type PlaygroundMessage } from "@/lib/ai/agent";
import { DEFAULT_AI_SETTINGS } from "@/lib/ai/settings";
import { brandFallbackReply, brandSearchArgs, equivalentBrands } from "@/lib/ai/catalog-search";
import { updateCatalogContext, EMPTY_CATALOG_CONTEXT } from "@/lib/ai/catalog-context";

const settings = { ...DEFAULT_AI_SETTINGS, sendProductImage: false, canQuotePrices: true, useStores: false, useOperatingHours: false, topics: [], aiChoosesQueue: false, maxAiReplies: 20, closeWhenResolved: false };
const GREETING_START = /^\s*(bom dia|boa tarde|boa noite|oi|olá)\b/i;

beforeEach(() => {
  calls.stock.length = 0;
  calls.prompts.length = 0;
  model.script = null;
});

describe("higiene dos módulos de prompt (lib/ai/prompts/*.md)", () => {
  const dir = path.join(process.cwd(), "lib", "ai", "prompts");
  const files = readdirSync(dir).filter((file) => file.endsWith(".md"));

  it("todos os módulos esperados existem e não estão vazios", () => {
    expect(files.sort()).toEqual(PROMPT_MODULES.map((name) => `${name}.md`).sort());
    for (const name of PROMPT_MODULES) expect(loadPromptModule(name).length).toBeGreaterThan(50);
  });

  it.each(files)("%s não contém nome próprio real (só o marcador <PRIMEIRO_NOME>)", (file) => {
    const text = readFileSync(path.join(dir, file), "utf8");
    const names = ["Michel", "Christofer", "Cristofer", "Ana", "João", "Joao", "Maria", "José", "Jose", "Pedro", "Paulo", "Carlos", "Lucas", "Leandro", "Vivi", "Juliana", "Fernanda", "Mariana", "Gabriel", "Rafael", "Bruno", "Marcos", "Patrícia", "Camila", "Amanda"];
    for (const name of names) expect(text).not.toMatch(new RegExp(`(?<![\\p{L}])${name}(?![\\p{L}])`, "u"));
  });
});

describe("composeSystemPrompt carrega só os módulos do estágio/intenção", () => {
  it("primeiro turno traz saudação; turno já saudado não traz saudacao.md e proíbe repetir", () => {
    expect(selectPromptModules({ hasGreetedInSession: false, text: "boa tarde, tudo bem ?" })).toEqual(["core", "saudacao"]);
    const later = composeSystemPrompt({ hasGreetedInSession: true, text: "estou procurando armações miu miu", activeBrand: "Miu Miu" });
    expect(later).not.toContain(loadPromptModule("saudacao"));
    expect(later).toContain("SEM SAUDAÇÃO REPETIDA");
    expect(later).toContain('PROIBIDO iniciar a resposta com "Bom dia", "Boa tarde", "Boa noite", "Oi"');
  });

  it("crediário não carrega vitrine nem qualificação", () => {
    const modules = selectPromptModules({ hasGreetedInSession: true, text: "preciso da segunda via do boleto do crediário" });
    expect(modules).toContain("financeiro-crediario");
    expect(modules).not.toContain("vitrine-estoque");
    expect(modules).not.toContain("qualificacao");
    expect(selectPromptModules({ hasGreetedInSession: true, text: "quero saber quanto falta das minhas parcelas" })).not.toContain("vitrine-estoque");
  });

  it("marca sem cidade carrega qualificação + vitrine; com cidade e tipo, só vitrine", () => {
    expect(selectPromptModules({ hasGreetedInSession: true, text: "mais presença no rosto", activeBrand: "Miu Miu", category: "ARMACAO" })).toEqual(["core", "qualificacao", "vitrine-estoque"]);
    expect(selectPromptModules({ hasGreetedInSession: true, text: "Brasilia tem ?", activeBrand: "Miu Miu", category: "ARMACAO", preferredCity: "Brasília" })).toEqual(["core", "vitrine-estoque"]);
  });

  it("receita/lentes e pós-venda carregam os módulos próprios", () => {
    expect(selectPromptModules({ hasGreetedInSession: true, text: "quanto fica a lente multifocal com antirreflexo?" })).toContain("receituario-lentes");
    const support = selectPromptModules({ hasGreetedInSession: true, text: "meu óculos quebrou, tem garantia?" });
    expect(support).toContain("pos-venda-suporte");
    expect(support).not.toContain("financeiro-crediario");
    expect(selectPromptModules({ hasGreetedInSession: true, text: "oi" })).toEqual(["core"]);
  });
});

describe("marca ativa, marca x modelo e alternativas locais (puro)", () => {
  it("activeBrand persiste depois de estilo e cidade", () => {
    let state = updateCatalogContext(EMPTY_CATALOG_CONTEXT, "estou procurando armações miu miu", ["Goiânia", "Brasília"]).context;
    expect(state.activeBrand).toBe("Miu Miu");
    state = updateCatalogContext(state, "mais presença no rosto", ["Goiânia", "Brasília"]).context;
    expect(state.activeBrand).toBe("Miu Miu");
    state = updateCatalogContext(state, "eu falo de Goiânia", ["Goiânia", "Brasília"]).context;
    expect(state).toMatchObject({ activeBrand: "Miu Miu", brand: "Miu Miu", preferredCity: "Goiânia", category: "ARMACAO" });
  });

  it("pedido de marca com estilo vira vitrine da marca, sem modelo específico", () => {
    expect(brandSearchArgs({ termoBusca: "Miu Miu mais presença", tipoBusca: "modelo_especifico", nomeModelo: "presença" }, "Miu Miu", "armação"))
      .toEqual({ termoBusca: "Miu Miu armação", marca: "Miu Miu", tipoBusca: "marca_ampla" });
    expect(equivalentBrands("miu miu")).toEqual(["Prada", "Dolce & Gabbana", "Versace", "Tiffany", "Vogue"]);
  });

  it("resposta de fallback oferece transferência e já lista alternativas locais", () => {
    const reply = brandFallbackReply({ brand: "Miu Miu", city: "Goiânia", otherCities: ["Brasília"], alternativeBrands: ["Prada", "Vogue"], unavailable: false, alternatives: [
      { nomeComercial: "Prada", referencia: "PR12", categoriaModelo: "Armação", precoVenda: "R$ 999,00", totalDisponivelRede: 1, codigos: ["p1"] },
      { nomeComercial: "Vogue", referencia: "VO5300", categoriaModelo: "Armação", precoVenda: "R$ 999,00", totalDisponivelRede: 1, codigos: ["v1"] },
    ] });
    expect(reply).toContain("Brasília");
    expect(reply).toMatch(/transferência/);
    expect(reply).toMatch(/1\. .*Prada/);
    expect(reply).not.toMatch(/Não encontrei/i);
  });
});

describe("fluxo multi-turno: saudação única, marca ativa e cidade", () => {
  it("boa tarde → miu miu → estilo → Goiânia (transferência + alternativas) → Brasília (modelos reais)", async () => {
    const messages: PlaygroundMessage[] = [];
    const turn = async (text: string, script: (tools: Record<string, Tool["run"]>) => Promise<Record<string, unknown>>) => {
      messages.push({ from: "customer", text });
      model.script = script;
      const before = calls.stock.length;
      const result = await simulateAgent(settings, messages, "user-1", undefined, { contactName: "5562999998888" });
      messages.push({ from: "ai", text: result.reply, catalogContext: result.catalogContext });
      return { result, stock: calls.stock.slice(before), prompt: calls.prompts.at(-1) ?? "" };
    };

    // 1) Saúda uma única vez (sem nome: o cadastro é só o telefone).
    const t1 = await turn("boa tarde, tudo bem ?", async () => ({ reply: "Boa tarde! Tudo ótimo por aqui, e com você? 😊 Em que posso te ajudar?", action: "reply" }));
    expect(t1.result.reply).toMatch(/^(Bom dia|Boa tarde|Boa noite)! /);
    expect(t1.result.reply.match(/\b(Bom dia|Boa tarde|Boa noite)\b/g)).toHaveLength(1);
    expect(t1.prompt).toContain(loadPromptModule("saudacao"));
    expect(t1.stock).toHaveLength(0);

    // 2) Marca pedida: salva activeBrand, pede a cidade e não repete "Boa tarde" (mesmo se o modelo tentar).
    const t2 = await turn("estou procurando armações miu miu", async () => ({ reply: "Boa tarde! Miu Miu tem armações lindas. De qual cidade você fala?", action: "reply" }));
    expect(t2.result.catalogContext).toMatchObject({ activeBrand: "Miu Miu", category: "ARMACAO", preferredCity: "" });
    expect(t2.result.reply).not.toMatch(GREETING_START);
    expect(t2.result.reply).not.toMatch(/boa tarde/i);
    expect(t2.result.reply).toMatch(/cidade/i);
    expect(t2.prompt).not.toContain(loadPromptModule("saudacao"));
    expect(t2.prompt).toContain("QUALIFICAÇÃO");
    expect(t2.stock).toHaveLength(0);

    // 3) Estilo: o modelo tenta "modelo específico"; vira vitrine da marca, barrada sem cidade → pede a cidade.
    const t3 = await turn("mais presença no rosto", async (tools) => {
      await tools.consultarEstoqueProduto({ termoBusca: "Miu Miu mais presença", tipoBusca: "modelo_especifico" });
      return { reply: "Boa tarde! Ótima escolha de estilo.", action: "reply" };
    });
    expect(t3.result.catalogContext?.activeBrand).toBe("Miu Miu");
    expect(t3.stock).toHaveLength(0);
    expect(t3.result.reply).not.toMatch(/boa tarde/i);
    expect(t3.result.reply).not.toMatch(/Não encontrei/i);
    expect(t3.result.reply).toMatch(/cidade/i);

    // 4) Goiânia: busca a marca na cidade; sem saldo → transferência de Brasília + alternativas locais na mesma resposta.
    const t4 = await turn("eu falo de Goiânia", async () => ({ reply: "Boa tarde! Vou ver aqui.", action: "reply" }));
    expect(t4.stock[0]).toMatchObject({ marca: "Miu Miu", cidade: "Goiânia", tipoBusca: "marca_ampla" });
    expect(t4.stock).toEqual(expect.arrayContaining([expect.objectContaining({ marca: "Miu Miu", cidade: "Brasília" }), expect.objectContaining({ marca: "Prada", cidade: "Goiânia" })]));
    expect(t4.stock.some((args) => args.tipoBusca === "modelo_especifico")).toBe(false);
    expect(t4.result.reply).toContain("Brasília");
    expect(t4.result.reply).toMatch(/transferência/i);
    expect(t4.result.reply).toMatch(/prada/i);
    expect(t4.result.reply).toMatch(/vogue/i);
    expect(t4.result.reply).not.toMatch(/Não encontrei/i);
    expect(t4.result.reply).not.toMatch(/boa tarde/i);
    expect(t4.result.interactiveList?.rows.length).toBeGreaterThanOrEqual(2);
    expect(t4.result.catalogContext).toMatchObject({ activeBrand: "Miu Miu", preferredCity: "Goiânia" });

    // 5) Brasília: busca a marca em Brasília na hora e mostra os modelos reais.
    const t5 = await turn("Brasilia tem ?", async () => ({ reply: "Tem sim! Separei as Miu Miu de Brasília:", action: "reply" }));
    expect(t5.stock[0]).toMatchObject({ marca: "Miu Miu", cidade: "Brasília", tipoBusca: "marca_ampla" });
    expect(t5.result.reply).toMatch(/MU01/);
    expect(t5.result.reply).toMatch(/MU05/);
    expect(t5.result.reply).not.toMatch(/boa tarde/i);
    expect(t5.result.catalogContext).toMatchObject({ activeBrand: "Miu Miu", preferredCity: "Brasília" });
  });
});
