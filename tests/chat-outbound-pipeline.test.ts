import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(),
  updates: [] as Record<string, unknown>[],
  sentTo: [] as string[],
  fail: null as null | { code: number; times: number },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    chatMessage: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { const row = { id: `m${db.rows.size + 1}`, ...data }; db.rows.set(row.id, row); return row; }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => { db.updates.push(data); const row = Object.assign(db.rows.get(where.id)!, data); return row; }),
    },
    chatConversation: { update: vi.fn(async () => ({})) },
  },
}));
vi.mock("@/lib/chat/conversation", () => ({ isBlocked: vi.fn(async () => false), addAudit: vi.fn(), addSystemMessage: vi.fn(), isWindowOpen: vi.fn(() => true) }));
vi.mock("@/lib/minio", () => ({ readFile: vi.fn(), uploadFile: vi.fn() }));
vi.mock("@/lib/chat/audio", () => ({ convertToOggOpus: vi.fn() }));
vi.mock("@/lib/chat/operator-presence", () => ({ readOperatorSettings: vi.fn(async () => ({ signMessagesWithName: false })) }));
vi.mock("@/lib/ai/product-image", () => ({ deliverImageOrText: vi.fn(), downloadImage: vi.fn() }));
// Meta: normalização real; o POST devolve o wamid do destinatário que a Meta recebeu.
vi.mock("@/lib/meta-whatsapp", async () => {
  const actual = await vi.importActual<typeof import("@/lib/meta-whatsapp")>("@/lib/meta-whatsapp");
  return {
    ...actual,
    sendText: vi.fn(async (phone: string) => {
      const to = actual.normalizePhone(phone);
      db.sentTo.push(to);
      if (db.fail && db.fail.times > 0) {
        db.fail.times -= 1;
        throw new actual.MetaApiError("Meta WhatsApp API: (#131000) Something went wrong", db.fail.code, 500);
      }
      return { messages: [{ id: `wamid.${to}.${db.sentTo.length}` }] };
    }),
  };
});
vi.mock("@/lib/chat/meta-failure", async () => {
  const actual = await vi.importActual<typeof import("@/lib/chat/meta-failure")>("@/lib/chat/meta-failure");
  // Sem esperar 2 s / 5 s de verdade no teste.
  return { ...actual, sendWithRetry: <T,>(send: () => Promise<T>) => actual.sendWithRetry(send, [2000, 5000], async () => {}) };
});

import { sendAutomaticMessage } from "@/lib/chat/outbound";
import { AI_AUTHOR_NAME } from "@/lib/ai/sanitize";

describe("resposta do Assistente IA no mesmo pipeline do atendimento", () => {
  beforeEach(() => { db.rows.clear(); db.updates = []; db.sentTo = []; db.fail = null; });

  it("grava como enviando, envia ao wa_id exato do cliente estrangeiro e registra o wamid logo após o POST", async () => {
    const sent = await sendAutomaticMessage({ id: "conv-ana", phone: "353830920584" }, "Boa tarde, Ana!", undefined, undefined, AI_AUTHOR_NAME);
    // Antes: "55353830920584" (55 forçado na frente) e a Meta devolvia 131026.
    expect(db.sentTo).toEqual(["353830920584"]);
    expect(sent).toMatchObject({ author: "bot", authorName: AI_AUTHOR_NAME, delivery: "sent", externalId: "wamid.353830920584.1", failureReason: null });
    expect(db.updates).toEqual([{ delivery: "sent", failureReason: null, externalId: "wamid.353830920584.1" }]);
  });

  it("celular brasileiro sai como veio no webhook (com ou sem o 9), sem trocar o formato", async () => {
    await sendAutomaticMessage({ id: "c1", phone: "556284341780" }, "Oi", undefined, undefined, AI_AUTHOR_NAME);
    await sendAutomaticMessage({ id: "c2", phone: "5562984341780" }, "Oi", undefined, undefined, AI_AUTHOR_NAME);
    expect(db.sentTo).toEqual(["556284341780", "5562984341780"]);
  });

  it("erro passageiro da Meta (131000) tenta de novo sozinho e grava o wamid da tentativa que passou", async () => {
    db.fail = { code: 131000, times: 2 };
    const sent = await sendAutomaticMessage({ id: "c3", phone: "5562984341780" }, "Oi", undefined, undefined, AI_AUTHOR_NAME);
    expect(db.sentTo).toHaveLength(3);
    expect(sent).toMatchObject({ delivery: "sent", externalId: "wamid.5562984341780.3" });
  });
});
