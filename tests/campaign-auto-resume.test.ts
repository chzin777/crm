import { beforeEach, describe, expect, it, vi } from "vitest";

// Banco em memória com updatedAt por chave (a trava de retomada é a gravação condicional pelo updatedAt).
const db = vi.hoisted(() => ({ data: new Map<string, { value: unknown; updatedAt: Date }>(), messages: [] as Record<string, unknown>[], tick: 0 }));
const meta = vi.hoisted(() => ({ calls: [] as string[], delayMs: 0 }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => {
  const stamp = () => new Date(Date.UTC(2026, 10, 27, 12, 0, 0) + ++db.tick);
  const put = (key: string, value: unknown) => db.data.set(key, { value: structuredClone(value), updatedAt: stamp() });
  return {
    prisma: {
      crmWorkspaceData: {
        findUnique: vi.fn(async ({ where }: { where: { key: string } }) => (db.data.has(where.key) ? { value: structuredClone(db.data.get(where.key)!.value) } : null)),
        upsert: vi.fn(async ({ where, create, update }: { where: { key: string }; create: { value: unknown }; update: { value: unknown } }) => put(where.key, db.data.has(where.key) ? update.value : create.value)),
        update: vi.fn(async ({ where, data }: { where: { key: string }; data: { value: unknown } }) => put(where.key, data.value)),
        findMany: vi.fn(async ({ where }: { where: { key: { startsWith: string } } }) =>
          [...db.data.entries()].filter(([key]) => key.startsWith(where.key.startsWith)).map(([key, row]) => ({ key, value: structuredClone(row.value), updatedAt: row.updatedAt }))),
        updateMany: vi.fn(async ({ where, data }: { where: { key: string; updatedAt: Date }; data: { value: unknown } }) => {
          const row = db.data.get(where.key);
          if (!row || row.updatedAt.getTime() !== where.updatedAt.getTime()) return { count: 0 };
          put(where.key, data.value);
          return { count: 1 };
        }),
      },
      campaignMessage: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { db.messages.push(data); }),
        // Quem já recebeu ESTE disparo (idempotência da retomada).
        findMany: vi.fn(async ({ where }: { where: { campaignId?: string; OR?: { campaignId?: string }[] } }) => {
          const campaignId = where.campaignId ?? where.OR?.[0]?.campaignId;
          return db.messages.filter((row) => row.campaignId === campaignId && row.status === "sent").map((row) => ({ contactId: row.contactId, phone: row.phone }));
        }),
      },
    },
  };
});
vi.mock("@/lib/cache", () => ({ invalidateCache: vi.fn(async () => undefined) }));
vi.mock("@/lib/meta-whatsapp", async () => {
  const actual = await vi.importActual<typeof import("@/lib/meta-whatsapp")>("@/lib/meta-whatsapp");
  return {
    ...actual,
    sendText: vi.fn(async (phone: string) => {
      if (meta.delayMs) await new Promise((resolve) => setTimeout(resolve, meta.delayMs));
      meta.calls.push(phone);
      return { messages: [{ id: `wamid.${meta.calls.length}` }] };
    }),
    sendTemplate: vi.fn(), sendMedia: vi.fn(), uploadMedia: vi.fn(),
    listTemplates: vi.fn(async () => []), findTemplate: vi.fn(async () => null), getMessagingInfo: vi.fn(async () => null),
  };
});
vi.mock("@/lib/attendant-db", () => ({ assignedAttendantValues: vi.fn(async () => ({})) }));
vi.mock("@/lib/engagement", () => ({ INVALID_NUMBER_CODES: new Set([131026]), markInvalidWhatsApp: vi.fn(async () => undefined), coldContactIds: vi.fn(async () => new Set()) }));
vi.mock("@/lib/chat/dispatch-history", () => ({ chatPhone: (phone: string) => phone, recordDispatchInChat: vi.fn(async () => undefined), renderTemplateText: () => "" }));
vi.mock("@/lib/chat/dispatch-media", () => ({ downloadMedia: vi.fn(), storeDispatchMedia: vi.fn() }));
vi.mock("@/lib/marketing-opt-out-db", () => ({ loadOptOutKeys: vi.fn(async () => new Set<string>()) }));
vi.mock("@/lib/monitoring/error-reporter", () => ({ reportError: vi.fn(async () => undefined) }));
vi.mock("@/lib/chat/conversation", () => ({ firstDispatch: vi.fn() }));

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AUTO_RESUME_NOTE, cancelDispatchShutdown, DISPATCH_TIMING, listDispatchJobs, resumeDispatch, shutdownDispatches, type DispatchJob, type DispatchRecipient } from "@/lib/campaign-dispatch";

const people = (count: number): DispatchRecipient[] => Array.from({ length: count }, (_, index) => ({ id: `c${index}`, nome: `Cliente ${index}`, telefone: `629${String(81000000 + index)}`, email: "", dataNascimento: "", segmento: "Teste" }));
const RECIPIENTS = people(6);

function seed(id: string, job: Partial<DispatchJob>) {
  const campaigns = (db.data.get("campaigns")?.value as unknown[] | undefined) ?? [];
  db.data.set("campaigns", { value: [...campaigns, { id, nome: `Campanha ${id}`, status: "Enviando", mensagem: "Oi {{primeiro_nome}}!", disparos: 0 }], updatedAt: new Date(0) });
  db.data.set(`dispatch-recipients:${id}`, { value: RECIPIENTS, updatedAt: new Date(0) });
  db.data.set(`dispatch:${id}`, {
    value: { campaignId: id, campaignName: `Campanha ${id}`, status: "running", total: RECIPIENTS.length, cursor: 0, sent: 0, failed: 0, skipped: 0, baseDisparos: 0, errors: [], startedAt: new Date().toISOString(), ...job },
    // Sem progresso há muito tempo (órfão de queda) a não ser que o teste grave de novo.
    updatedAt: new Date(Date.UTC(2026, 10, 27, 0, 0, 0)),
  });
}
const job = (id: string) => db.data.get(`dispatch:${id}`)!.value as DispatchJob;
async function settled(id: string) {
  for (let i = 0; i < 600 && job(id).status === "running"; i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  await new Promise((resolve) => setTimeout(resolve, 10));
  return job(id);
}
const delivered = (id: string) => db.messages.filter((row) => row.campaignId === id && row.status === "sent").map((row) => row.contactId);

beforeEach(() => {
  cancelDispatchShutdown();
  db.data.clear();
  db.messages.length = 0;
  meta.calls = [];
  meta.delayMs = 0;
  Object.assign(DISPATCH_TIMING, { sendDelayMs: 0, transientRetryMs: [0, 0, 0, 0], rateLimitWaitsMs: [0, 0, 0] });
});

describe("desligamento gracioso (SIGTERM do deploy)", () => {
  it("disparo ativo termina o envio em andamento e fica marcado para retomar; pausa manual não é tocada", async () => {
    seed("ativa", { status: "paused", pause: { kind: "manual", message: "x" } });
    seed("manual", { status: "paused", cursor: 2, sent: 2, pause: { kind: "manual", message: "Disparo pausado manualmente." } });
    meta.delayMs = 30;
    await resumeDispatch("ativa");
    await new Promise((resolve) => setTimeout(resolve, 70));
    const sentBefore = meta.calls.length;
    const owned = await shutdownDispatches(2_000);

    expect(owned).toEqual(["ativa"]);
    const interrupted = job("ativa");
    expect(interrupted.status).toBe("paused");
    expect(interrupted.pause?.kind).toBe("restart");
    expect(interrupted.autoResumeOnBoot).toBe(true);
    // O envio que estava no ar terminou e foi contado: nada perdido, nada pela metade.
    expect(interrupted.sent).toBe(meta.calls.length);
    expect(interrupted.cursor).toBe(meta.calls.length);
    expect(meta.calls.length).toBeGreaterThanOrEqual(sentBefore);
    expect(meta.calls.length).toBeLessThan(RECIPIENTS.length);

    expect(job("manual").pause?.kind).toBe("manual");
    expect(job("manual").autoResumeOnBoot).toBeUndefined();
  });

  it("instância desligando não retoma nada (quem retoma é a nova)", async () => {
    seed("interrompida", { status: "paused", cursor: 1, sent: 1, pause: { kind: "restart", message: "x" }, autoResumeOnBoot: true });
    await shutdownDispatches(10);
    await listDispatchJobs();
    expect(job("interrompida").status).toBe("paused");
  });

  it("o processo trata SIGTERM/SIGINT esperando os disparos e o Next não sai antes", () => {
    const instrumentation = readFileSync(join(process.cwd(), "instrumentation.ts"), "utf8");
    expect(instrumentation).toMatch(/process\.on\("SIGTERM"/);
    expect(instrumentation).toMatch(/shutdownDispatches\(/);
    expect(instrumentation).toMatch(/listDispatchJobs\(\)/);
    expect(readFileSync(join(process.cwd(), "Dockerfile"), "utf8")).toMatch(/NEXT_MANUAL_SIG_HANDLE=true/);
  });
});

describe("retomada automática no boot", () => {
  it("disparo interrompido pelo deploy volta sozinho a partir dos pendentes, sem reenviar a quem já recebeu", async () => {
    // Antes do deploy: c0 e c1 receberam (registrados), mas o cursor ficou em 1 (c1 saiu e o processo caiu antes de gravar).
    seed("deploy", { status: "paused", cursor: 1, sent: 2, pause: { kind: "restart", message: "x" }, autoResumeOnBoot: true });
    db.messages.push({ campaignId: "deploy", contactId: "c0", phone: RECIPIENTS[0].telefone, status: "sent" }, { campaignId: "deploy", contactId: "c1", phone: RECIPIENTS[1].telefone, status: "sent" });

    await listDispatchJobs();
    const done = await settled("deploy");
    expect(done.status).toBe("completed");
    expect(done.autoResumedAt).toBeTruthy();
    expect(done.pause).toBeUndefined();
    expect(meta.calls).toEqual(RECIPIENTS.slice(2).map((item) => item.telefone));
    expect(delivered("deploy").sort()).toEqual(["c0", "c1", "c2", "c3", "c4", "c5"]);
    expect(AUTO_RESUME_NOTE).toBe("Disparo retomado automaticamente após atualização do servidor");
  });

  it("órfão de queda (em andamento sem progresso) também volta, e duas instâncias juntas retomam uma vez só", async () => {
    seed("queda", { status: "running", cursor: 3, sent: 3 });
    for (const row of RECIPIENTS.slice(0, 3)) db.messages.push({ campaignId: "queda", contactId: row.id, phone: row.telefone, status: "sent" });
    await Promise.all([listDispatchJobs(), listDispatchJobs()]);
    const done = await settled("queda");
    expect(done.status).toBe("completed");
    expect(meta.calls).toEqual(RECIPIENTS.slice(3).map((item) => item.telefone));
  });
});

describe("pausas que não voltam sozinhas", () => {
  it("pausa manual e erro fatal de token continuam pausados depois do boot", async () => {
    seed("manual", { status: "paused", cursor: 2, sent: 2, pause: { kind: "manual", message: "Disparo pausado manualmente." } });
    seed("token", { status: "paused", cursor: 1, sent: 1, pause: { kind: "auth", code: 190, message: "Token expirado" } });
    await listDispatchJobs();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(job("manual").status).toBe("paused");
    expect(job("manual").pause?.kind).toBe("manual");
    expect(job("token").status).toBe("paused");
    expect(job("token").pause?.code).toBe(190);
    expect(meta.calls).toHaveLength(0);
  });
});
