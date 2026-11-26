import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({ feedbacks: [] as Record<string, unknown>[], messages: [] as Record<string, unknown>[], openConversation: false, seq: 0 }));

/** Filtro mínimo do Prisma usado pela pesquisa: igualdade, null, { in }, { gte }, { lt }, { not }. */
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, condition]) => {
    const value = row[key];
    if (condition === null) return value === null || value === undefined;
    if (condition && typeof condition === "object" && !(condition instanceof Date)) {
      const rule = condition as { in?: unknown[]; gte?: Date; lt?: Date; not?: unknown };
      if (rule.in && !rule.in.includes(value)) return false;
      if (rule.gte && !(value instanceof Date && value >= rule.gte)) return false;
      if (rule.lt && !(value instanceof Date && value < rule.lt)) return false;
      if ("not" in rule && value === rule.not) return false;
      return true;
    }
    return value === condition;
  });
}

vi.mock("@/lib/prisma", async () => {
  const { Prisma } = await import("@/generated/prisma/client");
  const latest = (rows: Row[]) => [...rows].sort((a, b) => Number(b.seq) - Number(a.seq))[0] ?? null;
  return {
    prisma: {
      npsFeedback: {
        findFirst: async ({ where }: { where: Row }) => latest(db.feedbacks.filter((row) => matches(row, where))),
        create: async ({ data }: { data: Row }) => {
          if (data.orderKey && db.feedbacks.some((row) => row.orderKey === data.orderKey && row.surveyType === data.surveyType)) {
            throw new Prisma.PrismaClientKnownRequestError("duplicado", { code: "P2002", clientVersion: "test" });
          }
          const row = { id: `f${++db.seq}`, seq: db.seq, status: "PENDING", score: null, comment: null, conversationId: null, answeredAt: null, createdAt: new Date(), ...data };
          db.feedbacks.push(row);
          return row;
        },
        update: async ({ where, data }: { where: Row; data: Row }) => Object.assign(db.feedbacks.find((row) => row.id === where.id)!, data),
        updateMany: async ({ where, data }: { where: Row; data: Row }) => {
          const rows = db.feedbacks.filter((row) => matches(row, where));
          rows.forEach((row) => Object.assign(row, data));
          return { count: rows.length };
        },
        deleteMany: async ({ where }: { where: Row }) => {
          const before = db.feedbacks.length;
          db.feedbacks = db.feedbacks.filter((row) => !matches(row, where));
          return { count: before - db.feedbacks.length };
        },
      },
      chatConversation: { findFirst: async () => (db.openConversation ? { id: "aberta" } : null) },
      chatMessage: { create: async ({ data }: { data: Row }) => { db.messages.push(data); return data; } },
    },
  };
});

const sent = vi.hoisted(() => [] as string[]);
vi.mock("@/lib/chat/outbound", () => ({
  sendAutomaticMessage: vi.fn(async (_conversation: unknown, text: string) => { sent.push(text); return { delivery: "sent" }; }),
  resendAutomatic: vi.fn(),
}));
vi.mock("@/lib/meta-whatsapp", () => ({ sendText: vi.fn(async (_phone: string, text: string) => { sent.push(text); return {}; }), sendList: vi.fn() }));
vi.mock("@/lib/chat/conversation", async () => {
  const { DEFAULT_CHAT_SETTINGS } = await import("@/lib/chat/settings");
  return { isWindowOpen: () => true, readChatSettings: async () => DEFAULT_CHAT_SETTINGS };
});

import { recordSurveyReply, releaseAutomationSurvey, reserveAutomationSurvey } from "@/lib/chat/nps";
import { DEFAULT_CHAT_SETTINGS } from "@/lib/chat/settings";

const PHONE = "5562999990001";
const reply = (text: string, minutes = 1, id = `w${Math.random()}`) => ({ externalId: id, phone: PHONE, text, isText: true, receivedAt: new Date(Date.now() + minutes * 60_000) });

beforeEach(() => {
  db.feedbacks = [];
  db.messages = [];
  db.openConversation = false;
  sent.length = 0;
});

describe("pesquisa NPS no WhatsApp (0 a 10)", () => {
  it("nota 9 é gravada, recebe o convite ao comentário e o comentário fica salvo com agradecimento", async () => {
    const survey = await reserveAutomationSurvey({ contactId: "c1", phone: PHONE, surveyType: "ATENDIMENTO", orderKey: "Centro-100" });
    expect(survey).not.toBeNull();

    expect(await recordSurveyReply(reply("9"))).toBe(true);
    expect(db.feedbacks[0]).toMatchObject({ status: "ANSWERED", score: 9, scale: 10, surveyType: "ATENDIMENTO", source: "automacao" });
    expect(sent).toEqual([DEFAULT_CHAT_SETTINGS.npsCommentText]);

    expect(await recordSurveyReply(reply("A vendedora foi muito atenciosa!", 3))).toBe(true);
    expect(db.feedbacks[0].comment).toBe("A vendedora foi muito atenciosa!");
    expect(sent).toEqual([DEFAULT_CHAT_SETTINGS.npsCommentText, DEFAULT_CHAT_SETTINGS.npsThanksText]);
  });

  it("nota 10 também pode comentar; depois do prazo de 10 minutos o texto segue o fluxo normal", async () => {
    await reserveAutomationSurvey({ contactId: "c1", phone: PHONE, surveyType: "PRODUTO_ADAPTACAO", orderKey: "Centro-200" });
    expect(await recordSurveyReply(reply("10"))).toBe(true);
    expect(await recordSurveyReply(reply("Quero comprar outro par", 30))).toBe(false);
    expect(db.feedbacks[0]).toMatchObject({ score: 10, comment: null });
  });

  it("frase que não é nota encerra a pesquisa sem consumir a mensagem", async () => {
    await reserveAutomationSurvey({ contactId: "c1", phone: PHONE, surveyType: "ATENDIMENTO", orderKey: "Centro-300" });
    expect(await recordSurveyReply(reply("quero 2 óculos"))).toBe(false);
    expect(db.feedbacks[0].status).toBe("EXPIRED");
  });

  it("com atendimento aberto o número é para o atendente, não para a pesquisa", async () => {
    await reserveAutomationSurvey({ contactId: "c1", phone: PHONE, surveyType: "ATENDIMENTO", orderKey: "Centro-400" });
    db.openConversation = true;
    expect(await recordSurveyReply(reply("8"))).toBe(false);
    expect(db.feedbacks[0].score).toBeNull();
  });

  it("pesquisa antiga de 1 a 5 ainda pendente continua lendo a escala antiga", async () => {
    db.feedbacks.push({ id: "old", seq: 0, phone: PHONE, status: "PENDING", scale: 5, source: "chat", surveyType: "ATENDIMENTO", conversationId: "conv", createdAt: new Date(), score: null, comment: null });
    expect(await recordSurveyReply(reply("5 - Muito satisfeito"))).toBe(true);
    expect(db.feedbacks[0]).toMatchObject({ score: 5, status: "ANSWERED" });
  });
});

describe("idempotência por pedido e tipo de pesquisa", () => {
  it("a mesma pesquisa nunca é reservada duas vezes para o mesmo pedido; o outro tipo pode", async () => {
    expect(await reserveAutomationSurvey({ contactId: "c1", phone: PHONE, surveyType: "ATENDIMENTO", orderKey: "Centro-500" })).not.toBeNull();
    expect(await reserveAutomationSurvey({ contactId: "c1", phone: PHONE, surveyType: "ATENDIMENTO", orderKey: "Centro-500" })).toBeNull();
    expect(await reserveAutomationSurvey({ contactId: "c1", phone: PHONE, surveyType: "PRODUTO_ADAPTACAO", orderKey: "Centro-500" })).not.toBeNull();
  });

  it("envio que falhou libera a reserva para nova tentativa", async () => {
    const survey = await reserveAutomationSurvey({ contactId: "c1", phone: PHONE, surveyType: "ATENDIMENTO", orderKey: "Centro-600" });
    await releaseAutomationSurvey(survey!.id);
    expect(await reserveAutomationSurvey({ contactId: "c1", phone: PHONE, surveyType: "ATENDIMENTO", orderKey: "Centro-600" })).not.toBeNull();
  });
});
