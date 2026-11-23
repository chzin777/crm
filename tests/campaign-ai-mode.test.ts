import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  campaigns: [] as Record<string, unknown>[],
  guard: { response: null as Response | null, user: { id: "u1" } },
}));

vi.mock("@/lib/api-auth", () => ({ requireModule: vi.fn(async () => state.guard) }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/cache", () => ({ invalidateCache: vi.fn(async () => undefined) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmWorkspaceData: {
      findUnique: vi.fn(async () => ({ value: state.campaigns })),
      upsert: vi.fn(async ({ update }: { update: { value: Record<string, unknown>[] } }) => { state.campaigns = update.value; }),
    },
  },
}));

import { PATCH } from "@/app/api/campaigns/[id]/route";
import { campaignAiReplyEnabled } from "@/lib/chat/campaign-origin";

const patch = (id: string, body: unknown) => PATCH(new Request(`http://x/api/campaigns/${id}`, { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });

describe("modo de atendimento pós-campanha editável em qualquer status", () => {
  beforeEach(() => {
    state.guard = { response: null, user: { id: "u1" } };
    state.campaigns = [
      { id: "c-enviando", nome: "Black Friday", status: "Enviando", sent: 120, aiAutoReplyEnabled: true },
      { id: "c-pausada", nome: "Reativação", status: "Envio pausado", aiAutoReplyEnabled: false },
      { id: "c-concluida", nome: "Dia dos Pais", status: "Enviada" },
    ];
  });

  it.each([["c-enviando", false], ["c-pausada", true], ["c-concluida", false]])("%s → aiAutoReplyEnabled=%s com efeito imediato", async (id, enabled) => {
    const response = await patch(id, { aiAutoReplyEnabled: enabled });
    expect(response.status).toBe(200);
    expect(await campaignAiReplyEnabled(id)).toBe(enabled);
  });

  it("só grava o modo: status e progresso do disparo continuam intactos", async () => {
    await patch("c-enviando", { aiAutoReplyEnabled: false });
    expect(state.campaigns.find((campaign) => campaign.id === "c-enviando")).toMatchObject({ status: "Enviando", sent: 120, aiAutoReplyEnabled: false });
  });

  it("valida o corpo, a campanha e a permissão do módulo", async () => {
    expect((await patch("c-enviando", { aiAutoReplyEnabled: "sim" })).status).toBe(400);
    expect((await patch("nao-existe", { aiAutoReplyEnabled: true })).status).toBe(404);
    state.guard = { response: new Response(null, { status: 403 }), user: { id: "u1" } };
    expect((await patch("c-enviando", { aiAutoReplyEnabled: true })).status).toBe(403);
  });
});
