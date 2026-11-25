import { describe, expect, it } from "vitest";
import { formatGoal, goalProgress, paginate, storeGoals } from "@/lib/seller-goals-shared";
import { parseGoalsPayload } from "@/lib/seller-goals-schema";
import { formatMoneyMask, isAllowedNumericKey, maskMoney, moneyInputToCents, moneyInputToNumber, quantityInputToNumber } from "@/lib/money-input";

describe("metas por VALOR (R$) e por QUANTIDADE de vendas", () => {
  const sellers = [
    { storeNumber: 4, goal: 50_000, goalQty: 40, soldAmount: 25_000, soldQty: 30 },
    { storeNumber: 4, goal: 0, goalQty: 10, soldAmount: 9_000, soldQty: 12 },
    { storeNumber: 18, goal: 20_000, goalQty: 0, soldAmount: 21_000, soldQty: 8 },
  ];

  it("cria (valida) metas dos dois tipos: R$ com centavos, quantidade só inteira", () => {
    const ok = parseGoalsPayload({ month: "2026-11", goals: [{ sellerId: "a", amount: 1500.555 }, { sellerId: "b", quantity: 10 }] });
    expect("data" in ok && ok.data.goals).toEqual([{ sellerId: "a", amount: 1500.56 }, { sellerId: "b", quantity: 10 }]);
    expect("error" in parseGoalsPayload({ month: "2026-11", goals: [{ sellerId: "b", quantity: 2.5 }] })).toBe(true);
    expect("error" in parseGoalsPayload({ month: "2026-11", goals: [{ sellerId: "a", amount: "abc" }] })).toBe(true);
    expect("error" in parseGoalsPayload({ month: "2026-11", goals: [{ sellerId: "a", amount: -1 }] })).toBe(true);
    expect(parseGoalsPayload({ month: "2026-13", goals: [] })).toEqual({ error: "Informe o mês (AAAA-MM)." });
  });

  it("apura loja = soma dos vendedores nos dois tipos, com realizado e %", () => {
    const [loja4, loja18] = storeGoals(sellers);
    expect([loja4.goal, loja4.goalQty, loja4.soldAmount, loja4.soldQty, loja4.withGoal]).toEqual([50_000, 50, 34_000, 42, 2]);
    expect(goalProgress("VALOR", loja4)).toEqual({ target: 50_000, done: 34_000, percent: 68 });
    expect(goalProgress("QUANTIDADE", loja4)).toEqual({ target: 50, done: 42, percent: 84 });
    expect(goalProgress("VALOR", loja18).percent).toBe(105);
    expect(goalProgress("QUANTIDADE", loja18)).toEqual({ target: 0, done: 8, percent: 0 });
  });

  it("formata alvo e progresso conforme o tipo", () => {
    expect(formatGoal("VALOR", 50_000)).toBe("R$ 50.000");
    expect(formatGoal("QUANTIDADE", 10)).toBe("10 vendas");
    expect(formatGoal("QUANTIDADE", 1)).toBe("1 venda");
    expect(formatGoal("QUANTIDADE", 3, "un.")).toBe("3 un.");
  });
});

describe("paginação da listagem de metas", () => {
  const items = Array.from({ length: 37 }, (_, index) => index + 1);

  it("fatia a página e mostra o contador X–Y de Z", () => {
    expect(paginate(items, 1, 15)).toMatchObject({ page: 1, pages: 3, from: 1, to: 15, total: 37 });
    const last = paginate(items, 3, 15);
    expect(last.items).toEqual([31, 32, 33, 34, 35, 36, 37]);
    expect([last.from, last.to]).toEqual([31, 37]);
  });

  it("página fora do limite (ex.: depois de uma busca) volta para a última válida; lista vazia fica 0–0", () => {
    expect(paginate(items, 9, 10)).toMatchObject({ page: 4, from: 31, to: 37 });
    expect(paginate(items, 0, 10).page).toBe(1);
    expect(paginate([], 2, 10)).toMatchObject({ page: 1, pages: 1, from: 0, to: 0, total: 0, items: [] });
    expect(paginate(items.filter((n) => n % 10 === 0), 1, 10).items).toEqual([10, 20, 30]);
  });
});

describe("campos de R$ só aceitam números", () => {
  it("letras e símbolos digitados ou colados são descartados", () => {
    expect(moneyInputToCents("abc")).toBe(0);
    expect(moneyInputToCents("R$ 1.234,56")).toBe(123456);
    expect(moneyInputToCents("12a3b")).toBe(123);
    expect(moneyInputToNumber("R$ 1.234,56")).toBe(1234.56);
    expect(moneyInputToNumber("-50,00")).toBe(50);
    expect(quantityInputToNumber("12 unidades")).toBe(12);
    expect(quantityInputToNumber("abc")).toBe(0);
  });

  it("máscara BRL com centavos andando", () => {
    expect(formatMoneyMask(5)).toBe("R$ 0,05");
    expect(formatMoneyMask(123456)).toBe("R$ 1.234,56");
    expect(formatMoneyMask(0)).toBe("");
    expect(maskMoney(100)).toBe("R$ 100,00");
    // Digitar mais um "7" no fim de "R$ 1.234,56" → R$ 12.345,67
    expect(formatMoneyMask(moneyInputToCents("R$ 1.234,567"))).toBe("R$ 12.345,67");
    // Apagar o último dígito de "R$ 0,05" → vazio
    expect(formatMoneyMask(moneyInputToCents("R$ 0,0"))).toBe("");
  });

  it("teclado: bloqueia letras, libera dígitos e teclas de edição/atalhos", () => {
    expect(isAllowedNumericKey({ key: "a" })).toBe(false);
    expect(isAllowedNumericKey({ key: "e" })).toBe(false);
    expect(isAllowedNumericKey({ key: "-" })).toBe(false);
    expect(isAllowedNumericKey({ key: "7" })).toBe(true);
    expect(isAllowedNumericKey({ key: "Backspace" })).toBe(true);
    expect(isAllowedNumericKey({ key: "v", ctrlKey: true })).toBe(true);
  });
});
