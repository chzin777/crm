import { beforeEach, describe, expect, it, vi } from "vitest";
import { planNps, planOrders, rankOf, type PlannedEntry, type PointsOrder, type PointsRule } from "@/lib/brasil-points/rules";

const ACTIVE = new Date("2026-11-01T03:00:00Z");
const rule = (patch: Partial<PointsRule>): PointsRule => ({
  id: "r-venda", title: "Venda faturada", type: "earn", triggerType: "automatic", eventKey: "sale_completed", pointsAmount: 10, conditions: {}, isActive: true, activeSince: ACTIVE, ...patch,
});
const order = (patch: Partial<PointsOrder> = {}): PointsOrder => ({
  reference: "8-49005-2026-11-20", userId: "u-ana", store: "8", orderNumber: "49005", day: "2026-11-20", fromWhatsapp: false,
  items: [{ amount: 900, brand: "RAY BAN", category: "OCULOS DE SOL", returned: false }, { amount: 700, brand: "VARILUX", category: "LENTES", returned: false }],
  ...patch,
});

/** Extrato em memória: aplica os planos e responde o "já lançado" como o banco. */
function ledger() {
  const entries: PlannedEntry[] = [];
  const keys = new Set<string>();
  const netOf = (reference: string, ruleId: string) => {
    const mine = entries.filter((entry) => entry.referenceId === reference && entry.ruleId === ruleId);
    return { points: mine.reduce((sum, entry) => sum + entry.points, 0), entries: mine.length };
  };
  const earned = (reference: string) => entries.some((entry) => entry.referenceId === reference && entry.points > 0 && entry.ruleId !== "r-penal");
  const apply = (plans: PlannedEntry[]) => {
    let posted = 0;
    for (const plan of plans) {
      const key = `${plan.referenceType}|${plan.referenceId}|${plan.eventKey}`;
      if (keys.has(key)) continue; // índice único (reference_type, reference_id, event_key)
      keys.add(key);
      entries.push(plan);
      posted += 1;
    }
    return posted;
  };
  const balance = (userId: string) => entries.filter((entry) => entry.userId === userId).reduce((sum, entry) => sum + entry.points, 0);
  return { entries, netOf, earned, apply, balance };
}

describe("Brasil Points: motor de pontuação de vendas", () => {
  it("credita venda faturada válida e o bônus de ticket alto, com motivo e referência do pedido", () => {
    const book = ledger();
    const rules = [rule({}), rule({ id: "r-ticket", title: "Ticket alto", eventKey: "sale_high_ticket", pointsAmount: 30, conditions: { minOrderAmount: 1500 } })];
    expect(book.apply(planOrders([order()], rules, book.netOf, book.earned))).toBe(2);
    expect(book.balance("u-ana")).toBe(40);
    expect(book.entries[0]).toMatchObject({ type: "earn", points: 10, referenceType: "order", referenceId: "8-49005-2026-11-20", eventKey: "rule:r-venda#0" });
    expect(book.entries[0].reason).toContain("pedido 49005 da loja 8 (20/11/2026)");
  });

  it("re-sync do VMSet com o mesmo estado nunca duplica (nem planeja nada)", () => {
    const book = ledger();
    const rules = [rule({})];
    book.apply(planOrders([order()], rules, book.netOf, book.earned));
    for (let run = 0; run < 3; run += 1) expect(planOrders([order()], rules, book.netOf, book.earned)).toEqual([]);
    // Mesmo que o plano viesse duplicado (duas instâncias), o índice único barra.
    const replay = [{ ...book.entries[0] }];
    expect(book.apply(replay)).toBe(0);
    expect(book.balance("u-ana")).toBe(10);
  });

  it("devolução parcial abaixo do mínimo estorna o bônus; cancelamento estorna a venda + penalidade, uma única vez", () => {
    const book = ledger();
    const rules = [
      rule({}),
      rule({ id: "r-ticket", title: "Ticket alto", eventKey: "sale_high_ticket", pointsAmount: 30, conditions: { minOrderAmount: 1500 } }),
      rule({ id: "r-penal", title: "Venda devolvida", type: "penalty", eventKey: "sale_canceled_refund", pointsAmount: -10 }),
    ];
    book.apply(planOrders([order()], rules, book.netOf, book.earned));
    expect(book.balance("u-ana")).toBe(40);

    const partial = order({ items: [{ amount: 900, brand: "RAY BAN", category: "OCULOS DE SOL", returned: false }, { amount: 700, brand: "VARILUX", category: "LENTES", returned: true }] });
    book.apply(planOrders([partial], rules, book.netOf, book.earned));
    // Ticket alto estornado (900 < 1500), venda segue valendo, penalidade de devolução aplicada.
    expect(book.balance("u-ana")).toBe(40 - 5 - 30 - 10);
    const reversal = book.entries.find((entry) => entry.ruleId === "r-ticket" && entry.points < 0)!;
    expect(reversal).toMatchObject({ type: "penalty", points: -30, referenceId: "8-49005-2026-11-20", eventKey: "rule:r-ticket#1" });
    expect(reversal.reason).toContain("Estorno");

    const canceled = order({ items: [], canceled: true });
    book.apply(planOrders([canceled], rules, book.netOf, book.earned));
    expect(book.balance("u-ana")).toBe(-10);
    // Re-sync do cancelamento: nada novo.
    expect(planOrders([canceled], rules, book.netOf, book.earned)).toEqual([]);
  });

  it("sem crédito retroativo: pedido antes da vigência não pontua; regra desligada não credita pedido novo", () => {
    const book = ledger();
    expect(planOrders([order({ day: "2026-10-30" })], [rule({})], book.netOf, book.earned)).toEqual([]);
    expect(planOrders([order()], [rule({ isActive: false })], book.netOf, book.earned)).toEqual([]);
  });

  it("marca/categoria e WhatsApp: só itens da regra contam; venda sem atendimento no CRM não ganha o bônus", () => {
    const book = ledger();
    const rules = [
      rule({ id: "r-rb", title: "Ray-Ban", conditions: { brands: ["ray ban"], pointsPerAmount: 100 }, pointsAmount: 1 }),
      rule({ id: "r-wa", title: "WhatsApp", eventKey: "whatsapp_sale", pointsAmount: 20 }),
    ];
    book.apply(planOrders([order(), order({ reference: "8-2-2026-11-21", orderNumber: "2", fromWhatsapp: true })], rules, book.netOf, book.earned));
    expect(book.entries.filter((entry) => entry.ruleId === "r-rb").map((entry) => entry.points)).toEqual([9, 9]);
    expect(book.entries.filter((entry) => entry.ruleId === "r-wa").map((entry) => entry.referenceId)).toEqual(["8-2-2026-11-21"]);
  });

  it("respeita o prazo de atendimento configurado para a regra de WhatsApp", () => {
    const waRule = rule({ id: "r-wa-window", eventKey: "whatsapp_sale", pointsAmount: 20, conditions: { withinDays: 14 } });
    const outsideWindow = order({ fromWhatsapp: true, whatsappDaysBefore: 15 });
    const insideWindow = order({ fromWhatsapp: true, whatsappDaysBefore: 14 });

    expect(planOrders([outsideWindow, insideWindow], [waRule], () => ({ points: 0, entries: 0 }), () => false).map((entry) => entry.referenceId)).toEqual([insideWindow.reference]);
  });

  it("devolução parcial reduz proporcionalmente os pontos da venda faturada", () => {
    const book = ledger();
    const rules = [rule({})];
    book.apply(planOrders([order()], rules, book.netOf, book.earned));
    const partiallyReturned = order({ items: [{ amount: 900, brand: "RAY BAN", category: "OCULOS DE SOL", returned: true }, { amount: 700, brand: "VARILUX", category: "LENTES", returned: false }] });
    book.apply(planOrders([partiallyReturned], rules, book.netOf, book.earned));

    expect(book.balance("u-ana")).toBe(4);
    expect(book.entries.at(-1)).toMatchObject({ type: "penalty", points: -6 });
  });

  it("NPS: promotor ganha, detrator perde, nota neutra não mexe e a mesma pesquisa nunca pontua duas vezes", () => {
    const book = ledger();
    const rules = [rule({ id: "r-p", title: "Promotor", eventKey: "nps_promoter", pointsAmount: 15 }), rule({ id: "r-d", title: "Detrator", type: "penalty", eventKey: "nps_detractor", pointsAmount: 15 })];
    const at = new Date("2026-11-20T15:00:00Z");
    const answers = [{ id: "n1", userId: "u-ana", score: 10, answeredAt: at, store: "8" }, { id: "n2", userId: "u-ana", score: 4, answeredAt: at, store: "8" }, { id: "n3", userId: "u-ana", score: 8, answeredAt: at, store: "8" }];
    book.apply(planNps(answers, rules, book.netOf));
    expect(book.entries.map((entry) => [entry.referenceId, entry.points])).toEqual([["n1", 15], ["n2", -15]]);
    expect(planNps(answers, rules, book.netOf)).toEqual([]);
  });

  it("posição no ranking com empate", () => {
    const scores = [{ userId: "a", points: 50 }, { userId: "b", points: 50 }, { userId: "c", points: 10 }];
    expect([rankOf(scores, "a"), rankOf(scores, "b"), rankOf(scores, "c")]).toEqual([1, 1, 3]);
  });
});

// ---- Resgate e recusa: transação real do motor com banco em memória ----
const db = vi.hoisted(() => {
  type Row = Record<string, unknown> & { id: string };
  const state = { ledger: [] as Row[], rewards: [] as Row[], redemptions: [] as Row[], seq: 0, failNextCreate: false };
  const id = () => `id-${++state.seq}`;
  const match = (row: Row, where: Record<string, unknown>) => Object.entries(where).every(([key, value]) => {
    if (value && typeof value === "object" && "gt" in (value as object)) return (row[key] as number) > (value as { gt: number }).gt;
    return row[key] === value;
  });
  const tx = {
    $queryRaw: async () => [{ locked: "" }],
    brasilPointsLedger: {
      aggregate: async ({ where }: { where: { userId: string } }) => ({ _sum: { points: state.ledger.filter((row) => row.userId === where.userId).reduce((sum, row) => sum + (row.points as number), 0) } }),
      findFirst: async ({ where }: { where: Record<string, unknown> }) => state.ledger.find((row) => match(row, where)) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: id(), ...data } as Row;
        state.ledger.push(row);
        return row;
      },
    },
    brasilPointsReward: {
      findUnique: async ({ where }: { where: { id: string } }) => state.rewards.find((row) => row.id === where.id) ?? null,
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: { stockQuantity: { decrement: number } } }) => {
        const rows = state.rewards.filter((row) => match(row, where));
        for (const row of rows) row.stockQuantity = (row.stockQuantity as number) - data.stockQuantity.decrement;
        return { count: rows.length };
      },
      update: async ({ where, data }: { where: { id: string }; data: { stockQuantity: { increment: number } } }) => {
        const row = state.rewards.find((item) => item.id === where.id)!;
        row.stockQuantity = (row.stockQuantity as number) + data.stockQuantity.increment;
        return row;
      },
    },
    brasilPointsRedemption: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (state.failNextCreate) {
          state.failNextCreate = false;
          throw new Error("queda do banco");
        }
        const row = { id: id(), ...data } as Row;
        state.redemptions.push(row);
        return row;
      },
      findUnique: async ({ where }: { where: { id: string } }) => state.redemptions.find((row) => row.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(state.redemptions.find((row) => row.id === where.id)!, data),
    },
  };
  // Transação: em erro, desfaz tudo o que a função escreveu (como o PostgreSQL).
  const $transaction = async <T,>(fn: (client: typeof tx) => Promise<T>) => {
    const snapshot = JSON.stringify({ ledger: state.ledger, rewards: state.rewards, redemptions: state.redemptions });
    try {
      return await fn(tx);
    } catch (error) {
      const restored = JSON.parse(snapshot) as typeof state;
      state.ledger = restored.ledger;
      state.rewards = restored.rewards;
      state.redemptions = restored.redemptions;
      throw error;
    }
  };
  return { state, prisma: { ...tx, $transaction } };
});
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: db.prisma }));

import { redeemReward, reviewRedemption } from "@/lib/brasil-points/engine";

const seedBalance = (userId: string, points: number) => db.state.ledger.push({ id: `seed-${userId}`, userId, points, type: "earn", referenceType: "manual", referenceId: null, eventKey: "manual_bonus" });
const balance = (userId: string) => db.state.ledger.filter((row) => row.userId === userId).reduce((sum, row) => sum + (row.points as number), 0);

describe("Brasil Points: resgate de prêmio", () => {
  beforeEach(() => {
    db.state.ledger = [];
    db.state.redemptions = [];
    db.state.rewards = [{ id: "folga", title: "Folga de 1 dia", pointsCost: 300, stockQuantity: 1, isActive: true }];
  });

  it("debita saldo e estoque na mesma transação e registra o resgate pendente no extrato", async () => {
    seedBalance("u-ana", 500);
    const result = await redeemReward("u-ana", "folga");
    expect(result.balance).toBe(200);
    expect(result.redemption).toMatchObject({ status: "pending", pointsSpent: 300 });
    expect(db.state.rewards[0].stockQuantity).toBe(0);
    expect(db.state.ledger.at(-1)).toMatchObject({ type: "redeem", points: -300, balanceAfter: 200, referenceType: "redemption", eventKey: "redeem" });
    // Sem estoque: o próximo resgate é recusado e nada é debitado.
    seedBalance("u-bia", 500);
    await expect(redeemReward("u-bia", "folga")).rejects.toThrow("esgotado");
    expect(balance("u-bia")).toBe(500);
  });

  it("saldo insuficiente não resgata; falha no meio desfaz estoque e pontos (atômico)", async () => {
    seedBalance("u-ana", 100);
    await expect(redeemReward("u-ana", "folga")).rejects.toThrow("Saldo insuficiente: faltam 200 pontos.");
    seedBalance("u-ana", 400);
    db.state.failNextCreate = true;
    await expect(redeemReward("u-ana", "folga")).rejects.toThrow("queda do banco");
    expect(db.state.rewards[0].stockQuantity).toBe(1);
    expect(balance("u-ana")).toBe(500);
    expect(db.state.redemptions).toHaveLength(0);
  });

  it("recusar devolve os pontos (estorno no extrato) e o estoque; não dá para recusar duas vezes", async () => {
    seedBalance("u-ana", 300);
    const { redemption } = await redeemReward("u-ana", "folga");
    expect(balance("u-ana")).toBe(0);
    await reviewRedemption({ id: redemption.id, status: "rejected", notes: "Escala cheia nesta semana", by: "Gestora" });
    expect(balance("u-ana")).toBe(300);
    expect(db.state.rewards[0].stockQuantity).toBe(1);
    expect(db.state.ledger.at(-1)).toMatchObject({ type: "adjustment", points: 300, referenceId: redemption.id, eventKey: "refund", createdBy: "Gestora" });
    await expect(reviewRedemption({ id: redemption.id, status: "rejected", notes: "de novo", by: "Gestora" })).rejects.toThrow("finalizado");
    expect(balance("u-ana")).toBe(300);
  });

  it("aprovar e entregar não mexem no saldo", async () => {
    seedBalance("u-ana", 300);
    const { redemption } = await redeemReward("u-ana", "folga");
    await reviewRedemption({ id: redemption.id, status: "approved", notes: null, by: "Gestora" });
    await reviewRedemption({ id: redemption.id, status: "delivered", notes: null, by: "Gestora" });
    expect(balance("u-ana")).toBe(0);
    expect(db.state.redemptions[0].status).toBe("delivered");
  });
});
