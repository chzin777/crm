import { sanitizeAiResponse } from "@/lib/ai/sanitize";
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
  RAYBAN: [1, 2, 3, 4, 5].map((n) => ({ code: `r${n}`, description: `OCS RAY BAN REF RB910${n} 55`, brand: "RAY BAN", unit: "36" })),
} as Record<string, { code: string; description: string; brand: string; unit: string }[]>));

const calls = vi.hoisted(() => ({ stock: [] as Record<string, unknown>[], prompts: [] as string[], roles: [] as string[][] }));
const photos = vi.hoisted(() => ({ byCode: {} as Record<string, string> }));
type Tool = { definition: { function: { name: string } }; run: (args: Record<string, unknown>) => Promise<unknown> };
const model = vi.hoisted(() => ({ script: null as null | ((tools: Record<string, Tool["run"]>) => Promise<Record<string, unknown>>) }));
// Skills do teste: null = padrão do motor (todas as nativas ligadas, sem banco).
const skillState = vi.hoisted(() => ({ list: null as null | import("@/lib/ai/studio").AiSkill[] }));
vi.mock("@/lib/ai/studio-db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/studio-db")>();
  return { ...actual, loadSkills: vi.fn(async () => skillState.list ?? actual.loadSkills()) };
});

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
vi.mock("@/lib/ai/product-image-db", () => ({ catalogImages: vi.fn(async () => photos.byCode), imageSearchStatus: () => false, invalidateProductImage: vi.fn(), searchAndCacheProductImage: vi.fn(async () => null) }));
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
    calls.roles.push(messages.map((message) => message.role));
    const tools = Object.fromEntries((meta.tools ?? []).map((tool) => [tool.definition.function.name, tool.run]));
    return model.script ? model.script(tools) : { reply: "Certo!", action: "reply" };
  }),
}));

import { SEED_MODULES, composeSystemPrompt, selectPromptModules } from "./helpers/prompt-seed";
import { simulateAgent, type PlaygroundMessage } from "@/lib/ai/agent";
import { loadPromptModules } from "@/lib/ai/prompt-modules-db";
import { DEFAULT_AI_SETTINGS } from "@/lib/ai/settings";
import { brandFallbackReply, brandSearchArgs, equivalentBrands } from "@/lib/ai/catalog-search";
import { extractPreferredCity, updateCatalogContext, EMPTY_CATALOG_CONTEXT } from "@/lib/ai/catalog-context";
import { singleEmoji } from "@/lib/ai/response-opening";
import { resolveListedChoice } from "@/lib/ai/showcase-choice";
import { loadPromptModule, PROMPT_MODULES } from "./helpers/prompt-seed";
import { catalogImages } from "@/lib/ai/product-image-db";
import { applySkillsToSettings, DEFAULT_SKILLS, mergePhotoSkillMarkdown, PHOTO_SKILL, PHOTO_SKILL_SECTIONS, photoSkillConfig, type AiSkill } from "@/lib/ai/studio";

const settings = { ...DEFAULT_AI_SETTINGS, sendProductImage: false, canQuotePrices: true, useStores: false, useOperatingHours: false, topics: [], aiChoosesQueue: false, maxAiReplies: 20, closeWhenResolved: false };
const GREETING_START = /^\s*(bom dia|boa tarde|boa noite|oi|olá)\b/i;

beforeEach(() => {
  calls.stock.length = 0;
  calls.prompts.length = 0;
  model.script = null;
  photos.byCode = {};
  skillState.list = null;
});

describe("higiene dos módulos de prompt (seed do banco, editável em /ia)", () => {
  it("todos os módulos esperados existem e não estão vazios", () => {
    for (const name of PROMPT_MODULES) expect(loadPromptModule(name).length).toBeGreaterThan(50);
  });

  it.each(PROMPT_MODULES)("%s não contém nome próprio real (só o marcador <PRIMEIRO_NOME>)", (name) => {
    const text = loadPromptModule(name);
    const names = ["Michel", "Christofer", "Cristofer", "Ana", "João", "Joao", "Maria", "José", "Jose", "Pedro", "Paulo", "Carlos", "Lucas", "Leandro", "Vivi", "Juliana", "Fernanda", "Mariana", "Gabriel", "Rafael", "Bruno", "Marcos", "Patrícia", "Camila", "Amanda"];
    for (const name of names) expect(text).not.toMatch(new RegExp(`(?<![\p{L}])${name}(?![\p{L}])`, "u"));
  });
});

describe("composeSystemPrompt carrega só os módulos do estágio/intenção", () => {
  it("primeiro turno traz saudação; turno já saudado não traz saudacao.md e proíbe repetir", () => {
    expect(selectPromptModules({ hasGreetedInSession: false, text: "boa tarde, tudo bem ?" })).toEqual(["core", "saudacao"]);
    const later = composeSystemPrompt({ hasGreetedInSession: true, text: "estou procurando armações miu miu", activeBrand: "Miu Miu" });
    expect(later).not.toContain(loadPromptModule("saudacao").split("{{")[0]);
    expect(later).toContain("SEM SAUDAÇÃO REPETIDA");
    expect(later).toContain("não comece a resposta com bom dia, boa tarde, boa noite, oi ou olá");
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
    expect(t1.prompt).toContain(loadPromptModule("saudacao").split("{{")[0]);
    expect(t1.stock).toHaveLength(0);

    // 2) Marca pedida: salva activeBrand, pede a cidade e não repete "Boa tarde" (mesmo se o modelo tentar).
    const t2 = await turn("estou procurando armações miu miu", async () => ({ reply: "Boa tarde! Miu Miu tem armações lindas. De qual cidade você fala?", action: "reply" }));
    expect(t2.result.catalogContext).toMatchObject({ activeBrand: "Miu Miu", category: "ARMACAO", preferredCity: "" });
    expect(t2.result.reply).not.toMatch(GREETING_START);
    expect(t2.result.reply).not.toMatch(/boa tarde/i);
    expect(t2.result.reply).toMatch(/cidade/i);
    expect(t2.prompt).not.toContain(loadPromptModule("saudacao").split("{{")[0]);
    expect(t2.prompt).toContain("QUALIFICAÇÃO");
    expect(t2.stock).toHaveLength(0);

    // 3) Estilo: o modelo tenta "modelo específico"; vira vitrine da marca, barrada sem cidade → pede a cidade.
    const t3 = await turn("mais presença no rosto", async (tools) => {
      await tools.consultarEstoqueProduto({ termoBusca: "Miu Miu mais presença", tipoBusca: "modelo_especifico" });
      return { reply: "Boa tarde! Ótima escolha de estilo. Em qual cidade você está?", action: "reply" };
    });
    expect(t3.result.catalogContext?.activeBrand).toBe("Miu Miu");
    expect(t3.stock).toHaveLength(0);
    expect(t3.result.reply).not.toMatch(/boa tarde/i);
    expect(t3.result.reply).not.toMatch(/Não encontrei/i);
    expect(t3.result.reply).toMatch(/cidade/i);

    // 4) Goiânia: busca a marca na cidade; sem saldo → transferência de Brasília + alternativas locais na mesma resposta.
    const t4 = await turn("eu falo de Goiânia", async () => ({ reply: "Boa tarde! Em Goiânia a Miu Miu está sem saldo agora, mas tem em Brasília e dá pra pedir a transferência pra cá. Enquanto isso, olha estas que têm a mesma pegada:", action: "reply" }));
    // Os fatos da marca sem saldo (outras praças + alternativas locais) chegam ao modelo no mesmo payload.
    expect(t4.prompt).toContain("\"disponivelEmOutrasCidades\":[\"Brasília\"]");
    expect(t4.prompt).toContain("alternativasNaCidade");
    expect(t4.stock[0]).toMatchObject({ marca: "Miu Miu", cidade: "Goiânia", tipoBusca: "marca_ampla" });
    expect(t4.stock).toEqual(expect.arrayContaining([expect.objectContaining({ marca: "Miu Miu", cidade: "Brasília" }), expect.objectContaining({ marca: "Prada", cidade: "Goiânia" })]));
    expect(t4.stock.some((args) => args.tipoBusca === "modelo_especifico")).toBe(false);
    expect(t4.result.reply).toContain("Brasília");
    expect(t4.result.reply).toMatch(/transferência/i);
    expect(t4.result.reply).toMatch(/prada/i);
    // No máximo 3 alternativas reais na cidade do cliente.
    expect(t4.result.catalogContext?.lastShownProducts?.length ?? 0).toBeLessThanOrEqual(3);
    expect(t4.result.reply).not.toMatch(/Não encontrei/i);
    expect(t4.result.reply).not.toMatch(/boa tarde/i);
    expect(t4.result.interactiveList?.rows.length).toBeGreaterThanOrEqual(2);
    expect(t4.result.catalogContext).toMatchObject({ activeBrand: "Miu Miu", preferredCity: "Goiânia" });

    // 5) Brasília: busca a marca em Brasília na hora e mostra os modelos reais.
    const t5 = await turn("Brasilia tem ?", async () => ({ reply: "Tem sim! Separei as Miu Miu de Brasília:", action: "reply" }));
    expect(t5.stock[0]).toMatchObject({ marca: "Miu Miu", cidade: "Brasília", tipoBusca: "marca_ampla" });
    // Modelos reais de Brasília, sem código "Ref." na mensagem: a ordem fica em lastShownProducts.
    expect(t5.result.reply).not.toMatch(/Ref./);
    expect(t5.result.catalogContext?.lastShownProducts?.map((item) => item.ref)).toEqual(["MU01", "MU05"]);
    expect(t5.result.reply).not.toMatch(/boa tarde/i);
    expect(t5.result.catalogContext).toMatchObject({ activeBrand: "Miu Miu", preferredCity: "Brasília" });
  });
});

describe("emoji único e sem clichê de fechamento", () => {
  it("mantém só o primeiro emoji de expressão da resposta", () => {
    expect(singleEmoji("Boa tarde! 😊 Tudo ótimo por aqui, e com você? 😊")).toBe("Boa tarde! 😊 Tudo ótimo por aqui, e com você?");
    expect(singleEmoji("Boa tarde! 😊 Tudo certo, e com você? 😉 Me conta o que procura!")).toBe("Boa tarde! 😊 Tudo certo, e com você? Me conta o que procura!");
    expect(singleEmoji("Separei estas 😍\n1. 👓 *Prada (Ref. PR12)*\n2. 👓 *Vogue (Ref. VO5300)*\n---SPLIT---\nQual curtiu mais? 😊")).toBe("Separei estas 😍\n1. 👓 *Prada (Ref. PR12)*\n2. 👓 *Vogue (Ref. VO5300)*\n---SPLIT---\nQual curtiu mais?");
    expect(singleEmoji("Tudo certo! 😊")).toBe("Tudo certo! 😊");
  });

  it("saudacao.md e core.md não trazem o clichê \"Como posso te ajudar?\"", () => {
    for (const name of ["saudacao", "core"] as const) expect(loadPromptModule(name)).not.toContain("Como posso te ajudar?");
  });

  it("o agente entrega a saudação com 1 emoji só, mesmo se o modelo repetir", async () => {
    model.script = async () => ({ reply: "Boa tarde! 😊 Tudo ótimo por aqui, e com você? 😊 Me conta o que você está procurando hoje!", action: "reply" });
    const run = await simulateAgent(settings, [{ from: "customer", text: "boa tarde, tudo bem ?" }], "user-1", undefined, { contactName: "5562999998888" });
    expect(run.reply.match(/😊/g)).toHaveLength(1);
    expect(run.reply).not.toMatch(/ {2}/);
  });
});

describe("catálogo visual: foto + legenda curta, sem Ref.", () => {
  const photoSettings = { ...settings, sendProductImage: true };

  it("óculos de sol em Goiânia com fotos: no máximo 3 itens com imageUrl e legenda \"Nome — R$ Preço\" + lojas, sem Ref.", async () => {
    photos.byCode = Object.fromEntries([1, 2, 3, 4, 5].map((n) => [`r${n}`, `https://img.test/r${n}.jpg`]));
    const opening = "Separei umas de sol que vão bem no dia a dia, leves e clássicas 👇";
    const closing = "Alguma delas chamou sua atenção?";
    model.script = async () => ({ reply: `${opening}\n---SPLIT---\n${closing}`, action: "reply" });
    const run = await simulateAgent(photoSettings, [{ from: "customer", text: "quero óculos de sol ray-ban" }], "user-1", undefined, { contactName: "5562999998888", knownCity: "Goiânia" });
    expect(calls.stock[0]).toMatchObject({ marca: "Ray-Ban", cidade: "Goiânia", tipoBusca: "marca_ampla" });
    // O modelo soube das fotos antes de escrever (fato da busca no prompt).
    expect(calls.prompts.at(-1)).toContain("\"fotosNoCatalogo\":3");
    const catalog = run.visualCatalog!;
    expect(catalog.items).toHaveLength(3);
    expect(catalog.items.map((item) => item.imageUrl)).toEqual(["https://img.test/r1.jpg", "https://img.test/r2.jpg", "https://img.test/r3.jpg"]);
    for (const [position, item] of catalog.items.entries()) {
      expect(item.caption.startsWith(`${position + 1}. `)).toBe(true);
      // Modelo real (marca + referência legível) e tipo, sem traço e sem bloco fixo de lojas em toda legenda.
      expect(item.caption).toMatch(/^\d\. Ray-Ban RB910\d, óculos de sol, R\$ 999,00$/);
      expect(item.caption).not.toMatch(/Ref\.|Lojas? em|[—–]/);
    }
    // Abertura e pergunta são as do modelo (nada fixo do código); as legendas são dados do sistema.
    expect(catalog.opening).toBe(opening);
    expect(catalog.closing).toBe(closing);
    // O que o cliente recebe (e o /ia mostra): comentário, 1 legenda por foto, pergunta do modelo.
    expect(run.messages).toEqual([catalog.opening, ...catalog.items.map((item) => item.caption), catalog.closing].map(sanitizeAiResponse));
    expect(run.messages.join(" ")).not.toMatch(/[–—]/);
    expect(run.interactiveList).toBeUndefined();
    expect(run.catalogContext?.lastShownProducts).toEqual(catalog.items.map((item) => ({ index: item.index, id: item.sku, ref: item.ref, name: item.name, price: 999, stores: ["Setor Marista"] })));

    // "gostei da segunda": resolve o 2º item de lastShownProducts e abre a busca específica dele (com a ref interna).
    const second = run.catalogContext!.lastShownProducts![1];
    model.script = async () => ({ reply: "Ótima escolha!", action: "reply" });
    await simulateAgent(photoSettings, [
      { from: "customer", text: "quero óculos de sol ray-ban" },
      ...run.messages.map((text, index): PlaygroundMessage => ({ from: "ai", text, ...(index === 0 ? { catalogContext: run.catalogContext } : {}) })),
      { from: "customer", text: "gostei da segunda" },
    ], "user-1", undefined, { contactName: "5562999998888", knownCity: "Goiânia" });
    expect(calls.stock.at(-1)).toMatchObject({ tipoBusca: "modelo_especifico" });
    expect(String(calls.stock.at(-1)?.termoBusca)).toContain(second.ref ?? "");
  });

  it("\"gostei da segunda\" / \"2ª foto\" / \"esse primeiro\" resolvem o item indexado", () => {
    const listed = [1, 2, 3].map((index) => ({ index, sku: `s${index}`, referencia: `RB910${index}`, nomeComercial: `Ray-Ban ${index}`, preco: 999 }));
    expect(resolveListedChoice("gostei da segunda", listed)).toEqual({ type: "item", item: listed[1] });
    expect(resolveListedChoice("gostei da 2ª foto", listed)).toEqual({ type: "item", item: listed[1] });
    expect(resolveListedChoice("quero esse primeiro", listed)).toEqual({ type: "item", item: listed[0] });
  });

  it("sem nenhuma foto: vitrine em texto limpo, sem Ref.; o modelo sabe antes que não há fotos", async () => {
    model.script = async () => ({ reply: "Separei umas opções de sol pra você (as fotos não estão no sistema agora):", action: "reply" });
    const run = await simulateAgent(photoSettings, [{ from: "customer", text: "quero óculos de sol ray-ban" }], "user-1", undefined, { contactName: "5562999998888", knownCity: "Goiânia" });
    expect(run.visualCatalog).toBeUndefined();
    const text = run.messages.join("\n");
    expect(text).toMatch(/^1\. .*R\$ 999,00/m);
    expect(text).not.toMatch(/Ref\.|RB910/);
    expect(calls.prompts.at(-1)).toContain("\"fotosNoCatalogo\":0");
    expect(text).toContain("as fotos não estão no sistema agora");
  });
});

describe("conversa livre: typos e variações sempre passam pelo LLM", () => {
  it.each([
    "oii tudo bem?",
    "quero oculos pra minha esposa",
    "pode me indicarw uma armacao bonita?",
    "kkkk sério que vcs tem isso?",
    "vou falar com ela e te retorno",
    "sou de Goiânai",
    "tem miumiu ai?",
    "qual o horario de vcs",
    "nao sei se é de grau ou de sol rs",
  ])("%j → resposta escrita pelo modelo, sem frase pronta do código", async (text) => {
    const sentinel = `LLM respondeu: ${text.length}`;
    model.script = async () => ({ reply: sentinel, action: "reply" });
    const before = calls.prompts.length;
    const run = await simulateAgent(settings, [{ from: "customer", text }], "user-1", undefined, { contactName: "5562999998888" });
    expect(calls.prompts.length).toBe(before + 1);
    expect(run.action).toBe("reply");
    expect(run.messages[0].startsWith(sentinel)).toBe(true);
    expect(run.messages.join("\n")).not.toMatch(/De qual cidade você fala|Você procura óculos de grau ou de sol|Qual desses estilos combinou|esses valores são da armação/);
  });

  it("cidade com erro de digitação vira a cidade real da rede", () => {
    const cities = ["GOIANIA", "ANAPOLIS", "BRASILIA", "APARECIDA DE GOIANIA"];
    expect(extractPreferredCity("sou de Goiânai", cities)).toBe("Goiânia");
    expect(extractPreferredCity("moro em Anapolis", cities)).toBe("Anápolis");
    expect(extractPreferredCity("to em brasila", cities)).toBe("Brasília");
    expect(extractPreferredCity("aparecida de goiana", cities)).toBe("Aparecida de Goiânia");
    expect(extractPreferredCity("quero um óculos do brasil", cities)).toBeNull();
    expect(extractPreferredCity("gostaria de ver armações", cities)).toBeNull();
  });

  it("\"Goiânai\" no meio da conversa: a busca da marca sai em Goiânia", async () => {
    model.script = async () => ({ reply: "Que bom! Olha as que estão aí:", action: "reply" });
    const history: PlaygroundMessage[] = [{ from: "customer", text: "quero óculos de sol ray-ban" }, { from: "ai", text: "Em qual cidade você está?" }, { from: "customer", text: "goiânai" }];
    const run = await simulateAgent(settings, history, "user-1", undefined, { contactName: "5562999998888" });
    expect(run.catalogContext?.preferredCity).toBe("Goiânia");
    expect(calls.stock.at(-1)).toMatchObject({ cidade: "Goiânia", tipoBusca: "marca_ampla" });
    expect(run.messages[0].startsWith("Que bom! Olha as que estão aí:")).toBe(true);
  });
});

describe("Testar IA Agora com todos os módulos desligados", () => {
  it("a chamada à OpenAI vai sem mensagem system (GPT puro + ferramentas) e o resultado mostra 0 módulos", async () => {
    vi.mocked(loadPromptModules).mockResolvedValueOnce(SEED_MODULES.map((module) => ({ ...module, isActive: false })));
    calls.roles.length = 0;
    const result = await simulateAgent(settings, [{ from: "customer", text: "quero ver óculos de sol" }], "user-1");
    expect(calls.roles.at(-1)).toEqual(["user"]);
    expect(result.prompt?.system).toBe("");
    expect(result.prompt?.used).toEqual([]);
  });

  it("com os módulos ativos, o system enviado é o mesmo que o playground mostra", async () => {
    const result = await simulateAgent(settings, [{ from: "customer", text: "quero ver óculos de sol" }], "user-1");
    expect(calls.roles.at(-1)?.[0]).toBe("system");
    expect(calls.prompts.at(-1)).toBe(result.prompt?.system);
    expect(result.prompt?.used.length).toBeGreaterThan(0);
  });
});

describe("skill Envio e Leitura de Fotos (liga/desliga, limite da vitrine e texto no prompt)", () => {
  const photoSettings = { ...settings, sendProductImage: true };
  const withPhotoSkill = (patch: Partial<AiSkill>) => DEFAULT_SKILLS.map((skill, index) => ({ ...skill, id: `s${index}`, ...(skill.slug === PHOTO_SKILL ? patch : {}) }));
  const ask = () => simulateAgent(photoSettings, [{ from: "customer", text: "quero óculos de sol ray-ban" }], "user-1", undefined, { contactName: "5562999998888", knownCity: "Goiânia" });
  const skillModule = { id: "m-fotos", slug: "skill-envio_leitura_fotos", title: "Skill: Envio e Leitura de Fotos", category: "fluxo" as const, contentMarkdown: "### Skill: Envio e Leitura de Fotos\nPROTOCOLO DE FOTOS EDITADO PELA EQUIPE", isActive: true, alwaysInclude: false, keywords: ["@skill_envio_leitura_fotos"], priorityOrder: 245 };

  beforeEach(() => {
    photos.byCode = Object.fromEntries([1, 2, 3, 4, 5].map((n) => [`r${n}`, `https://img.test/r${n}.jpg`]));
    model.script = async () => ({ reply: "Separei umas de sol pra você 👇\n---SPLIT---\nQual curtiu mais?", action: "reply" });
  });

  it("ligada: vitrine sai com fotos (padrão de 3)", async () => {
    skillState.list = withPhotoSkill({ isActive: true });
    const run = await ask();
    expect(run.visualCatalog?.items).toHaveLength(3);
  });

  it("desligada: nenhuma imagem sai, nem vitrine nem foto única, mesmo com sendProductImage ligado nas configurações", async () => {
    skillState.list = withPhotoSkill({ isActive: false });
    vi.mocked(catalogImages).mockClear();
    const run = await ask();
    expect(run.visualCatalog).toBeUndefined();
    expect(run.image).toBeFalsy();
    expect(catalogImages).not.toHaveBeenCalled();
    expect(run.messages.join("\n")).toMatch(/R\$ 999,00/);
  });

  it("respeita o máximo de fotos por vitrine configurado na skill", async () => {
    skillState.list = withPhotoSkill({ isActive: true, config: { maxPhotos: 2, webSearch: true } });
    const run = await ask();
    expect(run.visualCatalog?.items).toHaveLength(2);
    expect(vi.mocked(catalogImages).mock.calls.at(-1)?.[1]).toMatchObject({ want: 2 });
  });

  it("busca na web desligada na skill: só fotos do cache (catalogImages com web: false)", async () => {
    skillState.list = withPhotoSkill({ isActive: true, config: { maxPhotos: 3, webSearch: false } });
    await ask();
    expect(vi.mocked(catalogImages).mock.calls.at(-1)?.[1]).toMatchObject({ web: false });
  });

  it("o Markdown editado da skill entra no prompt quando ligada e sai quando desligada", async () => {
    skillState.list = withPhotoSkill({ isActive: true });
    vi.mocked(loadPromptModules).mockResolvedValueOnce([...SEED_MODULES, skillModule]);
    await ask();
    expect(calls.prompts.at(-1)).toContain("PROTOCOLO DE FOTOS EDITADO PELA EQUIPE");
    skillState.list = withPhotoSkill({ isActive: false });
    vi.mocked(loadPromptModules).mockResolvedValueOnce([...SEED_MODULES, skillModule]);
    await ask();
    expect(calls.prompts.at(-1)).not.toContain("PROTOCOLO DE FOTOS EDITADO PELA EQUIPE");
  });

  it("parâmetros fora do intervalo voltam ao limite; migração preserva o texto ativo dos módulos antigos", () => {
    expect(photoSkillConfig({ maxPhotos: 50 })).toEqual({ maxPhotos: 6, webSearch: true });
    expect(photoSkillConfig({ maxPhotos: 0, webSearch: false })).toEqual({ maxPhotos: 1, webSearch: false });
    expect(photoSkillConfig(null)).toEqual({ maxPhotos: 3, webSearch: true });
    const merged = mergePhotoSkillMarkdown([
      { slug: "legenda-foto", isActive: true, contentMarkdown: "LEGENDA CUSTOM DA EQUIPE" },
      { slug: "anexos", isActive: true, contentMarkdown: "ANEXOS CUSTOM" },
      { slug: "vitrine-estoque", isActive: false, contentMarkdown: "VITRINE DESLIGADA" },
    ]);
    expect(merged).toContain("## 1. Foto do produto confirmado no estoque\nLEGENDA CUSTOM DA EQUIPE");
    expect(merged).toContain("## 4. Anexos recebidos (fotos, áudios e PDFs)\nANEXOS CUSTOM");
    expect(merged).not.toContain("VITRINE DESLIGADA");
    expect(merged).toContain(PHOTO_SKILL_SECTIONS.vitrine);
    expect(merged).toContain(PHOTO_SKILL_SECTIONS.referencia);
    expect(applySkillsToSettings(photoSettings, withPhotoSkill({ isActive: false })).sendProductImage).toBe(false);
    expect(applySkillsToSettings({ ...settings, sendProductImage: false }, withPhotoSkill({ isActive: true })).sendProductImage).toBe(true);
  });
});
