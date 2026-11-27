import { beforeEach, describe, expect, it, vi } from "vitest";

const { store, session, access, broadcast } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  session: { current: { id: "u-a", name: "Gestora A", email: "a@x" } as { id: string; name: string; email: string } | null },
  access: new Map<string, { isAdmin: boolean; modules: Record<string, boolean> }>(),
  broadcast: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  requireModule: async () => (session.current ? { user: session.current } : { response: Response.json({ error: "Não autenticado." }, { status: 401 }) }),
  getUserAccess: async (id: string) => access.get(id) ?? null,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmWorkspaceData: {
      findUnique: async ({ where }: { where: { key: string } }) => (store.has(where.key) ? { value: store.get(where.key) } : null),
      upsert: async ({ where, create, update }: { where: { key: string }; create: { value: unknown }; update: { value: unknown } }) => {
        store.set(where.key, store.has(where.key) ? update.value : create.value);
      },
      deleteMany: async ({ where }: { where: { key: string } }) => {
        store.delete(where.key);
      },
    },
  },
}));
vi.mock("@/lib/sales-live/live-db", () => ({ broadcastGoal: broadcast }));

import { GET, PUT } from "@/app/api/vendas/ao-vivo/meta/route";
import { goalProgress, normalizeGoalAmount } from "@/lib/sales-live/goal";

const as = (id: string, name: string) => {
  session.current = { id, name, email: `${id}@x` };
};
const put = (amount: unknown) => PUT(new Request("http://x/api/vendas/ao-vivo/meta", { method: "PUT", body: JSON.stringify({ amount }) }));
const get = async () => (await (await GET(new Request("http://x/api/vendas/ao-vivo/meta"))).json()) as { data: { goal: { amount: number; updatedBy: string } | null; canEdit: boolean } };

describe("Meta do Dia global no /vendas/ao-vivo", () => {
  beforeEach(() => {
    store.clear();
    broadcast.mockClear();
    access.clear();
    access.set("u-a", { isAdmin: false, modules: { metas: true, vendas: true } });
    access.set("u-b", { isAdmin: false, modules: { vendas: true } });
  });

  it("usuário A define e depois altera; usuário B recebe exatamente a mesma meta e o mesmo percentual", async () => {
    as("u-a", "Gestora A");
    expect((await put(80000)).status).toBe(200);
    expect((await put(90000.4)).status).toBe(200);
    expect(broadcast).toHaveBeenLastCalledWith(null, expect.objectContaining({ amount: 90000, updatedBy: "Gestora A" }));

    as("u-b", "Vendedor B");
    const seenByB = await get();
    expect(seenByB.data.goal).toMatchObject({ amount: 90000, updatedBy: "Gestora A", store: null });
    expect(seenByB.data.canEdit).toBe(false);
    as("u-a", "Gestora A");
    const seenByA = await get();
    expect(seenByA.data.goal).toEqual(seenByB.data.goal);
    const revenue = 45000;
    expect(goalProgress(revenue, seenByB.data.goal as never)).toBe(50);
    expect(goalProgress(revenue, seenByA.data.goal as never)).toBe(goalProgress(revenue, seenByB.data.goal as never));
  });

  it("só gestor (módulo Metas) ou admin altera; os demais só veem", async () => {
    as("u-b", "Vendedor B");
    expect((await put(50000)).status).toBe(403);
    expect(store.size).toBe(0);
    access.set("u-c", { isAdmin: true, modules: {} });
    as("u-c", "Admin");
    expect((await put(50000)).status).toBe(200);
  });

  it("remover a meta vale para todos; valor inválido é recusado", async () => {
    as("u-a", "Gestora A");
    await put(70000);
    expect((await put(null)).status).toBe(200);
    expect(broadcast).toHaveBeenLastCalledWith(null, null);
    as("u-b", "Vendedor B");
    expect((await get()).data.goal).toBeNull();
    as("u-a", "Gestora A");
    expect((await put("abc")).status).toBe(400);
    expect((await put(-5)).status).toBe(400);
    expect(normalizeGoalAmount(0)).toBeNull();
  });
});
