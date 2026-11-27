import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ human: null as { authorUserId: string | null } | null, ai: false, menu: false, audits: [] as { action: string; userId: string | null; after: unknown }[] }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    chatAudit: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => state.audits),
    },
    chatMessage: {
      findFirst: vi.fn(async ({ where }: { where: { author: string } }) =>
        where.author === "agent" ? state.human : where.author === "bot" ? (state.ai ? { id: "ai" } : null) : (state.menu ? { id: "menu" } : null)),
    },
  },
}));

import { npsAttribution } from "@/lib/chat/nps-attribution";

beforeEach(() => {
  state.human = null;
  state.ai = false;
  state.menu = false;
  state.audits = [];
});

describe("atribuição de NPS por atendimento", () => {
  it("atribui à IA quando apenas ela respondeu, inclusive no encerramento manual", async () => {
    state.ai = true;
    expect(await npsAttribution({ id: "c1", assigneeId: null }, "operator")).toEqual({ responderType: "ai", attendantId: null });
  });

  it("atribui ao humano mesmo se o atendimento voltou para a IA", async () => {
    state.ai = true;
    state.human = { authorUserId: "u1" };
    state.audits = [{ action: "conversation.assume", userId: "u1", after: { assigneeId: "u1" } }];
    expect(await npsAttribution({ id: "c1", assigneeId: null }, null)).toEqual({ responderType: "human", attendantId: "u1" });
  });

  it("não atribui à IA quando um humano assumiu sem responder", async () => {
    state.ai = true;
    state.audits = [{ action: "conversation.assume", userId: "u1", after: { assigneeId: "u1" } }];
    expect(await npsAttribution({ id: "c1", assigneeId: null }, null)).toEqual({ responderType: "human", attendantId: "u1" });
  });

  it("não identifica como IA uma conversa sem resposta da assistente", async () => {
    expect(await npsAttribution({ id: "c1", assigneeId: null }, null)).toEqual({ responderType: null, attendantId: null });
  });
});
