import { describe, expect, it } from "vitest";
import {
  achievementCandidates,
  achievementKey,
  computeStandings,
  newAchievements,
  parseCampaignInput,
  prizeCount,
  ruleSummary,
  type CampaignRule,
  type SaleRow,
  type SellerRef,
} from "@/lib/sales-campaigns-shared";
import { canAccessModule, moduleForPath } from "@/lib/permissions";

const base: CampaignRule = {
  name: "Foco Stepper",
  metric: "QUANTIDADE",
  brand: "STEPPER",
  category: "ARMACAO",
  stores: [],
  startDate: "2026-11-01",
  endDate: "2026-11-30",
  audience: "INDIVIDUAL",
  groups: [],
  target: 3,
  rewardMode: "RECORRENTE",
  rewardLabel: "Voucher iFood",
  rewardAmount: 100,
};

const sale = (seller: string, store: number, brand: string, quantity: number, amount: number, extra: Partial<SaleRow> = {}): SaleRow => ({ seller, store, brand, category: "ARMACAO", quantity, amount, date: "2026-11-10", ...extra });

const refs = new Map<string, SellerRef>([
  ["ANA SOUZA", { id: "s-ana", name: "Ana Souza", storeNumber: 4 }],
  ["BRUNO LIMA", { id: "s-bruno", name: "Bruno Lima", storeNumber: 18 }],
]);

describe("campanha por QUANTIDADE filtrada por marca (Stepper) e prêmio recorrente", () => {
  const rows = [
    sale("ANA SOUZA", 4, "STEPPER", 4, 4000),
    sale("ANA SOUZA", 4, "STEPPER", 3, 3200),
    sale("ANA SOUZA", 4, "RAY BAN", 10, 9000), // outra marca: não conta
    sale("ANA SOUZA", 4, "STEPPER", 5, 5000, { date: "2026-10-31" }), // fora do período
    sale("ANA SOUZA", 4, "STEPPER", 2, 2000, { category: "OCULOS SOLAR" }), // outra categoria
    sale("BRUNO LIMA", 18, "stepper ", 2, 2100),
  ];
  const standings = computeStandings(base, rows, refs, "2026-11-15");

  it("soma só unidades Stepper/armação no período e conta 1 voucher a cada 3", () => {
    const ana = standings.sellers.find((item) => item.key === "s-ana");
    const bruno = standings.sellers.find((item) => item.key === "s-bruno");
    expect(ana?.progress).toBe(7);
    expect(ana?.prizes).toBe(2);
    expect(bruno?.progress).toBe(2);
    expect(bruno?.prizes).toBe(0);
    expect(standings.total).toBe(9);
    expect(standings.prizes).toBe(2);
    expect(standings.rewardTotal).toBe(200);
  });

  it("gera um tier por bloco com a frase do parabéns", () => {
    const candidates = achievementCandidates(base, standings);
    expect(candidates.map((item) => [item.participantKey, item.tier, item.headline])).toEqual([
      ["s-ana", 1, "3 armações Stepper vendidas"],
      ["s-ana", 2, "6 armações Stepper vendidas"],
    ]);
  });

  it("prêmio único x recorrente", () => {
    expect(prizeCount(7, 3, "RECORRENTE")).toBe(2);
    expect(prizeCount(7, 3, "UNICO")).toBe(1);
    expect(prizeCount(2.9, 3, "RECORRENTE")).toBe(0);
    expect(prizeCount(0.1 + 0.2 + 2.7, 3, "RECORRENTE")).toBe(1);
    expect(prizeCount(2999.9999999, 3000, "UNICO")).toBe(1);
    expect(prizeCount(100, 3, "RANKING")).toBe(0);
    expect(ruleSummary(base)).toBe("A cada 3 armações Stepper por vendedor = R$ 100,00 em Voucher iFood");
  });
});

describe("campanha por VALOR (R$) e ranking por grupo de lojas", () => {
  const rule: CampaignRule = {
    ...base,
    name: "Gerentes",
    metric: "VALOR",
    brand: null,
    category: null,
    audience: "GRUPO",
    groups: [
      { name: "Grupo 1", stores: [1, 2, 3] },
      { name: "Grupo 2", stores: [4, 18] },
    ],
    target: 0,
    rewardMode: "RANKING",
    rewardAmount: 500,
  };
  const rows = [
    sale("ANA SOUZA", 1, "X", 1, 10_000),
    sale("BRUNO LIMA", 2, "X", 1, 12_500.5),
    sale("CAIO", 3, "X", 1, 3_000),
    sale("ANA SOUZA", 4, "X", 1, 7_000),
    sale("BRUNO LIMA", 18, "X", 1, 9_000),
    sale("DORA", 30, "X", 1, 99_000), // loja fora dos grupos
  ];

  it("soma R$ por loja e aponta o líder de cada grupo durante o período (sem prêmio ainda)", () => {
    const standings = computeStandings(rule, rows, refs, "2026-11-20");
    expect(standings.groups.map((group) => [group.name, group.leader?.name, group.leader?.progress, group.total])).toEqual([
      ["Grupo 1", "Loja 2", 12_500.5, 25_500.5],
      ["Grupo 2", "Loja 18", 9_000, 16_000],
    ]);
    expect(standings.stores[0].name).toBe("Loja 30");
    expect(achievementCandidates(rule, standings)).toEqual([]);
  });

  it("ao fim do período o 1º de cada grupo ganha o prêmio", () => {
    const standings = computeStandings(rule, rows, refs, "2026-12-01");
    const candidates = achievementCandidates(rule, standings);
    expect(candidates.map((item) => [item.participantKey, item.tier])).toEqual([
      ["loja:2", 1],
      ["loja:18", 1],
    ]);
    expect(candidates[0].headline).toBe("1º lugar no Grupo 1 com R$ 12.500,50 vendidos");
    expect(standings.rewardTotal).toBe(1000);
  });

  it("meta por loja em R$ (único) conta prêmio para a loja", () => {
    const standings = computeStandings({ ...rule, audience: "LOJA", groups: [], rewardMode: "UNICO", target: 10_000 }, rows, refs, "2026-11-20");
    expect(standings.stores.filter((item) => item.prizes > 0).map((item) => item.name)).toEqual(["Loja 30", "Loja 2", "Loja 1"]);
  });
});

describe("registro idempotente de conquistas", () => {
  it("rodar a apuração de novo não registra nem comemora a mesma conquista duas vezes", () => {
    const standings = computeStandings(base, [sale("ANA SOUZA", 4, "STEPPER", 6, 6000)], refs, "2026-11-15");
    const candidates = achievementCandidates(base, standings);
    const first = newAchievements(candidates, []);
    expect(first).toHaveLength(2);
    const stored = first.map(achievementKey);
    expect(newAchievements(candidates, stored)).toEqual([]);
    // Nova venda completa o 3º bloco: só o tier novo entra.
    const more = achievementCandidates(base, computeStandings(base, [sale("ANA SOUZA", 4, "STEPPER", 9, 9000)], refs, "2026-11-16"));
    expect(newAchievements(more, stored).map((item) => item.tier)).toEqual([3]);
    // Candidatos repetidos na mesma rodada também não duplicam.
    expect(newAchievements([...candidates, ...candidates], [])).toHaveLength(2);
  });
});

describe("formulário e acesso", () => {
  it("valida período, meta e grupos", () => {
    expect(parseCampaignInput({ ...base, name: "" })).toEqual({ error: "Dê um nome para a campanha." });
    expect("error" in parseCampaignInput({ ...base, startDate: "2026-12-01", endDate: "2026-11-01" })).toBe(true);
    expect("error" in parseCampaignInput({ ...base, audience: "GRUPO", groups: [] })).toBe(true);
    const ok = parseCampaignInput({ ...base, brand: " stepper ", audience: "GRUPO", rewardMode: "RANKING", target: 0, groups: [{ name: "G1", stores: "1, 2, 3" }] });
    expect("value" in ok && ok.value.brand).toBe("STEPPER");
    expect("value" in ok && ok.value.stores).toEqual([1, 2, 3]);
  });

  it("/vendas/campanhas: quem gerencia metas acessa", () => {
    expect(moduleForPath("/vendas/campanhas")).toBe("premiacoes");
    expect(canAccessModule("premiacoes", { metas: true })).toBe(true);
    expect(canAccessModule("premiacoes", { lojas: true })).toBe(true);
    expect(canAccessModule("premiacoes", { chat: true })).toBe(false);
  });
});
