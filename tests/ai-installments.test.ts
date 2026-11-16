import { beforeEach, describe, expect, it, vi } from "vitest";

const model = vi.hoisted(() => ({ transcript: "", replyCalls: 0 }));
const lookups = vi.hoisted(() => ({ calls: [] as string[] }));

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
vi.mock("@/lib/ai/product-image-db", () => ({ imageSearchStatus: () => false, invalidateProductImage: vi.fn(), searchAndCacheProductImage: vi.fn() }));
vi.mock("@/lib/ai/stock-db", () => ({ storeDirectory: vi.fn(async () => new Map()), clearStoreDirectory: vi.fn(), erpUnitDirectory: vi.fn(() => new Map()), consultarEstoqueProduto: vi.fn() }));
vi.mock("@/lib/ai/product-details-db", () => ({ productSummary: vi.fn(), buscarDetalhesProduto: vi.fn() }));
vi.mock("@/lib/ai/catalog-db", () => ({ catalogProducts: vi.fn(async () => []), searchErpCatalog: vi.fn() }));
vi.mock("@/lib/ai/openai", () => {
  class AiError extends Error {}
  return {
    aiConfigured: () => true,
    AiError,
    transcribeAudio: vi.fn(async () => model.transcript),
    aiJson: vi.fn(async () => {
      model.replyCalls += 1;
      return { reply: "Resposta da IA", action: "reply" };
    }),
  };
});

import { prepareMediaSafe, runAiAgent, type AgentRunInput } from "@/lib/ai/agent";
import { DEFAULT_AI_SETTINGS } from "@/lib/ai/settings";
import type { PreparedMedia } from "@/lib/ai/multimodal";
import {
  draftInstallmentsMessage, extractCpf, extractFullName, FINANCIAL_ASK_IDENTITY, FINANCIAL_CHECK_CPF, FINANCIAL_INVALID_CPF, FINANCIAL_STILL_WAITING, FINANCIAL_WAIT,
  isInstallmentQuestion, isValidCpf, maskCpf, nameMatches, summarizeInstallments, type InstallmentItem, type InstallmentLookup,
} from "@/lib/ai/installments";

const VALID_CPF = "52998224725";
const ITEMS: InstallmentItem[] = [
  { numero: "286157", parcela: "6", vencimento: "2026-09-17", valor: 440, posicao: "Quitado", pagamento: "2026-10-02", valorPago: 440, tipo: "CARNE" },
  { numero: "286157", parcela: "7", vencimento: "2026-10-17", valor: 440, posicao: "Aberto", pagamento: null, valorPago: null, tipo: "CARNE" },
  { numero: "286157", parcela: "8", vencimento: "2026-11-17", valor: 440, posicao: "Aberto", pagamento: null, valorPago: null, tipo: "CARNE" },
  { numero: "286157", parcela: "9", vencimento: "2026-12-17", valor: 440, posicao: "Aberto", pagamento: null, valorPago: null, tipo: "CARNE" },
];
const FOUND: InstallmentLookup = { status: "ok", found: true, name: "HELIO HENRYQUE SABINO DOS SANTOS LIMA", items: ITEMS };

const settings = { ...DEFAULT_AI_SETTINGS, aiChoosesQueue: false, useStores: false, useOperatingHours: false, topics: [], maxAiReplies: 20, closeWhenResolved: false, sendProductImage: false };
const lookup = vi.fn(async (cpf: string): Promise<InstallmentLookup> => {
  lookups.calls.push(cpf);
  return cpf === VALID_CPF ? FOUND : { status: "ok", found: false, name: null, items: [] };
});
const run = (pendingText: string, extra: Partial<AgentRunInput> = {}, media: PreparedMedia[] = []) => runAiAgent({
  settings, pendingText, hasMedia: media.length > 0, aiReplies: 1, meta: { feature: "agent", conversationId: "c1" },
  loadMedia: async () => media, buildContext: () => "Cliente: Helio", lookupInstallments: lookup, ...extra,
});

beforeEach(() => {
  lookups.calls.length = 0;
  model.replyCalls = 0;
  model.transcript = "";
});

describe("regras puras", () => {
  it("detecta pedido de parcelas, sem confundir com parcelamento no cartão", () => {
    expect(isInstallmentQuestion("quantas parcelas faltam do meu carnê?")).toBe(true);
    expect(isInstallmentQuestion("Queria saber das prestações do crediário")).toBe(true);
    expect(isInstallmentQuestion("quanto eu devo ainda?")).toBe(true);
    expect(isInstallmentQuestion("parcela no cartão em quantas vezes?")).toBe(false);
    expect(isInstallmentQuestion("oi, tem ray-ban?")).toBe(false);
  });

  it("CPF com dígito verificador, ditado no áudio e mascarado", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("529.982.247-24")).toBe(false);
    expect(isValidCpf("11111111111")).toBe(false);
    expect(extractCpf("meu cpf é 529.982.247-25")).toEqual({ cpf: VALID_CPF, valid: true });
    expect(extractCpf("cinco dois nove nove oito dois dois quatro sete dois cinco")).toEqual({ cpf: VALID_CPF, valid: true });
    expect(extractCpf("cpf 529 982 247 24")).toEqual({ cpf: "52998224724", valid: false });
    expect(maskCpf(VALID_CPF)).toBe("***.982.247-**");
  });

  it("nome completo e conferência com o cadastro (erro de transcrição tolerado)", () => {
    expect(extractFullName("Meu nome é Helio Sabino Lima e o CPF 529.982.247-25")).toBe("Helio Sabino Lima");
    expect(extractFullName("Helio Henryque Lima\n52998224725")).toBe("Helio Henryque Lima");
    expect(nameMatches("Hélio Sabino", "HELIO HENRYQUE SABINO DOS SANTOS LIMA")).toBe(true);
    expect(nameMatches("Elio Sabino", "HELIO HENRYQUE SABINO DOS SANTOS LIMA")).toBe(true);
    expect(nameMatches("Maria Souza", "HELIO HENRYQUE SABINO DOS SANTOS LIMA")).toBe(false);
  });

  it("resumo e rascunho humanizado", () => {
    const summary = summarizeInstallments(ITEMS, "2026-11-16");
    expect(summary).toMatchObject({ abertas: 3, pagas: 1, atrasadas: 1, valorAberto: 1320, proximoVencimento: "2026-10-17", proximoValor: 440 });
    const draft = draftInstallmentsMessage(FOUND.status === "ok" ? FOUND.name : null, summary);
    expect(draft).toContain("Helio, conferi seu crediário");
    expect(draft).toContain("Parcelas em aberto: *3* (1 vencida)");
    expect(draft).toContain("R$ 1.320,00");
    expect(draftInstallmentsMessage("Ana", summarizeInstallments([ITEMS[0]]))).toContain("nenhuma parcela em aberto");
  });
});

describe("fluxo da IA", () => {
  it("áudio com só o primeiro nome e sem CPF: pede nome completo e CPF antes de consultar", async () => {
    model.transcript = "oi aqui é o Hélio, queria saber quantas parcelas faltam do meu carnê";
    const audio = await prepareMediaSafe({ name: "audio.ogg", mime: "audio/ogg", data: new TextEncoder().encode("ogg") }, { feature: "agent" });
    const result = await run("", {}, [audio]);
    expect(result.outcome).toMatchObject({ action: "reply", reply: FINANCIAL_ASK_IDENTITY });
    expect(result.financialApproval ?? null).toBeNull();
    expect(lookups.calls).toEqual([]);
    expect(model.replyCalls).toBe(0);
  });

  it("CPF válido: consulta o VMSet, gera a aprovação e NÃO manda valores ao cliente", async () => {
    const result = await run("Helio Sabino Lima, CPF 529.982.247-25", { lastAiText: FINANCIAL_ASK_IDENTITY });
    expect(lookups.calls).toEqual([VALID_CPF]);
    expect(result.outcome.reply).toBe(FINANCIAL_WAIT);
    expect(result.outcome.reply).not.toMatch(/R\$|440|1\.320/);
    expect(result.financialApproval).toMatchObject({ customerNameVmset: FOUND.status === "ok" ? FOUND.name : "", customerCpfMasked: "***.982.247-**", nameMatches: true });
    expect(result.financialApproval?.draftMessage).toContain("R$ 1.320,00");
    expect(result.financialApproval?.transcribedText).toContain("Helio Sabino Lima");
  });

  it("aprovação desligada: responde direto com o resumo", async () => {
    const result = await run("quero saber das parcelas do carnê, cpf 52998224725", { settings: { ...settings, requireApprovalForFinancialQueries: false } });
    expect(result.financialApproval ?? null).toBeNull();
    expect(result.outcome.reply).toContain("Parcelas em aberto");
  });

  it("CPF de outra pessoa (nome não bate) ou inexistente: pede para conferir sem expor dados", async () => {
    const mismatch = await run("Maria Souza Pereira, CPF 529.982.247-25", { lastAiText: FINANCIAL_ASK_IDENTITY });
    expect(mismatch.outcome.reply).toBe(FINANCIAL_CHECK_CPF);
    expect(mismatch.outcome.reply).not.toContain("HELIO");
    expect(mismatch.financialApproval ?? null).toBeNull();
    const missing = await run("parcelas do carnê, cpf 111.444.777-35");
    expect(missing.outcome.reply).toBe(FINANCIAL_CHECK_CPF);
    const typo = await run("parcelas do carnê, cpf 529.982.247-24");
    expect(typo.outcome.reply).toBe(FINANCIAL_INVALID_CPF);
  });

  it("telefone vinculado a um cadastro só dispensa o CPF com o nome completo", async () => {
    const firstNameOnly = await run("quanto falta do meu carnê? é o Helio", { linkedCpf: VALID_CPF });
    expect(firstNameOnly.outcome.reply).toBe(FINANCIAL_ASK_IDENTITY);
    const fullName = await run("quanto falta do meu carnê? meu nome é Helio Sabino Lima", { linkedCpf: VALID_CPF });
    expect(fullName.outcome.reply).toBe(FINANCIAL_WAIT);
    expect(fullName.financialLog).toMatchObject({ step: "approval", source: "cadastro" });
  });

  it("aprovação já pendente: não consulta de novo; assunto diferente segue com a IA normal", async () => {
    const waiting = await run("e as parcelas?", { hasPendingFinancial: true });
    expect(waiting.outcome.reply).toBe(FINANCIAL_STILL_WAITING);
    expect(lookups.calls).toEqual([]);
    const other = await run("vocês abrem sábado?", { lastAiText: FINANCIAL_ASK_IDENTITY });
    expect(other.outcome.reply).toBe("Resposta da IA");
  });
});
