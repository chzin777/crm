import { beforeEach, describe, expect, it, vi } from "vitest";

// Banco em memória: CustomerPrescription com a mesma regra de unicidade por messageId.
const db = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], seq: 0, user: { id: "u1" } as { id: string } | null }));

vi.mock("server-only", () => ({}));
// Permissão por cargo tem teste próprio (security-api-guards); aqui só a sessão: sem usuário, 401.
vi.mock("@/lib/api-auth", () => ({
  requireApiSession: vi.fn(async () => db.user),
  forbidUnless: vi.fn(async () => (db.user ? null : Response.json({ error: "Não autenticado." }, { status: 401 }))),
}));
vi.mock("@/lib/prisma", () => {
  const match = (row: Record<string, unknown>, where: Record<string, unknown>) => Object.entries(where).every(([key, value]) => row[key] === value);
  return {
    prisma: {
      contact: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === "c-vivi" ? { id: "c-vivi" } : null)) },
      customerPrescription: {
        findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => db.rows.find((row) => match(row, where)) ?? null),
        findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => db.rows.find((row) => match(row, where)) ?? null),
        findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => db.rows.filter((row) => match(row, where))),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          if (data.messageId && db.rows.some((row) => row.messageId === data.messageId)) throw Object.assign(new Error("unique"), { code: "P2002" });
          db.seq += 1;
          const now = new Date(Date.UTC(2026, 10, 16, 12, db.seq));
          const row = { id: `rx-${db.seq}`, conversationId: null, messageId: null, attachmentUrl: null, origem: "manual", conferidoPorHumano: false, createdAt: now, updatedAt: now, ...Object.fromEntries(["odEsferico", "odCilindrico", "odEixo", "odAdicao", "odDnp", "oeEsferico", "oeCilindrico", "oeEixo", "oeAdicao", "oeDnp", "dpTotal", "tipoLenteSugerido", "observacoes", "medicoNome", "medicoCrm", "dataReceita"].map((key) => [key, null])), ...data };
          db.rows.push(row);
          return row;
        }),
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const row = db.rows.find((item) => item.id === where.id)!;
          Object.assign(row, data, { updatedAt: new Date() });
          return row;
        }),
        delete: vi.fn(async ({ where }: { where: { id: string } }) => { db.rows = db.rows.filter((row) => row.id !== where.id); }),
      },
    },
  };
});

import { savePrescriptionFromAi } from "@/lib/prescriptions-db";
import { isPrescriptionExpired, parsePrescriptionDate, parsePrescriptionInput, prescriptionFromExtraction } from "@/lib/prescriptions";
import { saveReadPrescriptions } from "@/lib/ai/agent";
import { GET, POST } from "@/app/api/contacts/[id]/prescriptions/route";
import { DELETE, PATCH } from "@/app/api/contacts/[id]/prescriptions/[prescriptionId]/route";
import type { DocumentExtraction } from "@/lib/ai/document-extract";

// Receita real do print: OD -2,00 -1,00 125°; OE -2,50 -0,75 50°; Dr. Nasser Bahjat Hajj, CRM 18636.
const NASSER: DocumentExtraction = {
  tipo: "receita",
  receita: { od: { esferico: "-2,00", cilindrico: "-1,00", eixo: "125" }, oe: { esferico: "-2,50", cilindrico: "-0,75", eixo: "50°" }, medico: "Dr. Nasser Bahjat Hajj", crm: "CRM 18636", data: "13/05/2026", observacoes: "Antirreflexo" },
};
const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) }) as never;
const json = (body: unknown, method = "POST") => new Request("http://crm.test/api", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  db.rows = [];
  db.seq = 0;
  db.user = { id: "u1" };
});

describe("receita lida pela IA → receituário do cliente", () => {
  it("salva OD/OE, médico, CRM, data e o arquivo original como extraída pela IA (a conferir)", async () => {
    const result = await savePrescriptionFromAi({ contactId: "c-vivi", conversationId: "conv-1", messageId: "msg-rx", extraction: NASSER });
    expect(result).toMatchObject({ saved: true });
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({
      contactId: "c-vivi", conversationId: "conv-1", messageId: "msg-rx", attachmentUrl: "/api/chat/media/msg-rx",
      odEsferico: "-2,00", odCilindrico: "-1,00", odEixo: "125°",
      oeEsferico: "-2,50", oeCilindrico: "-0,75", oeEixo: "50°",
      medicoNome: "Dr. Nasser Bahjat Hajj", medicoCrm: "18636", observacoes: "Antirreflexo",
      origem: "ia_extracao", conferidoPorHumano: false,
    });
    expect((db.rows[0].dataReceita as Date).toISOString()).toBe("2026-05-13T12:00:00.000Z");
  });

  it("mesma mensagem reprocessada não duplica; receita ilegível não grava", async () => {
    await savePrescriptionFromAi({ contactId: "c-vivi", conversationId: "conv-1", messageId: "msg-rx", extraction: NASSER });
    expect(await savePrescriptionFromAi({ contactId: "c-vivi", conversationId: "conv-1", messageId: "msg-rx", extraction: NASSER })).toMatchObject({ saved: false, reason: "duplicada" });
    expect(await savePrescriptionFromAi({ contactId: "c-vivi", conversationId: "conv-1", messageId: "msg-borrada", extraction: { tipo: "receita", receita: {} } })).toMatchObject({ saved: false, reason: "sem dados legíveis" });
    expect(db.rows).toHaveLength(1);
  });

  it("documentos do agente: só receitas com a mensagem de origem viram registro", async () => {
    await saveReadPrescriptions([
      { kind: "receita", summary: "Receita — OD...", extraction: NASSER, source: { messageId: "msg-a" } },
      { kind: "comprovante", summary: "Comprovante", extraction: { tipo: "comprovante" }, source: { messageId: "msg-b" } },
      { kind: "receita", summary: "Receita sem mensagem (teste /ia)", extraction: NASSER },
    ], { contactId: "c-vivi", conversationId: "conv-1" });
    expect(db.rows.map((row) => row.messageId)).toEqual(["msg-a"]);
  });

  it("conversões: datas, adição sugere multifocal, validade de 1 ano", () => {
    expect(parsePrescriptionDate("13-05-26")?.toISOString()).toBe("2026-05-13T12:00:00.000Z");
    expect(parsePrescriptionDate("31/02/2026")).toBeNull();
    expect(prescriptionFromExtraction({ receita: { od: { esferico: "+1,00", adicao: "+2,00" }, dp: "62" } })).toMatchObject({ tipoLenteSugerido: "Multifocal", dpTotal: "62", odAdicao: "+2,00" });
    expect(isPrescriptionExpired("2025-01-10T12:00:00.000Z", new Date("2026-11-16"))).toBe(true);
    expect(isPrescriptionExpired("2026-05-13T12:00:00.000Z", new Date("2026-11-16"))).toBe(false);
    expect(parsePrescriptionInput({ medicoNome: "" })).toMatchObject({ ok: false });
  });
});

describe("rotas do receituário", () => {
  it("POST cadastra manual, GET lista da mais recente para a mais antiga", async () => {
    const created = await POST(json({ odEsferico: "-1,00", oeEsferico: "-1,25", odEixo: "90", medicoNome: "Dra. Ana", dataReceita: "10/01/2025" }), ctx({ id: "c-vivi" }));
    expect(created.status).toBe(201);
    expect((await created.json()).prescription).toMatchObject({ origem: "manual", conferidoPorHumano: true, odEixo: "90°", dataReceita: "2025-01-10T12:00:00.000Z" });
    await savePrescriptionFromAi({ contactId: "c-vivi", conversationId: "conv-1", messageId: "msg-rx", extraction: NASSER });

    const list = await GET(new Request("http://crm.test/api"), ctx({ id: "c-vivi" }));
    const { prescriptions } = (await list.json()) as { prescriptions: { medicoNome: string }[] };
    expect(prescriptions.map((item) => item.medicoNome)).toEqual(["Dr. Nasser Bahjat Hajj", "Dra. Ana"]);

    expect((await POST(json({ medicoNome: "" }), ctx({ id: "c-vivi" }))).status).toBe(400);
    expect((await POST(json({ odEsferico: "-1,00" }), ctx({ id: "outro" }))).status).toBe(404);
  });

  it("PATCH marca como conferido e corrige graus; não mexe em receita de outro contato; DELETE remove", async () => {
    const saved = await savePrescriptionFromAi({ contactId: "c-vivi", conversationId: "conv-1", messageId: "msg-rx", extraction: NASSER });
    const id = saved.saved ? saved.id : "";
    const checked = await PATCH(json({ conferidoPorHumano: true }, "PATCH"), ctx({ id: "c-vivi", prescriptionId: id }));
    expect((await checked.json()).prescription).toMatchObject({ conferidoPorHumano: true, odEsferico: "-2,00" });
    const fixed = await PATCH(json({ odEsferico: "-2,25" }, "PATCH"), ctx({ id: "c-vivi", prescriptionId: id }));
    expect((await fixed.json()).prescription).toMatchObject({ odEsferico: "-2,25", oeEsferico: "-2,50", conferidoPorHumano: true });
    expect((await PATCH(json({ conferidoPorHumano: true }, "PATCH"), ctx({ id: "outro", prescriptionId: id }))).status).toBe(404);
    expect((await PATCH(json({ conferidoPorHumano: "sim" }, "PATCH"), ctx({ id: "c-vivi", prescriptionId: id }))).status).toBe(400);
    expect((await DELETE(new Request("http://crm.test/api", { method: "DELETE" }), ctx({ id: "c-vivi", prescriptionId: id }))).status).toBe(200);
    expect(db.rows).toHaveLength(0);
  });

  it("sem sessão: 401", async () => {
    db.user = null;
    expect((await GET(new Request("http://crm.test/api"), ctx({ id: "c-vivi" }))).status).toBe(401);
    expect((await PATCH(json({ conferidoPorHumano: true }, "PATCH"), ctx({ id: "c-vivi", prescriptionId: "x" }))).status).toBe(401);
  });
});
