import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const attribution = vi.hoisted(() => ({ value: null as { responderType: "ai" | "human" | null; attendantId: string | null } | null }));
vi.mock("@/lib/chat/nps-attribution", () => ({ npsAttribution: async (_conversation: unknown, attendantId: string | null) => attribution.value ?? ({ responderType: attendantId ? "human" : null, attendantId }) }));

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  feedbacks: [] as Record<string, unknown>[],
  messages: [] as Record<string, unknown>[],
  dispatches: [] as string[],
  openConversation: false,
  conversationStatus: "closed",
  closedAt: new Date("2026-11-19T18:00:00Z"),
  seq: 0,
}));

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
      chatConversation: {
        findFirst: async () => (db.openConversation ? { id: "aberta" } : null),
        findUnique: async () => ({ status: db.conversationStatus, closedAt: db.closedAt }),
      },
      chatMessage: {
        create: async ({ data }: { data: Row }) => { db.messages.push(data); return data; },
        findFirst: async ({ where }: { where: { conversationId: string; createdAt: { gt: Date } } }) =>
          db.messages.find((row) => row.conversationId === where.conversationId && ["customer", "agent"].includes(String(row.author)) && (row.createdAt as Date) > where.createdAt.gt) ?? null,
      },
      contact: { findUnique: async () => ({ name: "MARIA DAS GRAÇAS SILVA" }) },
    },
  };
});

const sent = vi.hoisted(() => [] as string[]);
const lists = vi.hoisted(() => [] as { button: string; footer?: string; body: string; rows: { id: string; title: string }[] }[]);
vi.mock("@/lib/chat/outbound", () => ({
  sendAutomaticMessage: vi.fn(async (_conversation: unknown, text: string, send?: () => Promise<unknown>) => { sent.push(text); if (send) await send(); return { delivery: "sent" }; }),
  resendAutomatic: vi.fn(),
}));
vi.mock("@/lib/meta-whatsapp", () => ({
  sendText: vi.fn(async (_phone: string, text: string) => { sent.push(text); return {}; }),
  sendList: vi.fn(async (_phone: string, list: (typeof lists)[number]) => { lists.push(list); return { messages: [{ id: "wamid.lista" }] }; }),
}));
vi.mock("@/lib/chat/conversation", async () => {
  const { DEFAULT_CHAT_SETTINGS } = await import("@/lib/chat/settings");
  return {
    firstDispatch: async (key: string) => {
      if (db.dispatches.includes(key)) return false;
      db.dispatches.push(key);
      return true;
    },
    isWindowOpen: () => true,
    readChatSettings: async () => DEFAULT_CHAT_SETTINGS,
  };
});

import { recordSurveyReply, releaseAutomationSurvey, reserveAutomationSurvey, sendSatisfactionSurvey } from "@/lib/chat/nps";
import { NPS_LIST_BUTTON, NPS_TEMPLATES, npsDeliveryMode } from "@/lib/nps-scale";
import type { ChatConversation } from "@/generated/prisma/client";
import { DEFAULT_CHAT_SETTINGS } from "@/lib/chat/settings";

const PHONE = "5562999990001";
const reply = (text: string, minutes = 1, id = `w${Math.random()}`) => ({ externalId: id, phone: PHONE, text, isText: true, receivedAt: new Date(Date.now() + minutes * 60_000) });

beforeEach(() => {
  db.feedbacks = [];
  db.messages = [];
  db.dispatches = [];
  db.openConversation = false;
  db.conversationStatus = "closed";
  db.closedAt = new Date("2026-11-19T18:00:00Z");
  sent.length = 0;
  lists.length = 0;
  attribution.value = null;
});

describe("NPS híbrido: lista interativa na janela de 24 h, modelo oficial fora dela", () => {
  const conversation = { id: "aberta", phone: PHONE, contactId: "c1", lastInboundAt: new Date() } as unknown as ChatConversation;

  it("mantém a autoria da IA ou do humano ao gravar a pesquisa e a resposta", async () => {
    for (const owner of [{ responderType: "ai" as const, attendantId: null }, { responderType: "human" as const, attendantId: "u1" }]) {
      db.dispatches = [];
      attribution.value = owner;
      await sendSatisfactionSurvey(conversation, null);
      expect(await recordSurveyReply(reply("10"))).toBe(true);
      expect(db.feedbacks.at(-1)).toMatchObject({ ...owner, status: "ANSWERED", score: 10 });
    }
  });

  it("janela aberta: envia lista interativa com o botão Avaliar agora, notas de 10 a 1 e o 0 digitado", async () => {
    expect(npsDeliveryMode({ windowOpen: true, hasTemplate: true })).toBe("list");
    await sendSatisfactionSurvey(conversation, "u1");
    expect(lists).toHaveLength(1);
    const [list] = lists;
    expect(list.button).toBe(NPS_LIST_BUTTON);
    expect(NPS_LIST_BUTTON).toBe("Avaliar agora");
    expect(list.rows.map((row) => row.id)).toEqual(["nps_10", "nps_9", "nps_8", "nps_7", "nps_6", "nps_5", "nps_4", "nps_3", "nps_2", "nps_1"]);
    expect(list.footer).toContain("responder 0");
    expect(list.body).toMatch(/^Olá, Maria! 😊 Passando rapidinho/);
    expect(list.body).not.toMatch(/[–—]|\s-\s/);
    expect(db.feedbacks).toHaveLength(1);
    expect(db.feedbacks[0]).toMatchObject({ status: "PENDING", surveyType: "ATENDIMENTO", conversationId: "aberta" });
  });

  it("três execuções para a mesma conversa fechada enviam no máximo uma pesquisa", async () => {
    await Promise.all([
      sendSatisfactionSurvey(conversation, "u1"),
      sendSatisfactionSurvey(conversation, "u1"),
      sendSatisfactionSurvey(conversation, "u1"),
    ]);

    expect(lists).toHaveLength(1);
    expect(db.feedbacks).toHaveLength(1);
  });

  it("não envia pesquisa se a conversa ainda não foi encerrada", async () => {
    db.conversationStatus = "in_progress";

    await sendSatisfactionSurvey(conversation, "u1");

    expect(lists).toHaveLength(0);
    expect(db.dispatches).toHaveLength(0);
  });

  it("janela fechada: cai no modelo oficial aprovado (sem modelo, não envia); copy sem travessões nem hífens", () => {
    expect(npsDeliveryMode({ windowOpen: false, hasTemplate: true })).toBe("template");
    expect(npsDeliveryMode({ windowOpen: false, hasTemplate: false })).toBeNull();
    for (const template of Object.values(NPS_TEMPLATES)) {
      expect(template.body.startsWith("Olá, {{1}}! 😊")).toBe(true);
      expect(template.body).toContain("0 a 6 baixa, 7 e 8 boa e 9 e 10 excelente");
      expect(template.body).not.toMatch(/[–—-]/);
      expect(template.name).toMatch(/^[a-z0-9_]+$/);
    }
    expect(NPS_TEMPLATES.PRODUTO_ADAPTACAO.body).toContain("30 dias");
  });

  it("o mesmo disparo aceita o toque na lista (list_reply) mesmo com a conversa aberta", async () => {
    db.openConversation = true;
    await sendSatisfactionSurvey(conversation, "u1");
    expect(await recordSurveyReply({ ...reply("Nota 9"), choiceId: "nps_9", isText: false })).toBe(true);
    expect(db.feedbacks[0]).toMatchObject({ status: "ANSWERED", score: 9 });
    // Agradece a nota e convida ao comentário opcional.
    expect(sent.at(-1)).toBe(DEFAULT_CHAT_SETTINGS.npsCommentText);
  });

  it("o mesmo disparo aceita o número digitado (0 a 10) quando o cliente ignora a lista", async () => {
    db.openConversation = true;
    await sendSatisfactionSurvey(conversation, "u1");
    expect(await recordSurveyReply(reply("0"))).toBe(true);
    expect(db.feedbacks[0]).toMatchObject({ status: "ANSWERED", score: 0 });
    expect(sent.at(-1)).toBe(DEFAULT_CHAT_SETTINGS.npsCommentText);
  });

  it("com a conversa aberta e o cliente já falando de outra coisa, um número digitado vai para o atendente", async () => {
    db.openConversation = true;
    await sendSatisfactionSurvey(conversation, "u1");
    db.messages.push({ conversationId: "aberta", author: "customer", text: "quero ver armações", createdAt: new Date(Date.now() + 30_000) });
    expect(await recordSurveyReply(reply("2", 2))).toBe(false);
    expect(db.feedbacks[0]).toMatchObject({ status: "EXPIRED" });
  });
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
