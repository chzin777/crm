import { beforeEach, describe, expect, it, vi } from "vitest";

// Cenário do incidente: envio individual para BETULIA MOTTA GOMES DE OLIVEIRA, (62) 99273-5920.
const PHONE = "62992735920";
const CONTACT_ID = "cmvfaq1rk002d4tp17s5ybnw0";

const db = vi.hoisted(() => ({
  jobs: new Map<string, unknown>(),
  campaignMessages: [] as Record<string, unknown>[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/minio", () => ({ readFile: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    contact: { findFirst: vi.fn(async () => ({ id: CONTACT_ID, name: "BETULIA MOTTA GOMES DE OLIVEIRA" })) },
    campaignMessage: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { db.campaignMessages.push(data); return data; }) },
    crmWorkspaceData: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) => (db.jobs.has(where.key) ? { value: structuredClone(db.jobs.get(where.key)) } : null)),
      upsert: vi.fn(async ({ where, create }: { where: { key: string }; create: { value: unknown } }) => { db.jobs.set(where.key, structuredClone(create.value)); }),
    },
  },
}));
const recordDispatchInChat = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/chat/dispatch-history", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/chat/dispatch-history")>()), recordDispatchInChat }));

const meta = vi.hoisted(() => ({
  sendTemplate: vi.fn(async () => ({ messages: [{ id: "wamid.HBgMNTU2MjkyNzM1OTIw" }] })),
  listTemplates: vi.fn(async () => [{ name: "black_friday_11_2026", language: "pt_BR", category: "MARKETING", body: "11/11, na Óticas Brasil: compre uma armação e ganhe outra.", headerFormat: null, headerText: "", headerImageUrl: null }]),
}));
vi.mock("@/lib/meta-whatsapp", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/meta-whatsapp")>()),
  ensureInstance: vi.fn(async () => undefined),
  sendTemplate: meta.sendTemplate,
  listTemplates: meta.listTemplates,
}));
vi.mock("@/lib/api-auth", () => ({ requireApiSession: vi.fn(async () => ({ id: "user-1", name: "Operador Teste" })) }));

import { MetaApiError, normalizePhone } from "@/lib/meta-whatsapp";
import { markBulkItemFailed, recordSingleSend, toView, type BulkJob } from "@/lib/bulk-dispatch";
import { POST } from "@/app/api/whatsapp/send/route";

const sendForm = (fields: Record<string, string>) => {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return new Request("http://crm.local/api/whatsapp/send", { method: "POST", body: form });
};
const onlyJob = () => [...db.jobs.values()][0] as BulkJob;

beforeEach(() => {
  db.jobs.clear();
  db.campaignMessages.length = 0;
  vi.clearAllMocks();
});

describe("telefone enviado à Meta", () => {
  it("(62) 99273-5920 vira 5562992735920 (E.164 com o 9º dígito, sem duplicar o 55)", () => {
    expect(normalizePhone("(62) 99273-5920")).toBe("5562992735920");
    expect(normalizePhone("5562992735920")).toBe("5562992735920");
    expect(normalizePhone(PHONE)).toBe("5562992735920");
  });
});

describe("envio individual pelo card do pipeline", () => {
  it("manda o modelo à Meta e grava o envio: aparece em /campanhas, nas métricas e no /chat", async () => {
    const response = await POST(sendForm({ phone: PHONE, templateName: "black_friday_11_2026", templateLanguage: "pt_BR", templateParams: "[]", origin: "Pipeline", contactId: CONTACT_ID, recipientName: "BETULIA MOTTA GOMES DE OLIVEIRA" }));
    expect(response.status).toBe(200);
    expect(meta.sendTemplate).toHaveBeenCalledWith(PHONE, "black_friday_11_2026", "pt_BR", [], undefined);

    const job = onlyJob();
    expect(job).toMatchObject({ single: true, status: "completed", total: 1, sent: 1, failed: 0, stageName: "Envio individual · Pipeline" });
    expect(job.items[0]).toMatchObject({ contactId: CONTACT_ID, telefone: PHONE, status: "SENT" });
    expect(toView(job).single).toBe(true);

    // CampaignMessage com o wamid: é por ele que o webhook marca entregue, lida ou falha.
    expect(db.campaignMessages).toEqual([expect.objectContaining({ campaignId: `bulk:${job.id}`, contactId: CONTACT_ID, phone: PHONE, status: "sent", whatsappMsgId: "wamid.HBgMNTU2MjkyNzM1OTIw" })]);
    expect(recordDispatchInChat).toHaveBeenCalledWith(expect.objectContaining({ contactId: CONTACT_ID, phone: "5562992735920", externalId: "wamid.HBgMNTU2MjkyNzM1OTIw" }));
  });

  it("recusa da Meta: operador vê o motivo e o envio fica registrado como falha", async () => {
    meta.sendTemplate.mockRejectedValueOnce(new MetaApiError("Meta WhatsApp API: Recipient phone number not in allowed list", 131026, 400));
    const response = await POST(sendForm({ phone: PHONE, templateName: "black_friday_11_2026", templateParams: "[]", origin: "Pipeline", contactId: CONTACT_ID }));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "Telefone inválido ou sem WhatsApp." });
    expect(onlyJob()).toMatchObject({ sent: 0, failed: 1, items: [expect.objectContaining({ status: "FAILED", error: "Telefone inválido ou sem WhatsApp." })] });
    expect(db.campaignMessages[0]).toMatchObject({ status: "failed", failureReason: "Telefone inválido ou sem WhatsApp." });
    expect(recordDispatchInChat).not.toHaveBeenCalled();
  });

  it("modelo com variável vazia é barrado antes de chegar à Meta", async () => {
    meta.listTemplates.mockResolvedValueOnce([{ name: "aviso", language: "pt_BR", category: "UTILITY", body: "Olá {{1}}, seu óculos está pronto.", headerFormat: null, headerText: "", headerImageUrl: null }]);
    const response = await POST(sendForm({ phone: PHONE, templateName: "aviso", templateParams: JSON.stringify([""]) }));
    expect(response.status).toBe(400);
    expect(meta.sendTemplate).not.toHaveBeenCalled();
  });
});

describe("falha que a Meta avisa depois (webhook)", () => {
  it("o envio aceito passa a falha com o motivo", async () => {
    const job = await recordSingleSend({ userId: "u", userName: "Operador", origin: "Modelos", phone: PHONE, contactId: CONTACT_ID, text: "oi", template: null, messageId: "wamid.1" });
    await markBulkItemFailed(`bulk:${job.id}`, { contactId: CONTACT_ID, phone: PHONE }, "131049: limite de mensagens de marketing para este usuário");
    expect(onlyJob()).toMatchObject({ sent: 0, failed: 1, items: [expect.objectContaining({ status: "FAILED", error: "131049: limite de mensagens de marketing para este usuário" })] });
  });
});
