import { beforeEach, describe, expect, it, vi } from "vitest";

// Banco em memória: 95 mensagens em 2 atendimentos do mesmo contato, 1 minuto entre cada.
const db = vi.hoisted(() => {
  const base = Date.UTC(2026, 10, 1, 12, 0, 0);
  const messages = Array.from({ length: 95 }, (_, index) => ({
    id: `msg${String(index).padStart(3, "0")}`,
    conversationId: index < 30 ? "c-old" : "c-open",
    author: index % 2 ? "customer" : "agent",
    text: `mensagem ${index}`,
    internal: false,
    attachment: null,
    createdAt: new Date(base + index * 60_000),
  }));
  return { messages, touched: [] as string[] };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const track = vi.hoisted(() => (name: string, fn: (...args: any[]) => unknown) => (...args: any[]) => { db.touched.push(name); return fn(...args); });
vi.mock("server-only", () => ({}));
vi.mock("@/lib/chat/access", () => ({
  requireChatActor: vi.fn(async () => ({ actor: { id: "u1", capabilities: { "chat.viewAll": true }, queueIds: [] } })),
  findScopedConversation: vi.fn(async (_actor: unknown, id: string) => (id === "c-open" ? { id, contactId: "k1", createdAt: new Date(), closedAt: null } : null)),
  scopeWhere: () => ({}),
  conversationNotFound: () => new Response("{}", { status: 404 }),
  chatError: (message: string, status: number) => new Response(JSON.stringify({ error: message }), { status }),
}));
vi.mock("@/lib/chat/outbound", () => ({ ChatRuleError: class extends Error {}, sendAgentMessage: vi.fn() }));
vi.mock("@/lib/chat/serialize", () => ({ serializeMessage: (row: { id: string; createdAt: Date }) => ({ id: row.id, createdAt: row.createdAt.toISOString() }) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    chatConversation: {
      findMany: track("chatConversation.findMany", async () => [
        { id: "c-old", createdAt: new Date(Date.UTC(2026, 10, 1)), closedAt: new Date(Date.UTC(2026, 10, 1, 13)) },
        { id: "c-open", createdAt: new Date(Date.UTC(2026, 10, 1, 13)), closedAt: null },
      ]),
    },
    chatMessage: {
      findMany: track("chatMessage.findMany", async (args: { where: { conversationId: { in: string[] } }; take: number; cursor?: { id: string }; skip?: number }) => {
        const sorted = db.messages
          .filter((row) => args.where.conversationId.in.includes(row.conversationId))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
        const start = args.cursor ? sorted.findIndex((row) => row.id === args.cursor!.id) + (args.skip ?? 0) : 0;
        return sorted.slice(start, start + args.take);
      }),
      update: track("chatMessage.update", async () => ({})),
      updateMany: track("chatMessage.updateMany", async () => ({})),
    },
    campaignMessage: { findMany: track("campaignMessage.findMany", async () => []) },
    crmWorkspaceData: { findUnique: track("crmWorkspaceData.findUnique", async () => null) },
    contact: { findMany: track("contact.findMany", async () => []) },
  },
}));

import { GET } from "@/app/api/chat/conversations/[id]/messages/route";
import { latestMessagesPage, MESSAGE_PAGE_SIZE } from "@/lib/chat/message-page";
import { cachedMessages, clearMessageCache, loadLatestMessages, prefetchMessages } from "@/lib/chat/message-cache";

type Page = { items: { id: string; createdAt: string }[]; nextCursor: string | null };
const get = async (query = "") => (await GET(new Request(`http://crm.test/api/chat/conversations/c-open/messages${query}`), { params: Promise.resolve({ id: "c-open" }) })).json() as Promise<Page>;

beforeEach(() => {
  db.touched.length = 0;
  clearMessageCache();
});

describe("abertura da conversa: só as últimas mensagens, por cursor", () => {
  it("1ª carga traz as últimas 40 em ordem cronológica e o cursor da mais antiga", async () => {
    const page = await get();
    expect(MESSAGE_PAGE_SIZE).toBe(40);
    expect(page.items).toHaveLength(40);
    expect(page.items[0].id).toBe("msg055");
    expect(page.items.at(-1)!.id).toBe("msg094");
    const times = page.items.map((item) => Date.parse(item.createdAt));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(page.nextCursor).toBe("msg055");
  });

  it("rolar para cima pagina sem repetir nem pular, atravessando os atendimentos, até acabar", async () => {
    const seen: string[] = [];
    let page = await get();
    seen.unshift(...page.items.map((item) => item.id));
    while (page.nextCursor) {
      page = await get(`?cursor=${page.nextCursor}`);
      seen.unshift(...page.items.map((item) => item.id));
    }
    expect(seen).toEqual(db.messages.map((row) => row.id));
    expect(page.nextCursor).toBeNull();
  });

  it("caminho crítico isolado: nada de campanha, VMSet, contato ou marcar como lida no GET das mensagens", async () => {
    await get();
    expect(new Set(db.touched)).toEqual(new Set(["chatConversation.findMany", "chatMessage.findMany"]));
  });

  it("latestMessagesPage: página menor que o tamanho não tem cursor", async () => {
    const page = await latestMessagesPage(async () => [{ id: "b" }, { id: "a" }], { sessionIds: ["x"] });
    expect(page).toEqual({ items: [{ id: "a" }, { id: "b" }], nextCursor: null });
  });
});

describe("cache e prefetch no navegador", () => {
  const response = (items: { id: string }[]) => new Response(JSON.stringify({ items, nextCursor: null }), { status: 200 });

  it("hover pré-carrega; o clique logo depois reaproveita (uma requisição só) e reabrir é instantâneo pelo cache", async () => {
    const fetcher = vi.fn(async () => response([{ id: "m1" }])) as unknown as typeof fetch;
    prefetchMessages("c1", fetcher);
    const opened = await loadLatestMessages("c1", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(opened.items).toEqual([{ id: "m1" }]);
    expect(cachedMessages("c1")?.items).toEqual([{ id: "m1" }]);
    // Hover de novo logo depois: cache recente, sem nova requisição.
    prefetchMessages("c1", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("falha no prefetch não quebra nada nem suja o cache", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;
    prefetchMessages("c2", fetcher);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cachedMessages("c2")).toBeNull();
  });
});
