import { describe, expect, it } from "vitest";
import { DELETE_FOR_EVERYONE_WINDOW_MS, eligibleForEveryone } from "@/lib/chat/message-delete";

describe("apagar mensagem para todos", () => {
  const now = Date.parse("2026-11-19T12:00:00Z");
  const recent = new Date(now - 60_000).toISOString();

  it("aceita mensagem do atendente ou robô enviada há pouco", () => {
    expect(eligibleForEveryone({ author: "agent", internal: false, createdAt: recent, delivery: "read" }, now)).toBe(true);
    expect(eligibleForEveryone({ author: "bot", internal: false, createdAt: recent, delivery: "sent" }, now)).toBe(true);
  });

  it("recusa mensagem do cliente, nota interna, falha e fora do prazo", () => {
    expect(eligibleForEveryone({ author: "customer", internal: false, createdAt: recent }, now)).toBe(false);
    expect(eligibleForEveryone({ author: "agent", internal: true, createdAt: recent }, now)).toBe(false);
    expect(eligibleForEveryone({ author: "agent", internal: false, createdAt: recent, delivery: "failed" }, now)).toBe(false);
    const old = new Date(now - DELETE_FOR_EVERYONE_WINDOW_MS - 1000).toISOString();
    expect(eligibleForEveryone({ author: "agent", internal: false, createdAt: old, delivery: "read" }, now)).toBe(false);
  });
});
