import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  conversations: new Map<string, Record<string, unknown>>(),
  messages: [] as Record<string, unknown>[],
  audits: [] as Record<string, unknown>[],
  systemMessages: [] as { id: string; text: string }[],
  deletedNotifications: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => {
  const client = {
    chatConversation: {
      findFirst: vi.fn(async () => null),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => state.conversations.get(where.id) ?? null),
      deleteMany: vi.fn(async ({ where }: { where: { id: string } }) => {
        const had = state.conversations.delete(where.id);
        state.messages = state.messages.filter((row) => row.conversationId !== where.id);
        return { count: had ? 1 : 0 };
      }),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    chatMessage: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { state.messages.push(data); return data; }),
      count: vi.fn(async ({ where }: { where: { conversationId: string; author?: string; authorName?: null } }) =>
        state.messages.filter((row) => row.conversationId === where.conversationId && (where.author === undefined || row.author === where.author) && (!("authorName" in where) || (row.authorName ?? null) === where.authorName)).length),
    },
    chatNotification: { deleteMany: vi.fn(async ({ where }: { where: { conversationId: string } }) => { state.deletedNotifications.push(where.conversationId); return { count: 0 }; }) },
    $transaction: vi.fn(async (run: (tx: unknown) => Promise<unknown>) => run(client)),
  };
  return { prisma: client };
});
vi.mock("@/lib/ai/openai", () => ({ aiConfigured: () => true, aiJson: vi.fn() }));
vi.mock("@/lib/ai/multimodal", () => ({ imageMime: () => null }));
vi.mock("@/lib/ai/sales-consultant", () => ({ isGenericInterest: () => false }));
vi.mock("@/lib/ai/store", () => ({ readAiSettings: vi.fn(async () => ({ triageEnabled: true })) }));
vi.mock("@/lib/chat/menu", () => ({ readMenuState: vi.fn(async () => null) }));
vi.mock("@/lib/chat/events", () => ({ notifyChatChange: vi.fn() }));
// Encerrar (closeConversation) é o que dispara NPS/despedida e conta como atendimento concluído: nunca pode ser chamado.
const closeConversation = vi.hoisted(() => vi.fn());
vi.mock("@/lib/chat/actions", () => ({ closeConversation }));
vi.mock("@/lib/chat/conversation", () => ({
  addAudit: vi.fn(async (entry: Record<string, unknown>) => { state.audits.push(entry); }),
  addSystemMessage: vi.fn(async (id: string, text: string) => { state.systemMessages.push({ id, text }); }),
}));

import { absorbNoise, NOT_CAMPAIGN_REPLY } from "@/lib/chat/noise-db";
import { AUTO_REPLY_AUTHOR } from "@/lib/chat/auto-reply";

const conversation = (id: string, extra: Record<string, unknown> = {}) =>
  state.conversations.set(id, { id, contactId: "ct1", phone: "5562981000000", status: "open", queueId: null, assigneeId: null, closedAt: null, campaignId: "camp-1", ...extra });
const absorb = (openConversationId: string | null, externalId = "wamid.in1") =>
  absorbNoise({ kind: "auto_resposta", phone: "5562981000000", openConversationId, externalId, text: "Agradecemos sua mensagem. Não estamos disponíveis no momento.", receivedAt: new Date(), attachment: null, authorName: AUTO_REPLY_AUTHOR, campaignReason: "ausência do WhatsApp Business" });

beforeEach(() => {
  state.conversations.clear();
  state.messages = [];
  state.audits = [];
  state.systemMessages = [];
  state.deletedNotifications = [];
  closeConversation.mockClear();
});

describe("triagem pós-campanha: resposta automática é excluída, não encerrada", () => {
  it("exclui a conversa com o motivo, sem encerrar (sem NPS/mensagem) e sem entrar nos encerrados", async () => {
    conversation("conv-robo");
    await absorb("conv-robo");

    expect(state.conversations.has("conv-robo")).toBe(false);
    expect(state.deletedNotifications).toEqual(["conv-robo"]);
    expect(closeConversation).not.toHaveBeenCalled();
    expect(state.systemMessages).toHaveLength(0);
    expect(state.audits).toHaveLength(1);
    expect(state.audits[0]).toMatchObject({ action: "conversation.not_campaign_reply", targetId: "conv-robo", after: { motivo: NOT_CAMPAIGN_REPLY, excluida: true } });
    expect(NOT_CAMPAIGN_REPLY).toBe("Não é resposta da campanha");
  });

  it("conversa com mensagem real do cliente não é excluída (só a mensagem automática fica ignorada)", async () => {
    conversation("conv-pessoa");
    state.messages.push({ conversationId: "conv-pessoa", author: "customer", authorName: null, text: "Oi" });
    await absorb("conv-pessoa");
    expect(state.conversations.has("conv-pessoa")).toBe(true);
    expect(closeConversation).not.toHaveBeenCalled();
  });

  it("conversa já com atendente não é excluída", async () => {
    conversation("conv-atendida", { assigneeId: "user-1" });
    await absorb("conv-atendida");
    expect(state.conversations.has("conv-atendida")).toBe(true);
  });

  it("depois da exclusão não sobra conversa nem bloqueio: a próxima mensagem real abre uma conversa nova", async () => {
    conversation("conv-robo");
    await absorb("conv-robo");
    // Nada do contato fica aberto (o inbound cria conversa nova para a próxima mensagem de pessoa).
    expect([...state.conversations.values()].filter((row) => row.phone === "5562981000000")).toHaveLength(0);
    expect(state.messages).toHaveLength(0);
  });
});
