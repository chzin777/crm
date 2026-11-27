import { beforeEach, describe, expect, it, vi } from "vitest";

// Banco em memória: uma conversa sob a IA (status bot, sem atendente), com a janela de 24 h aberta.
const db = vi.hoisted(() => ({
  conversation: null as null | Record<string, unknown>,
  messages: [] as { id: string; conversationId: string; author: string; text: string; internal: boolean; createdAt: Date }[],
  audits: [] as { action: string; targetId: string; createdAt: Date }[],
  dispatch: new Set<string>(),
  scanWhere: null as unknown,
  seq: 0,
}));
const clock = vi.hoisted(() => ({ now: new Date("2026-11-27T15:00:00Z") }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/meta-whatsapp", () => ({ listTemplates: vi.fn(async () => []), sendTemplate: vi.fn(), sendText: vi.fn(), sendMedia: vi.fn(), sendTypingIndicator: vi.fn() }));
vi.mock("@/lib/chat/outbound", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/chat/outbound")>()), sendAutomaticMessage: vi.fn(async () => ({ id: "sent", delivery: "sent" })) }));
vi.mock("@/lib/prisma", () => {
  const conversationRow = () => db.conversation;
  const matches = (row: { conversationId: string; author: string; text: string; internal: boolean; createdAt: Date }, where: Record<string, unknown>) => {
    if (where.conversationId && row.conversationId !== where.conversationId) return false;
    if (typeof where.author === "string" && row.author !== where.author) return false;
    if (typeof where.internal === "boolean" && row.internal !== where.internal) return false;
    const text = where.text as { startsWith?: string } | undefined;
    if (text?.startsWith && !row.text.startsWith(text.startsWith)) return false;
    const created = where.createdAt as { gt?: Date } | undefined;
    if (created?.gt && !(row.createdAt > created.gt)) return false;
    return true;
  };
  return {
    prisma: {
      chatConversation: {
        findUnique: vi.fn(async () => conversationRow()),
        findMany: vi.fn(async (args: { where: unknown }) => { db.scanWhere = args.where; return db.conversation ? [{ ...db.conversation, contact: { name: "Ana", marketingOptOut: false } }] : []; }),
        count: vi.fn(async () => 0),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(db.conversation!, data)),
        updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          if (where.assigneeId === null && db.conversation!.assigneeId) return { count: 0 };
          Object.assign(db.conversation!, data);
          return { count: 1 };
        }),
      },
      chatAgent: { findUnique: vi.fn(async () => null) },
      chatMessage: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: `m${(db.seq += 1)}`, internal: false, createdAt: new Date(clock.now.getTime() + db.seq), ...data } as (typeof db.messages)[number];
          db.messages.push(row);
          return row;
        }),
        findFirst: vi.fn(async ({ where, orderBy }: { where: Record<string, unknown>; orderBy?: unknown }) => {
          const found = db.messages.filter((row) => matches(row, where)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
          void orderBy;
          return found[0] ?? null;
        }),
      },
      chatAudit: {
        create: vi.fn(async ({ data }: { data: { action: string; targetId: string } }) => { const row = { ...data, createdAt: new Date(clock.now.getTime() + (db.seq += 1)) }; db.audits.push(row); return row; }),
        findFirst: vi.fn(async ({ where }: { where: { targetId: string; action: { in: string[] } } }) =>
          db.audits.filter((row) => row.targetId === where.targetId && where.action.in.includes(row.action)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null),
      },
      chatDispatch: {
        createMany: vi.fn(async ({ data }: { data: { key: string }[] }) => { const fresh = !db.dispatch.has(data[0].key); db.dispatch.add(data[0].key); return { count: fresh ? 1 : 0 }; }),
        findUnique: vi.fn(async ({ where }: { where: { key: string } }) => (db.dispatch.has(where.key) ? { key: where.key } : null)),
      },
      crmWorkspaceData: { findUnique: vi.fn(async () => ({ value: { budgetRecovery: { enabled: true, minHours: 4, maxHours: 6, window: { from: 0, to: 24 }, message: "" } } })) },
    },
  };
});

import { canAiRespondToConversation, AI_HANDOFF_MARK } from "@/lib/chat/ai-guard";
import { assumeFor, sendAutomaticMessage } from "@/lib/chat/outbound";
import { resumeAi } from "@/lib/chat/actions";
import { runBudgetRecovery } from "@/lib/commercial/jobs-db";
import { databasePorts } from "@/lib/automations/engine-db";
import type { ChatActor } from "@/lib/chat/access";
import type { ChatConversation } from "@/generated/prisma/client";

const actor = { id: "u-thamyres", name: "Thamyres Lima", capabilities: {}, queueIds: [] } as unknown as ChatActor;
const HOUR = 3_600_000;

beforeEach(() => {
  db.conversation = {
    id: "c1", contactId: "k1", phone: "5562999990000", status: "bot", assigneeId: null, closedAt: null, menuState: { aiActive: true },
    lastMessageAt: new Date(clock.now.getTime() - 5 * HOUR), lastInboundAt: new Date(clock.now.getTime() - 6 * HOUR), campaignId: null,
  };
  db.messages = [];
  db.audits = [];
  db.dispatch = new Set();
  db.scanWhere = null;
  vi.mocked(sendAutomaticMessage).mockClear();
});

describe("guarda única: atendente humano na conversa = IA em silêncio", () => {
  it("atendente assume → Acompanhamento automático pendente é cancelado e nunca dispara", async () => {
    expect(await canAiRespondToConversation("c1")).toBe(true);
    await assumeFor(actor, db.conversation as unknown as ChatConversation);
    expect(db.conversation).toMatchObject({ assigneeId: "u-thamyres", status: "in_progress" });
    expect(db.messages.at(-1)?.text).toBe("Thamyres Lima assumiu a conversa");
    // A trava do acompanhamento desta conversa já fica ocupada: o job não sai nem depois.
    expect(db.dispatch.has("budget-recovery:c1")).toBe(true);
    expect(await canAiRespondToConversation("c1")).toBe(false);
    await runBudgetRecovery(clock.now);
    expect(sendAutomaticMessage).not.toHaveBeenCalled();
    // A varredura já filtra no banco quem tem atendente.
    expect(db.scanWhere).toMatchObject({ assigneeId: null, status: { not: "in_progress" } });
  });

  it("assumida entre a varredura e o envio (job antigo): o estado é relido do banco e nada sai", async () => {
    db.messages.push({ id: "a1", conversationId: "c1", author: "bot", text: "Separei duas opções pra você", internal: false, createdAt: new Date(clock.now.getTime() - 5 * HOUR) });
    // A varredura vê a conversa ainda sem atendente; no banco, ela já foi assumida.
    const scanned = { ...db.conversation };
    db.conversation = { ...db.conversation, assigneeId: "u-thamyres", status: "in_progress" };
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.chatConversation.findMany).mockResolvedValueOnce([{ ...scanned, contact: { name: "Ana", marketingOptOut: false } }] as never);
    await runBudgetRecovery(clock.now);
    expect(sendAutomaticMessage).not.toHaveBeenCalled();
    expect(db.dispatch.has("budget-recovery:c1")).toBe(false);
  });

  it("cliente manda mensagem com a conversa assumida → a IA permanece em silêncio", async () => {
    await assumeFor(actor, db.conversation as unknown as ChatConversation);
    db.messages.push({ id: "c-new", conversationId: "c1", author: "customer", text: "e aí, tem a Ray-Ban?", internal: false, createdAt: new Date(clock.now.getTime() + 10_000) });
    expect(await canAiRespondToConversation("c1")).toBe(false);
  });

  it("automação de /automacoes não escreve por cima do atendente", async () => {
    await assumeFor(actor, db.conversation as unknown as ChatConversation);
    const result = await databasePorts("flow-1").sendWhatsApp({ id: "e1", flowId: "flow-1", contactId: "k1", conversationId: "c1" } as never, { text: "Oi! Ainda tem interesse?" } as never);
    expect(result).toMatch(/atendente humano/);
    expect(sendAutomaticMessage).not.toHaveBeenCalled();
  });

  it("transbordo da IA seguido de resposta humana bloqueia; Devolver para a IA volta a liberar", async () => {
    db.messages.push(
      { id: "h1", conversationId: "c1", author: "system", text: `${AI_HANDOFF_MARK} para Vendas`, internal: true, createdAt: new Date(clock.now.getTime() - 3 * HOUR) },
      { id: "h2", conversationId: "c1", author: "agent", text: "Oi, aqui é a Thamyres", internal: false, createdAt: new Date(clock.now.getTime() - 2 * HOUR) },
    );
    db.conversation = { ...db.conversation, status: "waiting" };
    expect(await canAiRespondToConversation("c1")).toBe(false);
    await assumeFor(actor, db.conversation as unknown as ChatConversation);
    expect(await canAiRespondToConversation("c1")).toBe(false);

    await resumeAi(actor, db.conversation as unknown as ChatConversation);
    expect(db.conversation).toMatchObject({ assigneeId: null, status: "bot" });
    expect(db.messages.at(-1)?.text).toBe("Thamyres Lima devolveu a conversa para a IA");
    expect(await canAiRespondToConversation("c1")).toBe(true);
  });
});
