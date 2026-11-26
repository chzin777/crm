import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Row = { id: string; externalId: string | null; author: string; internal: boolean; text: string; attachment: unknown; metaMedia: Record<string, unknown> | null; delivery: string; failureReason: string | null; conversationId: string };

const db = vi.hoisted(() => ({
  messages: [] as Row[],
  conversation: { id: "conv-1", phone: "5562984341780", contact: { id: "contact-1", phone: "(62) 98434-1780" } },
  contactUpdates: [] as { id: string; phone: string }[],
  dispatched: new Set<string>(),
  sends: [] as { to: string; text: string }[],
  nextSendId: 1,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    chatMessage: {
      findUnique: vi.fn(async ({ where }: { where: { externalId: string } }) => {
        const row = db.messages.find((message) => message.externalId === where.externalId);
        return row ? { ...row, conversation: db.conversation } : null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const row = db.messages.find((message) => message.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
    },
    chatConversation: { update: vi.fn(async ({ data }: { data: { phone: string } }) => { db.conversation.phone = data.phone; return db.conversation; }) },
    contact: { update: vi.fn(async ({ where, data }: { where: { id: string }; data: { phone: string } }) => { db.contactUpdates.push({ id: where.id, phone: data.phone }); db.conversation.contact.phone = data.phone; return {}; }) },
  },
}));
vi.mock("@/lib/chat/conversation", () => ({
  isBlocked: vi.fn(async () => false),
  firstDispatch: vi.fn(async (key: string) => { if (db.dispatched.has(key)) return false; db.dispatched.add(key); return true; }),
}));
vi.mock("@/lib/meta-whatsapp", () => ({
  sendText: vi.fn(async (to: string, text: string) => { db.sends.push({ to, text }); return { messages: [{ id: `wamid.retry${db.nextSendId++}` }] }; }),
}));

import { alternateBrazilianPhone, getBrazilianPhoneVariants } from "@/lib/chat/phone";
import { describeFailure, metaErrorCode, sendWithRetry, withMetaCode } from "@/lib/chat/meta-failure";
import { BOTH_VARIANTS_TAG, confirmPhoneFallback, tryPhoneFallback, withLateMessage } from "@/lib/chat/phone-fallback";

describe("variantes do 9º dígito (Brasil)", () => {
  it("gera a forma com e sem o 9 para celulares, incluindo DDD 62", () => {
    expect(getBrazilianPhoneVariants("5562984341780")).toEqual(["5562984341780", "556284341780"]);
    expect(getBrazilianPhoneVariants("556284341780")).toEqual(["556284341780", "5562984341780"]);
    expect(getBrazilianPhoneVariants("+55 (11) 98765-4321")).toEqual(["5511987654321", "551187654321"]);
    expect(alternateBrazilianPhone("556284341780")).toBe("5562984341780");
  });

  it("fixo e número estrangeiro não têm variante", () => {
    expect(getBrazilianPhoneVariants("556232345678")).toEqual(["556232345678"]);
    expect(alternateBrazilianPhone("353871234567")).toBeNull();
  });
});

describe("motivo da falha em português", () => {
  it("traduz o 131026 e guarda o código para o tooltip", () => {
    const reason = withMetaCode(131026, "Message Undeliverable.");
    expect(reason).toBe("(#131026) Message Undeliverable.");
    const described = describeFailure(reason);
    expect(described).toMatchObject({ text: "Não entregue pelo WhatsApp (número incompatível ou indisponível no momento)", code: 131026 });
    expect(described.detail).toMatch(/^Erro 131026 · Causas comuns: termos do WhatsApp não aceitos/);
    expect(metaErrorCode("Message Undeliverable.")).toBe(131026);
    expect(describeFailure(null).text).toBe("Falha no envio");
  });

  it("tenta de novo só em erro passageiro, no máximo 2 vezes", async () => {
    const sleeps: number[] = [];
    const sleep = async (ms: number) => { sleeps.push(ms); };
    let calls = 0;
    const flaky = () => { calls += 1; return calls < 3 ? Promise.reject(Object.assign(new Error("x"), { code: 131000 })) : Promise.resolve("ok"); };
    await expect(sendWithRetry(flaky, [2000, 5000], sleep)).resolves.toBe("ok");
    expect(sleeps).toEqual([2000, 5000]);
    calls = 0;
    await expect(sendWithRetry(() => { calls += 1; return Promise.reject(Object.assign(new Error("y"), { code: 131026 })); }, [2000, 5000], sleep)).rejects.toThrow("y");
    expect(calls).toBe(1);
  });
});

describe("webhook failed 131026: reenvio pela variante do 9º dígito", () => {
  beforeEach(() => {
    db.messages = [{ id: "m1", externalId: "wamid.orig", author: "bot", internal: false, text: "Boa tarde, Ana!", attachment: null, metaMedia: null, delivery: "failed", failureReason: "(#131026) Message Undeliverable.", conversationId: "conv-1" }];
    db.conversation = { id: "conv-1", phone: "5562984341780", contact: { id: "contact-1", phone: "(62) 98434-1780" } };
    db.contactUpdates = [];
    db.dispatched = new Set();
    db.sends = [];
    db.nextSendId = 1;
  });

  it("reenvia sem o 9 e, entregue, atualiza o número da conversa e do contato", async () => {
    const updated = await tryPhoneFallback("wamid.orig", 131026);
    expect(db.sends).toEqual([{ to: "556284341780", text: "Boa tarde, Ana!" }]);
    expect(updated).toMatchObject({ delivery: "sent", failureReason: null, externalId: "wamid.retry1" });
    expect(await confirmPhoneFallback("wamid.retry1")).toBe(true);
    expect(db.conversation.phone).toBe("556284341780");
    expect(db.contactUpdates).toEqual([{ id: "contact-1", phone: "556284341780" }]);
    // Confirmação repetida (delivered e depois read) não refaz nada.
    expect(await confirmPhoneFallback("wamid.retry1")).toBe(false);
  });

  it("no máximo 1 tentativa: a variante que também falha não gera novo reenvio", async () => {
    await tryPhoneFallback("wamid.orig", 131026);
    expect(await tryPhoneFallback("wamid.retry1", 131026)).toBeNull();
    expect(await tryPhoneFallback("wamid.orig", 131026)).toBeNull();
    expect(db.sends).toHaveLength(1);
  });

  it("as duas formas recusadas ficam marcadas e a bolha explica a restrição no aparelho do cliente", async () => {
    await tryPhoneFallback("wamid.orig", 131026);
    // Webhook da variante: o motivo é regravado com o código e depois o fallback marca "testado com e sem o 9º dígito".
    Object.assign(db.messages[0], { delivery: "failed", failureReason: "(#131026) Message Undeliverable." });
    await tryPhoneFallback("wamid.retry1", 131026);
    expect(db.messages[0].failureReason).toBe(`(#131026) Message Undeliverable. ${BOTH_VARIANTS_TAG}`);
    expect(db.messages[0].metaMedia).toMatchObject({ phoneFallback: { from: "5562984341780", to: "556284341780", failed: true } });
    const described = describeFailure(db.messages[0].failureReason);
    expect(described.text).toBe("Não entregue com e sem o 9º dígito: restrição no WhatsApp do cliente");
    expect(described.detail).toContain("As duas formas do número foram testadas");
    expect(db.sends).toHaveLength(1);
  });

  it("webhook failed que chega antes do wamid ser gravado espera a mensagem e dispara o fallback", async () => {
    const pending = db.messages[0];
    pending.externalId = null;
    pending.delivery = "sending";
    const waits: number[] = [];
    const markFailed = async () => {
      const row = db.messages.find((message) => message.externalId === "wamid.orig");
      if (!row) return { count: 0 };
      Object.assign(row, { delivery: "failed", failureReason: "(#131026) Message Undeliverable." });
      return { count: 1 };
    };
    // O envio grava o wamid enquanto o webhook espera (300 ms na vida real).
    const result = await withLateMessage("wamid.orig", markFailed, async (ms) => { waits.push(ms); pending.externalId = "wamid.orig"; });
    expect(result.count).toBe(1);
    expect(waits).toEqual([300]);
    expect(pending.delivery).toBe("failed");
    await tryPhoneFallback("wamid.orig", 131026);
    expect(db.sends).toEqual([{ to: "556284341780", text: "Boa tarde, Ana!" }]);
  });

  it("desiste em 1,5 s quando a mensagem não é do atendimento (status de outro envio)", async () => {
    const waits: number[] = [];
    const result = await withLateMessage("wamid.outro", async () => ({ count: 0 }), async (ms) => { waits.push(ms); });
    expect(result.count).toBe(0);
    expect(waits.reduce((sum, ms) => sum + ms, 0)).toBe(1500);
  });

  it("ignora outros códigos, modelos de campanha e números sem variante", async () => {
    expect(await tryPhoneFallback("wamid.orig", 131049)).toBeNull();
    db.messages[0].metaMedia = { template: { name: "black_friday" } };
    expect(await tryPhoneFallback("wamid.orig", 131026)).toBeNull();
    db.messages[0].metaMedia = null;
    db.conversation.phone = "353871234567";
    expect(await tryPhoneFallback("wamid.orig", 131026)).toBeNull();
    expect(db.sends).toHaveLength(0);
  });
});
