import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  status: "in_progress",
  closedAt: null as Date | null,
  lastMessageAt: new Date("2026-11-19T16:00:00Z"),
}));
const sendAutomaticMessage = vi.hoisted(() => vi.fn(async () => ({ delivery: "sent" })));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    chatConversation: {
      updateMany: async ({ where, data }: {
        where: { id: string; closedAt: null; status: { not: string }; lastMessageAt?: Date | null };
        data: Record<string, unknown>;
      }) => {
        if (state.closedAt || state.status === where.status.not) return { count: 0 };
        if (where.lastMessageAt !== undefined && state.lastMessageAt?.getTime() !== where.lastMessageAt?.getTime()) return { count: 0 };
        Object.assign(state, data);
        return { count: 1 };
      },
    },
    contact: { findUnique: async () => ({ name: "Cliente" }) },
  },
}));

vi.mock("@/lib/chat/conversation", () => ({
  addAudit: vi.fn(),
  addSystemMessage: vi.fn(),
  isWindowOpen: () => true,
  readChatSettings: async () => ({ farewellText: "Até breve" }),
}));

vi.mock("@/lib/chat/outbound", () => ({
  ChatRuleError: class ChatRuleError extends Error {},
  sendAutomaticMessage,
}));

import type { ChatConversation } from "@/generated/prisma/client";
import { closeConversation } from "@/lib/chat/actions";
import { ChatRuleError } from "@/lib/chat/outbound";

const lastMessageAt = new Date("2026-11-19T16:00:00Z");
const conversation = {
  id: "c1",
  contactId: "contact-1",
  phone: "5562999990001",
  status: "in_progress",
  closedAt: null,
  lastMessageAt,
  lastInboundAt: lastMessageAt,
} as unknown as ChatConversation;

beforeEach(() => {
  state.status = "in_progress";
  state.closedAt = null;
  state.lastMessageAt = lastMessageAt;
  sendAutomaticMessage.mockClear();
});

describe("encerramento idempotente", () => {
  it("três tentativas concorrentes encerram e enviam a despedida uma única vez", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 3 }, () => closeConversation(conversation, null, "Encerrado", "Até breve")),
    );

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected" && result.reason instanceof ChatRuleError)).toHaveLength(2);
    expect(sendAutomaticMessage).toHaveBeenCalledTimes(1);
  });

  it("não encerra se uma nova mensagem chegou depois da leitura do cron", async () => {
    state.lastMessageAt = new Date(lastMessageAt.getTime() + 1_000);

    await expect(
      closeConversation(conversation, null, "Encerrado", "Até breve", lastMessageAt),
    ).rejects.toBeInstanceOf(ChatRuleError);

    expect(sendAutomaticMessage).not.toHaveBeenCalled();
    expect(state.status).toBe("in_progress");
  });
});
