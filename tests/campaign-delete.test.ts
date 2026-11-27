import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ data: new Map<string, unknown>() }));

vi.mock("@/lib/api-auth", () => ({ requireModule: vi.fn(async () => ({ user: { id: "u1" } })) }));
vi.mock("@/lib/cache", () => ({ invalidateCache: vi.fn(async () => undefined) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmWorkspaceData: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) => (db.data.has(where.key) ? { key: where.key, value: db.data.get(where.key) } : null)),
      upsert: vi.fn(async ({ where, update }: { where: { key: string }; update: { value: unknown } }) => { db.data.set(where.key, update.value); return {}; }),
      deleteMany: vi.fn(async ({ where }: { where: { key: { in: string[] } } }) => { let count = 0; for (const key of where.key.in) if (db.data.delete(key)) count += 1; return { count }; }),
    },
  },
}));

import { DELETE } from "@/app/api/campaigns/[id]/route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const del = (id: string) => DELETE(new Request("http://x", { method: "DELETE" }), ctx(id));

beforeEach(() => {
  db.data = new Map<string, unknown>([
    ["campaigns", [{ id: "camp-1", nome: "Black Friday 27", status: "Envio parcial" }, { id: "camp-2", nome: "Black Friday 27 (cópia)", status: "Rascunho" }]],
    ["dispatch:camp-1", { campaignId: "camp-1", status: "finished" }],
    ["dispatch-recipients:camp-2", []],
  ]);
});

describe("excluir campanha", () => {
  it("rascunho sai da lista com os registros de disparo dela; as outras ficam", async () => {
    const response = await del("camp-2");
    expect(response.status).toBe(200);
    expect((db.data.get("campaigns") as { id: string }[]).map((item) => item.id)).toEqual(["camp-1"]);
    expect(db.data.has("dispatch-recipients:camp-2")).toBe(false);
    expect(db.data.has("dispatch:camp-1")).toBe(true);
  });

  it("disparo em andamento ou pausado bloqueia a exclusão; campanha inexistente dá 404", async () => {
    for (const status of ["running", "paused"]) {
      db.data.set("dispatch:camp-1", { campaignId: "camp-1", status });
      expect((await del("camp-1")).status).toBe(409);
    }
    expect((db.data.get("campaigns") as unknown[]).length).toBe(2);
    expect((await del("nao-existe")).status).toBe(404);
  });
});
