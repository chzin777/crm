import { describe, expect, it } from "vitest";
import { effectivePresence, shouldAutoAway, signWithName } from "@/lib/chat/presence-status";

const now = new Date("2026-11-23T12:00:00Z").getTime();
const ago = (minutes: number) => new Date(now - minutes * 60 * 1000);

describe("presença do operador", () => {
  it("mostra a escolha enquanto o CRM está aberto e Offline sem sinal", () => {
    expect(effectivePresence({ presenceStatus: "ONLINE", lastSeenAt: ago(1) }, now)).toBe("ONLINE");
    expect(effectivePresence({ presenceStatus: "AWAY", lastSeenAt: ago(1) }, now)).toBe("AWAY");
    expect(effectivePresence({ presenceStatus: "ONLINE", paused: true, lastSeenAt: ago(1) }, now)).toBe("AWAY");
    expect(effectivePresence({ presenceStatus: "ONLINE", lastSeenAt: ago(5) }, now)).toBe("OFFLINE");
    expect(effectivePresence({ presenceStatus: "OFFLINE", lastSeenAt: ago(0) }, now)).toBe("OFFLINE");
    expect(effectivePresence(null, now)).toBe("OFFLINE");
  });

  it("pausa automática só para Online inativo além do limite", () => {
    expect(shouldAutoAway({ presenceStatus: "ONLINE", lastActivityAt: ago(16) }, 15, now)).toBe(true);
    expect(shouldAutoAway({ presenceStatus: "ONLINE", lastActivityAt: ago(14) }, 15, now)).toBe(false);
    expect(shouldAutoAway({ presenceStatus: "ONLINE", lastActivityAt: ago(60) }, 0, now)).toBe(false);
    expect(shouldAutoAway({ presenceStatus: "AWAY", lastActivityAt: ago(60) }, 15, now)).toBe(false);
    expect(shouldAutoAway({ presenceStatus: "ONLINE", lastActivityAt: null }, 15, now)).toBe(false);
  });
});

describe("assinatura do atendente", () => {
  it("prefixa em negrito sem duplicar", () => {
    expect(signWithName("Olá!", "Ana Souza")).toBe("*Ana Souza:*\nOlá!");
    expect(signWithName("*Ana Souza:*\nOlá!", "Ana Souza")).toBe("*Ana Souza:*\nOlá!");
    expect(signWithName("", "Ana")).toBe("");
  });
});
