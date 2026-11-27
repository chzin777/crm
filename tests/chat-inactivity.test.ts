import { describe, expect, it } from "vitest";
import { planInactivity, type InactivityInput } from "@/lib/chat/inactivity";
import { DEFAULT_CHAT_SETTINGS, SILENCE_DAY_MINUTES, mergeChatSettings, silenceAskMessage, silenceDurationText } from "@/lib/chat/settings";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NOW = new Date("2026-11-19T18:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const plan = (input: Partial<InactivityInput>) =>
  planInactivity({ lastAuthor: "agent", lastAt: ago(0), warnedAt: null, now: NOW, askMs: DAY, closeMs: DAY, ...input });

describe("encerramento por inatividade do cliente (24 h)", () => {
  it("padrão: pergunta 24 h depois e encerra outras 24 h depois", () => {
    expect(DEFAULT_CHAT_SETTINGS.silenceAskMinutes).toBe(1440);
    expect(DEFAULT_CHAT_SETTINGS.silenceCloseMinutes).toBe(1440);
  });

  it("última mensagem do cliente: nunca avisa nem encerra, mesmo esperando dias", () => {
    expect(plan({ lastAuthor: "customer", lastAt: ago(3 * DAY) })).toBe("none");
  });

  it("cliente respondeu antes das 24 h: nada é disparado e o aviso pendente é cancelado", () => {
    expect(plan({ lastAuthor: "customer", lastAt: ago(23 * HOUR) })).toBe("none");
    expect(plan({ lastAuthor: "customer", lastAt: ago(1 * HOUR), warnedAt: ago(2 * HOUR) })).toBe("reset");
  });

  it("operador ou IA falou por último: nada em minutos, aviso só com 24 h", () => {
    expect(plan({ lastAuthor: "agent", lastAt: ago(3 * MIN) })).toBe("none");
    expect(plan({ lastAuthor: "agent", lastAt: ago(10 * MIN) })).toBe("none");
    expect(plan({ lastAuthor: "agent", lastAt: ago(DAY - MIN) })).toBe("none");
    expect(plan({ lastAuthor: "agent", lastAt: ago(DAY) })).toBe("warn");
    expect(plan({ lastAuthor: "bot", lastAt: ago(DAY + HOUR) })).toBe("warn");
  });

  it("aviso enviado: não encerra em minutos, só 24 h depois do aviso", () => {
    expect(plan({ lastAuthor: "bot", lastAt: ago(3 * MIN + 500), warnedAt: ago(3 * MIN) })).toBe("none");
    expect(plan({ lastAuthor: "bot", lastAt: ago(DAY - MIN + 500), warnedAt: ago(DAY - MIN) })).toBe("none");
    expect(plan({ lastAuthor: "bot", lastAt: ago(DAY + 500), warnedAt: ago(DAY) })).toBe("close");
  });

  it("operador escreveu depois do aviso: a contagem recomeça", () => {
    expect(plan({ lastAuthor: "agent", lastAt: ago(1 * HOUR), warnedAt: ago(2 * HOUR) })).toBe("reset");
  });

  it("resposta humana reinicia a janela e impede novo aviso antes do prazo", () => {
    expect(plan({ lastAuthor: "agent", lastAt: ago(1 * MIN), warnedAt: ago(2 * MIN) })).toBe("reset");
    expect(plan({ lastAuthor: "agent", lastAt: ago(DAY - MIN), warnedAt: null })).toBe("none");
    expect(plan({ lastAuthor: "agent", lastAt: ago(DAY), warnedAt: null })).toBe("warn");
  });

  it("configuração antiga de 10 min + 3 min no banco vira 24 h + 24 h com o texto novo", () => {
    const merged = mergeChatSettings({
      silenceAskMinutes: 10,
      silenceCloseMinutes: 3,
      silenceAskText: "Você ainda está por aí? Em caso de inatividade, este atendimento será encerrado automaticamente em {minutos} minutos.",
    });
    expect(merged.silenceAskMinutes).toBe(SILENCE_DAY_MINUTES);
    expect(merged.silenceCloseMinutes).toBe(SILENCE_DAY_MINUTES);
    expect(silenceAskMessage(merged)).toContain("encerrado em 24 horas");
    expect(mergeChatSettings({ silenceAskMinutes: 720, silenceAskText: "Texto próprio" })).toMatchObject({ silenceAskMinutes: 720, silenceAskText: "Texto próprio" });
  });

  it("mensagem do dia seguinte sem travessão nem hífen", () => {
    expect(silenceAskMessage(DEFAULT_CHAT_SETTINGS)).not.toMatch(/[-–—]/);
    expect(silenceDurationText(1440)).toBe("24 horas");
    expect(silenceDurationText(60)).toBe("1 hora");
    expect(silenceDurationText(2880)).toBe("2 dias");
  });
});
