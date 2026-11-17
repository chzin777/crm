import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

const calls = vi.hoisted(() => ({ systems: [] as string[], users: [] as unknown[], transcribed: [] as string[], searches: 0, stockQueries: [] as Record<string, unknown>[] }));
const model = vi.hoisted(() => ({
  vision: [] as Record<string, unknown>[],
  pdf: null as Record<string, unknown> | null,
  reply: { reply: "Claro! O Ray-Ban Justin está saindo por R$ 899,00 😊", action: "reply" } as Record<string, unknown>,
  transcript: "oi, quanto custa o ray-ban justin? tem na loja do bueno?",
  transcribeError: null as Error | null,
  stockProducts: [] as Record<string, unknown>[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/minio", () => ({ readFile: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { chatQueue: { findMany: vi.fn(async () => [{ id: "q1", name: "Atendimento Geral" }, { id: "q2", name: "Vendas" }, { id: "q3", name: "Financeiro" }]) } } }));
vi.mock("@/lib/meta-whatsapp", () => ({ sendLocation: vi.fn(), sendTypingIndicator: vi.fn() }));
vi.mock("@/lib/chat/outbound", () => ({ ChatRuleError: class extends Error {}, sendAutomaticImage: vi.fn(), sendAutomaticMessage: vi.fn() }));
vi.mock("@/lib/chat/actions", () => ({ closeConversation: vi.fn() }));
vi.mock("@/lib/chat/nps", () => ({ sendSatisfactionSurvey: vi.fn() }));
vi.mock("@/lib/ai/assist", () => ({ catalog: vi.fn(async () => ""), conversationContext: vi.fn(), sessionStartedAt: vi.fn(async () => null) }));
vi.mock("@/lib/ai/store", () => ({ readAiSettings: vi.fn(), readAiStatus: vi.fn() }));
vi.mock("@/lib/store-pin", () => ({ ensureStorePin: vi.fn(async () => null) }));
vi.mock("@/lib/ai/product-image-db", () => ({ imageSearchStatus: () => false, invalidateProductImage: vi.fn(), searchAndCacheProductImage: vi.fn() }));
vi.mock("@/lib/ai/stock-db", () => ({
  storeDirectory: vi.fn(async () => new Map()), clearStoreDirectory: vi.fn(), erpUnitDirectory: vi.fn(() => new Map()),
  consultarEstoqueProduto: vi.fn(async (query: Record<string, unknown>) => {
    calls.searches += 1;
    calls.stockQueries.push(query);
    const term = String(query.termoBusca);
    const broad = query.tipoBusca === "marca_ampla";
    const result = broad
      ? { tipoBusca: "marca_ampla", cenario: "disponivel_em_lojas", produtos: [], modelos: [], vitrineFormatada: `Temos *${term}* em estoque!`, orientacao: "" }
      : { tipoBusca: "modelo_especifico", cenario: model.stockProducts.length ? "disponivel_em_lojas" : "sem_estoque_na_rede", produtos: model.stockProducts, orientacao: "" };
    return { result, log: { term, region: "", scenario: result.cenario, products: model.stockProducts.length, stores: 1, ms: 1, cached: false } };
  }),
}));
vi.mock("@/lib/ai/product-details-db", () => ({ productSummary: vi.fn(async () => ({ source: "none", avaliacaoWeb: null, miniDescricao: null, formato: null, acabamento: null })), buscarDetalhesProduto: vi.fn() }));
vi.mock("@/lib/ai/catalog-db", () => ({
  catalogProducts: vi.fn(async () => []),
  searchErpCatalog: vi.fn(async (steps: { terms: string[] }[]) => {
    calls.searches += 1;
    const brand = steps[0].terms[0];
    return { term: brand, stock: "ok", results: [{ description: `OCS ${brand} REF 1234`, brand, category: "OCULOS SOLAR", sales: 10, price: 899, stores: ["Loja Setor Bueno"] }] };
  }),
}));
vi.mock("@/lib/ai/openai", async () => {
  const { VISION_PROMPT } = await import("@/lib/ai/catalog-search");
  const { DOCUMENT_EXTRACT_PROMPT } = await import("@/lib/ai/document-extract");
  class AiError extends Error {
    constructor(message: string, public status = 500, public creditExhausted = false) { super(message); }
  }
  return {
    aiConfigured: () => true,
    AiError,
    transcribeAudio: vi.fn(async (audio: { name: string }) => {
      calls.transcribed.push(audio.name);
      if (model.transcribeError) throw model.transcribeError;
      return model.transcript;
    }),
    aiJson: vi.fn(async (messages: { role: string; content: unknown }[]) => {
      const system = String(messages[0].content);
      calls.systems.push(system);
      calls.users.push(messages[1].content);
      if (system === VISION_PROMPT) return model.vision.shift() ?? { kind: "outro" };
      if (system === DOCUMENT_EXTRACT_PROMPT) return model.pdf ?? { kind: "outro" };
      return model.reply;
    }),
  };
});

import { prepareMediaSafe, runAiAgent, type AgentRunInput } from "@/lib/ai/agent";
import { DEFAULT_AI_SETTINGS } from "@/lib/ai/settings";
import { extractSheetText, failedMedia, mediaParts, stickerMedia, type PreparedMedia } from "@/lib/ai/multimodal";
import { mediaFailureReason } from "@/lib/chat/inbound-content";
import { VISION_PROMPT } from "@/lib/ai/catalog-search";

// Produção: handoffOnMedia ligado e a IA escolhendo a fila.
const settings = { ...DEFAULT_AI_SETTINGS, handoffOnMedia: true, aiChoosesQueue: false, useStores: false, useOperatingHours: false, topics: [], canQuotePrices: true, maxAiReplies: 20, closeWhenResolved: false, sendProductImage: false };
const bytes = (text = "x") => new TextEncoder().encode(text);
const image = (name: string) => mediaParts("image", { name, mime: "image/jpeg", data: bytes("jpg") });
const run = (media: PreparedMedia[], extra: Partial<AgentRunInput> = {}) => runAiAgent({
  settings, pendingText: "", hasMedia: true, aiReplies: 1, meta: { feature: "agent", conversationId: "c1" },
  loadMedia: async () => media, buildContext: () => "Cliente: Christofer\nConversa: (anexo)", ...extra,
});
const userText = () => JSON.stringify(calls.users.at(-1));

beforeEach(() => {
  calls.systems.length = 0;
  calls.users.length = 0;
  calls.transcribed.length = 0;
  calls.searches = 0;
  calls.stockQueries.length = 0;
  model.vision = [];
  model.stockProducts = [];
  model.pdf = null;
  model.transcribeError = null;
  model.reply = { reply: "Claro! O Ray-Ban Justin está saindo por R$ 899,00 😊", action: "reply" };
});
afterEach(() => vi.useRealTimers());

describe("roteamento de mídia sem transbordo cego", () => {
  it("áudio com handoffOnMedia ligado: transcreve no Whisper e a IA responde direto", async () => {
    const audio = await prepareMediaSafe({ name: "audio.ogg", mime: "audio/ogg; codecs=opus", data: bytes("ogg") }, { feature: "agent" });
    expect(calls.transcribed).toEqual(["audio.ogg"]);
    const result = await run([audio]);
    expect(result.outcome).toMatchObject({ action: "reply", trigger: "ai" });
    expect(userText()).toContain("quanto custa o ray-ban justin");
  });

  it("figurinha não transfere nem passa pela visão/catálogo", async () => {
    const result = await run([stickerMedia("sticker.webp")], { hasMedia: false, pendingText: "👍" });
    expect(result.outcome.action).toBe("reply");
    expect(calls.systems).not.toContain(VISION_PROMPT);
    expect(userText()).toContain("figurinha");
  });

  it("receita em foto: extrai os graus, a IA confirma com as próprias palavras e transfere para Vendas com o resumo", async () => {
    model.vision = [{ kind: "receita", documento: { tipo: "receita", receita: { od: { esferico: "-2,00", cilindrico: "-0,75", eixo: "180" }, oe: { esferico: "-1,75", cilindrico: "-0,50", eixo: "10" }, data: "10/11/2026" } } }];
    model.reply = { reply: "Chegou certinho a sua receita! A equipe de Vendas já vai conferir e te chama aqui.", action: "reply" };
    const result = await run([image("receita.jpg")]);
    expect(result.outcome).toMatchObject({ action: "handoff", trigger: "prescription", queue: "Vendas" });
    // A confirmação passa pelo LLM (com o fato do documento lido no prompt), nunca uma frase fixa do código.
    expect(calls.systems.at(-1)).toContain("DOCUMENTO RECEBIDO");
    expect(result.outcome.reply).toBe("Chegou certinho a sua receita! A equipe de Vendas já vai conferir e te chama aqui.");
    expect(result.outcome.reason).toContain("OD: esf -2,00 | cil -0,75 | eixo 180; OE: esf -1,75 | cil -0,50 | eixo 10; Data: 10/11/2026");
  });

  it("receita em PDF: lida antes do transbordo; comprovante vai para o Financeiro", async () => {
    model.pdf = { kind: "receita", documento: { tipo: "receita", receita: { od: { esferico: "+1,25", adicao: "+2,00" }, oe: { esferico: "+1,00", adicao: "+2,00" } } } };
    const pdf = mediaParts("pdf", { name: "receita.pdf", mime: "application/pdf", data: bytes("%PDF") });
    const rx = await run([pdf]);
    expect(rx.outcome).toMatchObject({ action: "handoff", trigger: "prescription", queue: "Vendas" });
    expect(rx.outcome.reason).toContain("OD: esf +1,25 | adição +2,00");
    model.vision = [{ kind: "documento", documento: { tipo: "comprovante", comprovante: { valor: "R$ 450,00", data: "12/11/2026", forma: "PIX" } } }];
    // Resposta vazia do modelo: só aí entra a confirmação padrão.
    model.reply = { reply: "", action: "reply" };
    const paid = await run([image("pix.jpg")]);
    expect(paid.outcome).toMatchObject({ trigger: "prescription", queue: "Financeiro" });
    expect(paid.outcome.reply).toContain("Recebi seu comprovante!");
    expect(paid.outcome.reason).toContain("valor R$ 450,00; data 12/11/2026; forma PIX");
  });

  it("lote com 2 fotos de óculos: as duas são buscadas no catálogo", async () => {
    model.vision = [{ kind: "produto", brand: "RAYBAN" }, { kind: "produto", brand: "OAKLEY" }];
    const result = await run([image("frente.jpg"), image("outro.jpg")]);
    expect(calls.searches).toBe(2);
    expect(result.outcome.action).toBe("reply");
    expect(calls.stockQueries.map((query) => query.termoBusca)).toEqual(["RAYBAN", "OAKLEY"]);
  });

  it("foto com legenda Justin usa estoque unificado e uma única lista acolhedora", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-16T11:00:00-03:00"));
    model.vision = [{ kind: "produto", marca: "Ray-Ban", nomeModelo: "Justin", textoVisivelNaImagem: "Óculos de Sol Ray-Ban Justin Verde Escuro", corLenteEArmacao: "Verde escuro" }];
    const store = { code: "39", loja: "Loja 39", cidade: "Goiânia", endereco: "Rua 1", quantidade: 1 };
    model.stockProducts = ["622", "601"].map((color, index) => ({
      codigo: String(900700 + index), produto: `OCS RAYBAN REF 0RB4165L ${color} 54`, marca: "RAYBAN",
      precoVenda: "R$ 899,00", lojasComEstoque: [store], lojasNaRegiao: [], nomeProduto: "Ray-Ban Justin", referencia: "RB4165",
    }));
    model.reply = { reply: "Bom dia, Maria! Que bom te ver de novo. Temos sim esse Ray-Ban Justin, olha as cores disponíveis:", action: "reply" };
    const result = await run([image("justin.jpg")], { hasMedia: false, pendingText: "bom dia, vc tem esse óculos ?", aiReplies: 0, contactName: "Maria", isReturningContact: true });
    expect(calls.systems.at(-1)).toContain("CLIENTE QUE VOLTOU");
    expect(calls.systems.at(-1)).toContain("FOTO DE PRODUTO: identificado como");
    expect(calls.stockQueries).toHaveLength(1);
    expect(calls.stockQueries[0]).toMatchObject({ marca: "Ray-Ban", nomeModelo: "Justin", referenciaOuSku: "RB4165", textoVisivelNaImagem: "Óculos de Sol Ray-Ban Justin Verde Escuro", tipoBusca: "modelo_especifico" });
    expect(result.outcome.reply).toMatch(/^Bom dia, Maria!/);
    expect(result.outcome.reply).not.toMatch(/não localizei|não está disponível/i);
    expect(result.interactiveList?.bodyText).toMatch(/Maria!.*de (novo|volta)|Maria!.*novamente/);
    expect(result.interactiveList?.bodyText).toContain("Ray-Ban Justin");
    expect(result.interactiveList?.rows.map((row) => row.id)).toEqual(["product_select:900700", "product_select:900701"]);
    expect(result.outcome.reply.match(/Ray-Ban Justin/g)).toHaveLength(1);
  });

  it("uma variante em estoque produz ficha diretamente e sem falsa indisponibilidade", async () => {
    model.vision = [{ kind: "produto", marca: "Ray-Ban", nomeModelo: "Justin", textoVisivelNaImagem: "Óculos de Sol Ray-Ban Justin Verde Escuro" }];
    model.stockProducts = [{
      codigo: "900706", produto: "OCS RAYBAN REF 0RB4165L 622 54", marca: "RAYBAN",
      precoVenda: "R$ 899,00", lojasComEstoque: [{ code: "39", loja: "Loja 39", cidade: "Goiânia", endereco: "Rua 1", quantidade: 1 }],
      lojasNaRegiao: [], nomeProduto: "Ray-Ban Justin", referencia: "RB4165",
    }];
    model.reply = { reply: "Bom dia, Maria! Temos sim, olha ele aqui:", action: "reply" };
    const result = await run([image("justin.jpg")], { hasMedia: false, pendingText: "bom dia, vc tem esse óculos ?", aiReplies: 0, contactName: "Maria" });
    expect(result.outcome.reply).toMatch(/^(Bom dia|Boa tarde|Boa noite), Maria! Temos sim, olha ele aqui:\n\n🕶️ \*Ray-Ban Justin/);
    expect(result.outcome.reply).toContain("Ray-Ban Justin");
    expect(result.outcome.reply).toContain("R$ 899,00");
    expect(result.outcome.reply).not.toMatch(/não localizei|não está disponível/i);
    expect(result.interactiveList).toBeNull();
    expect(calls.stockQueries).toHaveLength(1);
  });

  it("só oferece alternativas da marca após confirmar que o modelo está sem estoque", async () => {
    model.vision = [{ kind: "produto", marca: "Ray-Ban", nomeModelo: "Justin", textoVisivelNaImagem: "Ray-Ban Justin" }];
    const result = await run([image("justin.jpg")], { hasMedia: false, pendingText: "tem esse?", aiReplies: 1, knownCity: "Goiânia" });
    expect(calls.stockQueries.map((query) => query.tipoBusca)).toEqual(["modelo_especifico", "marca_ampla"]);
    // O fato (modelo indisponível + outras opções da marca) vai para a IA, que escreve; a vitrine real é anexada.
    expect(calls.systems.at(-1)).toContain("mas esse modelo não está disponível em Goiânia");
    expect(result.outcome.reply).toContain("Claro! O Ray-Ban Justin está saindo por R$ 899,00");
    expect(result.outcome.reply).toContain("Temos *Ray-Ban* em estoque!");
  });

  it("lote com áudio + foto: transcrição e foto chegam juntas à IA", async () => {
    model.vision = [{ kind: "produto", brand: "RAYBAN" }];
    const audio = mediaParts("audio", { name: "audio.ogg", mime: "audio/ogg", data: bytes() }, "tem esse aqui na loja do bueno?");
    await run([audio, image("oculos.jpg")]);
    expect(userText()).toContain("tem esse aqui na loja do bueno?");
    expect(calls.systems.at(-1)).toContain("RAYBAN");
  });

  it("vídeo: ouve o áudio e avisa que ainda não vê vídeos", async () => {
    const video = await prepareMediaSafe({ name: "video.mp4", mime: "video/mp4", data: bytes("mp4") }, { feature: "agent" });
    expect(video.kind).toBe("video");
    expect(calls.transcribed).toEqual(["video.mp4"]);
    expect(JSON.stringify(video.parts)).toContain("não consegue ver vídeos");
    const old = await prepareMediaSafe({ name: "video.3gp", mime: "video/3gpp", data: bytes() }, { feature: "agent" });
    expect(old.failed).toContain("vídeo não suportado");
  });
});

describe("planilha e falhas de leitura com aviso amigável", () => {
  it("planilha .xlsx vira tabela em texto para a IA", async () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Modelo", "Preço"], ["RB4165", 899], ["OO9102", 750]]), "Orçamento");
    const data = new Uint8Array(XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
    expect(extractSheetText(data)).toBe("Aba: Orçamento\nModelo,Preço\nRB4165,899\nOO9102,750");
    const sheet = await prepareMediaSafe({ name: "orcamento.xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", data }, { feature: "agent" });
    expect(sheet.kind).toBe("sheet");
    expect(JSON.stringify(sheet.parts)).toContain("RB4165,899");
  });

  it("falha no download da Meta: marcador para a IA avisar o cliente, sem transferir", async () => {
    expect(mediaFailureReason("Meta API 401: Error validating access token: Session has expired")).toBe("falha de autorização ao baixar do WhatsApp");
    expect(mediaFailureReason("Mídia acima do limite.")).toBe("arquivo acima de 16 MB");
    const result = await run([failedMedia("audio", "audio", mediaFailureReason("HTTP 401 token expired"))]);
    expect(result.outcome.action).toBe("reply");
    expect(userText()).toContain("[FALHA_LEITURA_MIDIA: tipo=audio, motivo=falha de autorização ao baixar do WhatsApp]");
    expect(calls.systems.at(-1)).toContain("sugerindo reenviar ou mandar em outro formato");
  });

  it("arquivo .doc antigo e transcrição que estoura o tempo viram aviso, não erro", async () => {
    const doc = await prepareMediaSafe({ name: "receita.doc", mime: "application/msword", data: bytes() }, { feature: "agent" });
    expect(doc.summary).toBe("[FALHA_LEITURA_MIDIA: tipo=documento, motivo=arquivo Word .doc antigo (formato não suportado)]");
    expect(JSON.stringify(doc.parts)).toContain("PDF, foto ou print");
    model.transcribeError = new Error("A transcrição do áudio demorou demais. Tente de novo.");
    const slow = await prepareMediaSafe({ name: "longo.ogg", mime: "audio/ogg", data: bytes() }, { feature: "agent" });
    expect(slow.summary).toBe("[FALHA_LEITURA_MIDIA: tipo=audio, motivo=o áudio demorou demais para transcrever]");
  });
});
