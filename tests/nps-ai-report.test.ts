import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api-auth", () => ({ forbidUnless: async () => null, requireApiSession: async () => ({ id: "u" }) }));
const rows = vi.hoisted(() => [
  { id: "1", contactId: "c1", score: 10, responderType: "ai", attendantId: null, status: "ANSWERED", scale: 10, surveyType: "ATENDIMENTO", contact: { name: "Cliente 1" }, attendant: null, queue: null, answeredAt: new Date(), source: "chat", orderKey: null, store: null, seller: null, comment: "Ótimo" },
  { id: "2", contactId: "c2", score: 5, responderType: "human", attendantId: "u1", status: "ANSWERED", scale: 10, surveyType: "ATENDIMENTO", contact: { name: "Cliente 2" }, attendant: { id: "u1", name: "Humano" }, queue: null, answeredAt: new Date(), source: "chat", orderKey: null, store: null, seller: null, comment: null },
]);
vi.mock("@/lib/prisma", () => ({
  prisma: {
    npsFeedback: {
      count: async ({ where }: { where: { responderType?: string; OR?: unknown[]; attendantId?: string } }) =>
        rows.filter((row) => where.responderType ? row.responderType === where.responderType : where.OR ? row.responderType === "human" : where.attendantId ? row.attendantId === where.attendantId : true).length,
      findMany: async ({ where }: { where: { responderType?: string; OR?: unknown[]; attendantId?: string } }) =>
        rows.filter((row) => where.responderType ? row.responderType === where.responderType : where.OR ? row.responderType === "human" : where.attendantId ? row.attendantId === where.attendantId : true),
    },
    user: { findMany: async () => [{ id: "u1", name: "Humano" }] },
  },
}));

import { GET } from "@/app/api/nps/whatsapp/route";

describe("relatório NPS da IA", () => {
  it("filtra a IA e calcula o score, média e comentário", async () => {
    const report = await (await GET(new Request("http://localhost/api/nps/whatsapp?attendantId=ai"))).json();
    expect(report.summary).toMatchObject({ sent: 1, answered: 1, responseRate: 100, nps: 100, average: 10, promoters: 100, neutral: 0, detractors: 0 });
    expect(report.latest).toHaveLength(1);
    expect(report.latest[0]).toMatchObject({ comment: "Ótimo", attendant: { name: "Assistente IA", isAi: true } });
  });

  it("separa humanos e respeita filtro por atendente", async () => {
    for (const filter of ["human", "u1"]) {
      const report = await (await GET(new Request(`http://localhost/api/nps/whatsapp?attendantId=${filter}`))).json();
      expect(report.summary).toMatchObject({ answered: 1, nps: -100 });
      expect(report.latest[0].attendant.name).toBe("Humano");
    }
  });
});
