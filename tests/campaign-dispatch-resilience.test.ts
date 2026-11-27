import { beforeEach, describe, expect, it, vi } from "vitest";

// Banco em memória: só o que o motor de disparo usa (fila do disparo, lista de campanhas e mensagens).
const db = vi.hoisted(() => ({ data: new Map<string, unknown>(), messages: [] as Record<string, unknown>[] }));
const meta = vi.hoisted(() => ({ script: [] as (() => unknown)[], calls: [] as string[] }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmWorkspaceData: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) => (db.data.has(where.key) ? { value: structuredClone(db.data.get(where.key)) } : null)),
      upsert: vi.fn(async ({ where, create, update }: { where: { key: string }; create: { value: unknown }; update: { value: unknown } }) => {
        db.data.set(where.key, structuredClone(db.data.has(where.key) ? update.value : create.value));
      }),
      update: vi.fn(async ({ where, data }: { where: { key: string }; data: { value: unknown } }) => { db.data.set(where.key, structuredClone(data.value)); }),
      findMany: vi.fn(async () => []),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    campaignMessage: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { db.messages.push(data); }),
      findMany: vi.fn(async () => []),
    },
  },
}));
vi.mock("@/lib/cache", () => ({ invalidateCache: vi.fn(async () => undefined) }));
vi.mock("@/lib/meta-whatsapp", async () => {
  const actual = await vi.importActual<typeof import("@/lib/meta-whatsapp")>("@/lib/meta-whatsapp");
  return {
    ...actual,
    sendText: vi.fn(async (phone: string) => {
      meta.calls.push(phone);
      const next = meta.script.shift();
      const result = next ? next() : undefined;
      return result ?? { messages: [{ id: `wamid.${meta.calls.length}` }] };
    }),
    sendTemplate: vi.fn(),
    sendMedia: vi.fn(),
    uploadMedia: vi.fn(),
    listTemplates: vi.fn(async () => []),
    findTemplate: vi.fn(async () => null),
    getMessagingInfo: vi.fn(async () => null),
  };
});
vi.mock("@/lib/attendant-db", () => ({ assignedAttendantValues: vi.fn(async () => ({})) }));
vi.mock("@/lib/engagement", () => ({ INVALID_NUMBER_CODES: new Set([131026]), markInvalidWhatsApp: vi.fn(async () => undefined), coldContactIds: vi.fn(async () => new Set()) }));
vi.mock("@/lib/chat/dispatch-history", () => ({ chatPhone: (phone: string) => phone, recordDispatchInChat: vi.fn(async () => undefined), renderTemplateText: () => "" }));
vi.mock("@/lib/chat/dispatch-media", () => ({ downloadMedia: vi.fn(), storeDispatchMedia: vi.fn() }));
vi.mock("@/lib/marketing-opt-out-db", () => ({ loadOptOutKeys: vi.fn(async () => new Set<string>()) }));
vi.mock("@/lib/monitoring/error-reporter", () => ({ reportError: vi.fn(async () => undefined) }));
vi.mock("@/lib/chat/conversation", () => ({ firstDispatch: vi.fn() }));

import { classifySendError, DISPATCH_TIMING, MAX_CONSECUTIVE_INFRA_FAILURES, resumeDispatch, type DispatchJob, type DispatchRecipient } from "@/lib/campaign-dispatch";
import { InvalidPhoneError, MetaApiError, MetaNetworkError } from "@/lib/meta-whatsapp";

const CAMPAIGN = "camp-teste";
const people = (count: number): DispatchRecipient[] => Array.from({ length: count }, (_, index) => ({ id: `c${index}`, nome: `Cliente ${index}`, telefone: `629${String(81000000 + index)}`, email: "", dataNascimento: "", segmento: "Teste" }));
const network = () => { throw new MetaNetworkError("Não foi possível conectar à Meta WhatsApp API (ECONNRESET). Verifique sua conexão.", "ECONNRESET"); };
const rateLimited = () => { throw new MetaApiError("Meta WhatsApp API: (#130429) Rate limit hit", 130429, 429, { code: 130429 }); };

function seed(recipients: DispatchRecipient[], job: Partial<DispatchJob> = {}) {
  db.data.set("campaigns", [{ id: CAMPAIGN, nome: "Black Friday", status: "Pausada", mensagem: "Oi {{primeiro_nome}}!", disparos: 0 }]);
  db.data.set(`dispatch-recipients:${CAMPAIGN}`, recipients);
  db.data.set(`dispatch:${CAMPAIGN}`, {
    campaignId: CAMPAIGN, campaignName: "Black Friday", status: "paused", total: recipients.length, cursor: 0, sent: 0, failed: 0, skipped: 0, baseDisparos: 0, errors: [],
    pause: { kind: "network", message: "Não foi possível conectar à Meta. Verifique a conexão do servidor e retome o disparo." }, startedAt: new Date().toISOString(), ...job,
  });
}
const job = () => db.data.get(`dispatch:${CAMPAIGN}`) as DispatchJob;
async function settled() {
  for (let i = 0; i < 400 && job().status === "running"; i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  await new Promise((resolve) => setTimeout(resolve, 5));
  return job();
}

beforeEach(() => {
  db.data.clear();
  db.messages.length = 0;
  meta.script = [];
  meta.calls = [];
  Object.assign(DISPATCH_TIMING, { sendDelayMs: 0, transientRetryMs: [0, 0, 0, 0], rateLimitWaitsMs: [0, 0, 0] });
});

describe("retomar disparo pausado por erro de rede", () => {
  it("limpa o motivo da pausa, volta a enviar e processa todos os contatos pendentes", async () => {
    seed(people(5), { cursor: 2, sent: 2 });
    const resumed = await resumeDispatch(CAMPAIGN);
    expect(resumed.status).toBe("running");
    expect(resumed.pause).toBeUndefined();
    const done = await settled();
    expect(done.status).toBe("completed");
    expect(done.pause).toBeUndefined();
    expect(done.sent).toBe(5);
    expect(meta.calls).toHaveLength(3);
  });

  it("contato com telefone inválido (caso real: 9 dígitos) falha sozinho e o disparo segue até o fim", async () => {
    seed(people(4));
    meta.script = [() => undefined, () => { throw new InvalidPhoneError(); }];
    await resumeDispatch(CAMPAIGN);
    const done = await settled();
    expect(done.status).toBe("completed");
    expect(done.sent).toBe(3);
    expect(done.failed).toBe(1);
    expect(done.errors[0]).toContain("Telefone inválido.");
  });
});

describe("falhas transitórias não pausam a campanha", () => {
  it("429 da Meta e queda de conexão: repete com espera e conclui sem pausar", async () => {
    seed(people(3));
    meta.script = [rateLimited, rateLimited, () => undefined, network, network, () => undefined];
    await resumeDispatch(CAMPAIGN);
    const done = await settled();
    expect(done.status).toBe("completed");
    expect(done.sent).toBe(3);
    expect(done.failed).toBe(0);
  });

  it("contato sem conexão após todas as tentativas volta no fim do disparo e sai", async () => {
    seed(people(3));
    // 1ª tentativa + 4 novas para o contato 0; depois tudo responde.
    meta.script = [network, network, network, network, network];
    await resumeDispatch(CAMPAIGN);
    const done = await settled();
    expect(done.status).toBe("completed");
    expect(done.sent).toBe(3);
    expect(done.retryQueue).toBeUndefined();
    expect(meta.calls.at(-1)).toBe(people(3)[0].telefone);
  });

  it("classifica 5xx, 131000, código 2 e fetch failed como transitórios; 429/130429/80007 como limite", () => {
    expect(classifySendError(new MetaApiError("Meta WhatsApp API: Service unavailable", 2, 503)).type).toBe("transient");
    expect(classifySendError(new MetaApiError("Meta WhatsApp API: Something went wrong", 131000, 500)).type).toBe("transient");
    expect(classifySendError(new TypeError("fetch failed", { cause: { code: "UND_ERR_SOCKET" } })).type).toBe("transient");
    expect(classifySendError(new MetaApiError("Meta WhatsApp API: limit", 80007, 400)).type).toBe("rate_limit");
    expect(classifySendError(new InvalidPhoneError()).type).toBe("recipient");
  });
});

describe("falha fatal guarda a mensagem real", () => {
  it("token expirado (190): pausa na hora com HTTP, código e a mensagem da Meta; o contato volta na retomada", async () => {
    seed(people(3));
    meta.script = [() => undefined, () => { throw new MetaApiError("Meta WhatsApp API: Error validating access token: Session has expired", 190, 401, { code: 190, error_subcode: 463 }); }];
    await resumeDispatch(CAMPAIGN);
    const done = await settled();
    expect(done.status).toBe("paused");
    expect(done.cursor).toBe(1);
    expect(done.pause?.kind).toBe("auth");
    expect(done.pause?.code).toBe(190);
    expect(done.pause?.message).toContain("Session has expired");
    expect(done.pause?.detail).toBe("HTTP 401 · código Meta 190/463: Error validating access token: Session has expired");
    expect(done.pause?.message).not.toContain("Verifique a conexão do servidor");
  });

  it(`${MAX_CONSECUTIVE_INFRA_FAILURES} contatos seguidos sem conexão: pausa com o erro de rede real e guarda quem falta`, async () => {
    seed(people(12));
    meta.script = Array.from({ length: MAX_CONSECUTIVE_INFRA_FAILURES * 5 }, () => network);
    await resumeDispatch(CAMPAIGN);
    const done = await settled();
    expect(done.status).toBe("paused");
    expect(done.pause?.kind).toBe("network");
    expect(done.pause?.detail).toContain("rede (ECONNRESET)");
    expect(done.retryQueue).toHaveLength(MAX_CONSECUTIVE_INFRA_FAILURES);
    expect(done.cursor).toBe(MAX_CONSECUTIVE_INFRA_FAILURES);

    // Conexão de volta: a retomada termina a fila e reenvia os que ficaram para trás.
    const again = await resumeDispatch(CAMPAIGN);
    expect(again.pause).toBeUndefined();
    const finished = await settled();
    expect(finished.status).toBe("completed");
    expect(finished.sent).toBe(12);
    expect(finished.failed).toBe(0);
  });
});
