import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ assignee: null as { name: string } | null, settings: {} as Record<string, unknown> }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmWorkspaceData: { findUnique: vi.fn(async () => ({ value: state.settings })) },
    chatConversation: { findFirst: vi.fn(async () => (state.assignee ? { assignee: state.assignee } : null)) },
  },
}));

import { attendantValues, DEFAULT_ATTENDANT_FALLBACK, fillAttendantTokens, hasAttendantToken } from "@/lib/attendant-variables";
import { fillVariables } from "@/lib/chat/text";

describe("variáveis do atendente", () => {
  it("nome completo e primeiro nome do operador", () => {
    expect(attendantValues("  Thamyres   Lima Souza ")).toEqual({ nome_atendente: "Thamyres Lima Souza", primeiro_nome_atendente: "Thamyres" });
  });

  it("sem atendente: nome da equipe configurado, nunca vazio nem literal", () => {
    expect(attendantValues(null)).toEqual({ nome_atendente: DEFAULT_ATTENDANT_FALLBACK, primeiro_nome_atendente: DEFAULT_ATTENDANT_FALLBACK });
    expect(attendantValues("", "  a equipe da Óticas Brasil ").primeiro_nome_atendente).toBe("a equipe da Óticas Brasil");
    const text = fillAttendantTokens("Aqui é {{primeiro_nome_atendente}} ({{ nome_atendente }})", attendantValues(undefined));
    expect(text).toBe(`Aqui é ${DEFAULT_ATTENDANT_FALLBACK} (${DEFAULT_ATTENDANT_FALLBACK})`);
    expect(hasAttendantToken("Olá {{nome}}")).toBe(false);
    expect(hasAttendantToken("Olá, aqui é {{Primeiro_Nome_Atendente}}")).toBe(true);
  });

  it("respostas rápidas aceitam {{nome_atendente}} e {{primeiro_nome_atendente}} junto das variáveis antigas", () => {
    const text = fillVariables("Olá, {cliente}! Aqui é {{primeiro_nome_atendente}} ({{nome_atendente}}), {atendente} falando.", { customer: "Christofer Silva", agent: "Ana Souza" });
    expect(text).toBe("Olá, Christofer! Aqui é Ana (Ana Souza), Ana falando.");
    expect(fillVariables("Aqui é {{primeiro_nome_atendente}}", {})).toBe(`Aqui é ${DEFAULT_ATTENDANT_FALLBACK}`);
  });

  describe("disparos (campanha / envio em massa)", () => {
    beforeEach(() => { state.assignee = null; state.settings = {}; vi.resetModules(); });

    it("usa o operador da conversa aberta do contato", async () => {
      state.assignee = { name: "Bruno Costa" };
      const { assignedAttendantValues } = await import("@/lib/attendant-db");
      expect(await assignedAttendantValues({ contactId: "c1", phone: "5527999990000" })).toEqual({ nome_atendente: "Bruno Costa", primeiro_nome_atendente: "Bruno" });
    });

    it("sem operador atribuído: nome da equipe de /configuracoes (ou o padrão)", async () => {
      state.settings = { attendantFallbackName: "Time Óticas Brasil" };
      const { assignedAttendantValues } = await import("@/lib/attendant-db");
      expect(await assignedAttendantValues({ contactId: "c1" })).toEqual({ nome_atendente: "Time Óticas Brasil", primeiro_nome_atendente: "Time Óticas Brasil" });
    });
  });
});
