import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  actions: new Map<string, Record<string, unknown>>(),
  system: [] as string[],
  audits: [] as { userId: string | null; action: string; targetId: string; after?: unknown }[],
  sent: [] as { phone: string; text: string; author: string }[],
  assumed: [] as string[],
  conversation: { id: "conv1", phone: "5562999990000", closedAt: null as Date | null, lastInboundAt: new Date(), assigneeId: null as string | null },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/agent", () => ({ AI_AUTHOR: "Assistente IA" }));
vi.mock("@/lib/chat/access", () => ({
  requireChatActor: vi.fn(async () => ({ actor: { id: "op1", name: "Leandro", isAdmin: false, capabilities: {}, queueIds: [] } })),
  findScopedConversation: vi.fn(async (_actor: unknown, id: string) => (id === state.conversation.id ? state.conversation : null)),
  chatError: (error: string, status: number) => Response.json({ error }, { status }),
  conversationNotFound: () => Response.json({ error: "Conversa não encontrada." }, { status: 404 }),
}));
vi.mock("@/lib/chat/conversation", () => ({
  isWindowOpen: (value: Date | null) => !!value,
  addSystemMessage: vi.fn(async (_id: string, text: string) => state.system.push(text)),
  addAudit: vi.fn(async (entry: { userId: string | null; action: string; targetId: string; after?: unknown }) => state.audits.push(entry)),
}));
vi.mock("@/lib/chat/outbound", () => ({
  ChatRuleError: class extends Error {},
  sendAutomaticMessage: vi.fn(async (conversation: { phone: string }, text: string, _send: unknown, _list: unknown, author: string) => {
    state.sent.push({ phone: conversation.phone, text, author });
    return { id: `msg-${state.sent.length}` };
  }),
  assumeFor: vi.fn(async (actor: { id: string }) => {
    state.assumed.push(actor.id);
  }),
}));
vi.mock("@/lib/prisma", () => {
  const match = (row: Record<string, unknown>, where: Record<string, unknown>) => Object.entries(where).every(([key, value]) => row[key] === value);
  const aiPendingAction = {
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => [...state.actions.values()].find((row) => match(row, where)) ?? null),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const rows = [...state.actions.values()].filter((row) => match(row, where));
      for (const row of rows) Object.assign(row, data);
      return { count: rows.length };
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(state.actions.get(where.id)!, data, { updatedAt: new Date() })),
  };
  return { prisma: { aiPendingAction, contact: { findMany: vi.fn(async () => []) } } };
});

import { POST as approve } from "@/app/api/chat/conversations/[id]/ai-approval/approve/route";
import { POST as reconsult } from "@/app/api/chat/conversations/[id]/ai-approval/reconsult/route";
import { POST as reject } from "@/app/api/chat/conversations/[id]/ai-approval/reject/route";

const context = { params: Promise.resolve({ id: "conv1" }) };
const post = (body: unknown) => new Request("http://crm/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  state.actions.clear();
  state.system.length = 0;
  state.audits.length = 0;
  state.sent.length = 0;
  state.assumed.length = 0;
  state.actions.set("a1", {
    id: "a1", conversationId: "conv1", type: "financial_installments", status: "pending",
    customerNameVmset: "HELIO HENRYQUE SABINO DOS SANTOS LIMA", customerCpfMasked: "***.982.247-**", cpf: "52998224725",
    installmentsSummary: { abertas: 3 }, draftMessage: "Helio, conferi seu crediário 😊", transcribedText: "Hélio, parcelas do carnê",
    heardName: "Helio Sabino", nameMatches: true, createdAt: new Date(), updatedAt: new Date(),
  });
  vi.unstubAllGlobals();
});

describe("aprovação financeira no /chat", () => {
  it("approve: envia ao WhatsApp do cliente (texto editado), marca aprovado e audita o operador", async () => {
    const response = await approve(post({ actionId: "a1", message: "Helio, você tem 3 parcelas em aberto." }), context);
    expect(response.status).toBe(200);
    expect(state.sent).toEqual([{ phone: "5562999990000", text: "Helio, você tem 3 parcelas em aberto.", author: "Assistente IA" }]);
    expect(state.actions.get("a1")).toMatchObject({ status: "approved", decidedById: "op1", decidedByName: "Leandro", sentMessageId: "msg-1", draftMessage: "Helio, você tem 3 parcelas em aberto." });
    expect(state.system.at(-1)).toContain("enviadas ao cliente por Leandro");
    expect(state.audits[0]).toMatchObject({ userId: "op1", action: "ai.financial.approve", targetId: "conv1" });
    // Segunda aprovação (outro operador) não envia de novo.
    const again = await approve(post({ actionId: "a1", message: "x" }), context);
    expect(again.status).toBe(409);
    expect(state.sent).toHaveLength(1);
  });

  it("approve sem mensagem ou fora da janela de 24h é recusado", async () => {
    expect((await approve(post({ actionId: "a1", message: "  " }), context)).status).toBe(400);
    state.conversation.lastInboundAt = null as unknown as Date;
    expect((await approve(post({ actionId: "a1", message: "ok" }), context)).status).toBe(422);
    state.conversation.lastInboundAt = new Date();
    expect(state.sent).toHaveLength(0);
  });

  it("reconsult: CPF corrigido atualiza nome, CPF mascarado e parcelas do card", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      expect(url).toContain("/installments?cpf=11144477735");
      return Response.json({ found: true, name: "MARIA APARECIDA SOUZA", items: [{ numero: "9", parcela: "1", vencimento: "2026-12-10", valor: 150, posicao: "Aberto", pagamento: null, valorPago: null, tipo: "CARNE" }] });
    }));
    const response = await reconsult(post({ actionId: "a1", cpf: "111.444.777-35", name: "Maria Aparecida Souza" }), context);
    const data = (await response.json()) as { approval: Record<string, unknown> };
    expect(response.status).toBe(200);
    expect(data.approval).toMatchObject({ customerNameVmset: "MARIA APARECIDA SOUZA", customerCpfMasked: "***.444.777-**", nameMatches: true });
    expect(data.approval.draftMessage).toContain("R$ 150,00");
    expect(state.actions.get("a1")).toMatchObject({ cpf: "11144477735", status: "pending" });
    expect(state.audits[0]).toMatchObject({ action: "ai.financial.reconsult" });
    expect(state.sent).toHaveLength(0);
    expect((await reconsult(post({ actionId: "a1", cpf: "111.444.777-36" }), context)).status).toBe(400);
  });

  it("reject: descarta o rascunho e o operador assume", async () => {
    const response = await reject(post({ actionId: "a1" }), context);
    expect(response.status).toBe(200);
    expect(state.assumed).toEqual(["op1"]);
    expect(state.actions.get("a1")).toMatchObject({ status: "rejected", decidedById: "op1" });
    expect(state.sent).toHaveLength(0);
    expect(state.audits[0]).toMatchObject({ action: "ai.financial.reject" });
  });
});
