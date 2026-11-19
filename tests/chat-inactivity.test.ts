import { describe, expect, it } from "vitest";
import { planInactivity, type InactivityInput } from "@/lib/chat/inactivity";

const MIN = 60_000;
const NOW = new Date("2026-11-19T18:00:00Z");
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * MIN);
const plan = (input: Partial<InactivityInput>) =>
  planInactivity({ lastAuthor: "agent", lastAt: ago(0), warnedAt: null, now: NOW, askMs: 10 * MIN, closeMs: 3 * MIN, ...input });

describe("encerramento por inatividade do cliente", () => {
  it("última mensagem do cliente: nunca avisa nem encerra, mesmo esperando há horas", () => {
    expect(plan({ lastAuthor: "customer", lastAt: ago(240) })).toBe("none");
  });

  it("cliente respondeu durante os 3 minutos de aviso: cancela o encerramento", () => {
    expect(plan({ lastAuthor: "customer", lastAt: ago(1), warnedAt: ago(2) })).toBe("reset");
  });

  it("operador ou IA falou por último e o cliente sumiu: avisa depois do limite", () => {
    expect(plan({ lastAuthor: "agent", lastAt: ago(9) })).toBe("none");
    expect(plan({ lastAuthor: "agent", lastAt: ago(10) })).toBe("warn");
    expect(plan({ lastAuthor: "bot", lastAt: ago(11) })).toBe("warn");
  });

  it("atendimento preso há 4h com a última mensagem do operador: aviso imediato", () => {
    expect(plan({ lastAuthor: "agent", lastAt: ago(240) })).toBe("warn");
  });

  it("aviso enviado: encerra só depois de 3 minutos sem resposta, e avisa uma única vez", () => {
    const warnedAt = ago(2);
    expect(plan({ lastAuthor: "bot", lastAt: new Date(warnedAt.getTime() - 500), warnedAt })).toBe("none");
    expect(plan({ lastAuthor: "bot", lastAt: ago(3.1), warnedAt: ago(3) })).toBe("close");
  });

  it("operador escreveu depois do aviso: a contagem recomeça", () => {
    expect(plan({ lastAuthor: "agent", lastAt: ago(1), warnedAt: ago(2) })).toBe("reset");
  });
});
