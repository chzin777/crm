import { describe, expect, it } from "vitest";
import { pickRoundRobin } from "@/lib/chat/queue-rules";
import { detectOptOutCommand } from "@/lib/marketing-opt-out";

const pool = [
  { id: "a", store: "13" },
  { id: "b", store: "7" },
  { id: "c", store: "13" },
];

describe("rodízio da fila", () => {
  it("distribui 1 a 1 pela ordem", () => {
    expect([0, 1, 2, 3].map((cursor) => pickRoundRobin(pool, cursor, null, false)?.pick.id)).toEqual(["a", "b", "c", "a"]);
  });

  it("prioriza a loja do cliente e transborda quando não há ninguém dela", () => {
    expect([0, 1, 2].map((cursor) => pickRoundRobin(pool, cursor, "13", true)?.pick.id)).toEqual(["a", "c", "a"]);
    expect(pickRoundRobin(pool, 0, "13", true)?.byStore).toBe(true);
    expect(pickRoundRobin(pool, 1, "99", true)).toEqual({ pick: pool[1], byStore: false });
    expect(pickRoundRobin(pool, 0, "13", false)?.byStore).toBe(false);
  });

  it("sem atendente livre não escolhe ninguém", () => {
    expect(pickRoundRobin([], 0, "13", true)).toBeNull();
  });
});

describe("descadastro ampliado", () => {
  it("aceita botão da Meta e variações, mas não 'cancelar' solto", () => {
    expect(detectOptOutCommand("Parar promoções")).toBe("opt_out");
    expect(detectOptOutCommand("PARE")).toBe("opt_out");
    expect(detectOptOutCommand("Não quero mais receber!")).toBe("opt_out");
    expect(detectOptOutCommand("cancelar")).toBeNull();
  });
});
