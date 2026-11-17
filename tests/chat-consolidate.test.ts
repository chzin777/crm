import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { consolidateByContact, firstPerContact } = await import("@/lib/chat/consolidate");
const { DISPATCH_TAG } = await import("@/lib/chat/dispatch-history");
const { sessionBreak } = await import("@/lib/chat/session-divider");

type Row = Parameters<typeof consolidateByContact>[0][number];
const day = (n: number, hour = 10) => new Date(Date.UTC(2026, 10, n, hour + 3));
const closedSession = (contactId: string, n: number, extra: Partial<Row> = {}): Row => ({
  id: `${contactId}-${n}`, contactId, status: "closed", tags: [], createdAt: day(n, 9), lastMessageAt: day(n, 10), closedAt: day(n, 11), ...extra,
});

describe("lista do /chat com 1 entrada por contato", () => {
  // Ana: 5 atendimentos encerrados. Bruno: 4 encerrados + 1 aberto. Carla: só recebeu campanha.
  const ana = [1, 2, 3, 4, 5].map((n) => closedSession("ana", n));
  const bruno = [...[1, 2, 3, 4].map((n) => closedSession("bruno", n)), { id: "bruno-aberta", contactId: "bruno", status: "in_progress", tags: [], createdAt: day(12, 8), lastMessageAt: day(12, 9), closedAt: null }];
  const carla = [closedSession("carla", 6, { tags: [DISPATCH_TAG] })];
  const rows = [...ana, ...bruno, ...carla];
  const open = new Set(["bruno"]);

  it("cliente com 5 atendimentos encerrados aparece 1 vez em Encerradas e em Todas, com totalSessions 5", () => {
    const closed = consolidateByContact(rows, "closed", open);
    const all = consolidateByContact(rows, "all", open);
    expect(closed.filter((entry) => entry.contactId === "ana")).toEqual([{ id: "ana-5", contactId: "ana", totalSessions: 5 }]);
    expect(all.filter((entry) => entry.contactId === "ana")).toEqual([{ id: "ana-5", contactId: "ana", totalSessions: 5 }]);
  });

  it("cliente com 4 encerrados + 1 aberto aparece 1 vez (a aberta) e não aparece em Encerradas", () => {
    const closed = consolidateByContact(rows, "closed", open);
    const all = consolidateByContact(rows, "all", open);
    expect(closed.map((entry) => entry.contactId)).not.toContain("bruno");
    expect(all.filter((entry) => entry.contactId === "bruno")).toEqual([{ id: "bruno-aberta", contactId: "bruno", totalSessions: 5 }]);
  });

  it("aberta em outra fila (fora dos filtros) também tira o cliente das encerradas", () => {
    expect(consolidateByContact(ana, "closed", new Set(["ana"]))).toEqual([]);
  });

  it("nenhum contato duplicado; Todas ordena pela última mensagem, Encerradas pelo encerramento", () => {
    const all = consolidateByContact(rows, "all", open);
    expect(all.map((entry) => entry.contactId)).toEqual(["bruno", "ana"]);
    const late = closedSession("davi", 2, { lastMessageAt: day(2, 10), closedAt: day(13, 10) });
    expect(consolidateByContact([...ana, late], "closed", new Set()).map((entry) => entry.contactId)).toEqual(["davi", "ana"]);
  });

  it("contato que só recebeu campanha sem responder não polui Todas nem Encerradas", () => {
    expect(consolidateByContact(rows, "all", open).map((entry) => entry.contactId)).not.toContain("carla");
    expect(consolidateByContact(rows, "closed", open).map((entry) => entry.contactId)).not.toContain("carla");
  });

  it("lembretes: 1 por contato, mantendo o retorno mais próximo", () => {
    const owner: Record<string, string> = { c1: "ana", c2: "ana", c3: "bruno" };
    expect(firstPerContact(["c1", "c2", "c3"], (id) => owner[id])).toEqual(["c1", "c3"]);
  });
});

describe("timeline unificada com divisores de atendimento", () => {
  const sessions = new Map([
    ["s1", { id: "s1", createdAt: "2026-11-03T12:00:00.000Z", closedAt: "2026-11-03T14:30:00.000Z" }],
    ["s2", { id: "s2", createdAt: "2026-11-10T13:05:00.000Z", closedAt: null }],
  ]);

  it("divisor só na troca de atendimento, com data/hora de Brasília", () => {
    expect(sessionBreak({ conversationId: "s1" }, { conversationId: "s1" }, sessions)).toBeNull();
    expect(sessionBreak({ conversationId: "s1" }, { conversationId: "s2" }, sessions)).toEqual({
      closed: "Atendimento encerrado em 03/11/2026 às 11:30",
      opened: "Novo atendimento iniciado em 10/11/2026 às 10:05",
    });
  });

  it("mensagem recém-enviada (sem atendimento) não cria divisor", () => {
    expect(sessionBreak({ conversationId: "s2" }, {}, sessions)).toBeNull();
    expect(sessionBreak(undefined, { conversationId: "s1" }, sessions)).toBeNull();
  });
});
