import { describe, expect, it } from "vitest";
import { ageOn, describeBirthday, matchesBirthday, parseBirthDate, validateBirthday, weekKeys } from "@/lib/birthday";

const day = (iso: string) => {
  const [year, month, date] = iso.split("-").map(Number);
  return { year, month, day: date };
};
const JS_DATE = "Sun Feb 10 1980 00:00:00 GMT+0000 (Coordinated Universal Time)";

describe("leitura da data de nascimento", () => {
  it("aceita ISO, dd/mm/aaaa e o texto da importação", () => {
    expect(parseBirthDate("1980-02-10")).toEqual({ year: 1980, month: 2, day: 10 });
    expect(parseBirthDate("10/02/1980")).toEqual({ year: 1980, month: 2, day: 10 });
    expect(parseBirthDate(JS_DATE)).toEqual({ year: 1980, month: 2, day: 10 });
  });

  it("vazio, nulo ou inválido não vira data", () => {
    expect(parseBirthDate(null)).toBeNull();
    expect(parseBirthDate("")).toBeNull();
    expect(parseBirthDate("sem data")).toBeNull();
    expect(parseBirthDate("1980-13-01")).toBeNull();
  });
});

describe("aniversariantes", () => {
  it("dia e mês batem, o ano de nascimento é ignorado", () => {
    expect(matchesBirthday("1980-11-12", "today", day("2026-11-12"))).toBe(true);
    expect(matchesBirthday("2001-11-12", "today", day("2026-11-12"))).toBe(true);
    expect(matchesBirthday("1980-11-13", "today", day("2026-11-12"))).toBe(false);
  });

  it("mês atual e mês escolhido", () => {
    expect(matchesBirthday(JS_DATE, "this_month", day("2026-02-01"))).toBe(true);
    expect(matchesBirthday(JS_DATE, "this_month", day("2026-03-01"))).toBe(false);
    expect(matchesBirthday(JS_DATE, "month", day("2026-11-12"), "2")).toBe(true);
    expect(matchesBirthday(JS_DATE, "month", day("2026-11-12"), "11")).toBe(false);
  });

  it("esta semana vai de segunda a domingo, inclusive na virada do ano", () => {
    // 12/11/2026 é quinta: semana de 09/11 a 15/11.
    expect(weekKeys(day("2026-11-12"))).toEqual([1109, 1110, 1111, 1112, 1113, 1114, 1115]);
    expect(matchesBirthday("1990-11-09", "this_week", day("2026-11-12"))).toBe(true);
    expect(matchesBirthday("1990-11-16", "this_week", day("2026-11-12"))).toBe(false);
    expect(matchesBirthday("1990-01-02", "this_week", day("2026-12-31"))).toBe(true);
  });

  it("29/02 comemora em 28/02 nos anos não bissextos", () => {
    expect(matchesBirthday("2000-02-29", "today", day("2027-02-28"))).toBe(true);
    expect(matchesBirthday("2000-02-29", "today", day("2028-02-28"))).toBe(false);
    expect(matchesBirthday("2000-02-29", "today", day("2028-02-29"))).toBe(true);
  });
});

describe("faixa etária", () => {
  it("idade só sobe depois do aniversário no ano corrente", () => {
    expect(ageOn(day("1986-11-13"), day("2026-11-12"))).toBe(39);
    expect(ageOn(day("1986-11-12"), day("2026-11-12"))).toBe(40);
    expect(ageOn(day("1986-11-11"), day("2026-11-12"))).toBe(40);
  });

  it("aceita só mínima, só máxima ou as duas", () => {
    const today = day("2026-11-12");
    expect(matchesBirthday("1986-11-12", "age", today, "40")).toBe(true);
    expect(matchesBirthday("1986-11-13", "age", today, "40")).toBe(false);
    expect(matchesBirthday("2014-11-12", "age", today, "", "12")).toBe(true);
    expect(matchesBirthday("2013-11-12", "age", today, "", "12")).toBe(false);
    expect(matchesBirthday("1970-01-01", "age", today, "40", "65")).toBe(true);
    expect(matchesBirthday("1960-01-01", "age", today, "40", "65")).toBe(false);
  });

  it("contato sem data de nascimento nunca entra", () => {
    const today = day("2026-11-12");
    for (const operator of ["today", "this_week", "this_month", "age"] as const) {
      expect(matchesBirthday(null, operator, today, "0", "130")).toBe(false);
      expect(matchesBirthday("", operator, today, "0", "130")).toBe(false);
    }
    expect(matchesBirthday(null, "month", today, "11")).toBe(false);
  });
});

describe("descrição e validação", () => {
  it("descreve em linguagem simples", () => {
    expect(describeBirthday("month", "11")).toBe("Aniversariantes de Novembro");
    expect(describeBirthday("today")).toBe("Aniversariantes de hoje");
    expect(describeBirthday("age", "40", "65")).toBe("Idade entre 40 e 65 anos");
    expect(describeBirthday("age", "40", "")).toBe("Idade a partir de 40 anos");
    expect(describeBirthday("age", "", "12")).toBe("Idade até 12 anos");
  });

  it("exige ao menos um limite de idade coerente", () => {
    expect(validateBirthday("age", "", "")).not.toBeNull();
    expect(validateBirthday("age", "65", "40")).not.toBeNull();
    expect(validateBirthday("age", "40", "")).toBeNull();
    expect(validateBirthday("month", "13")).not.toBeNull();
    expect(validateBirthday("month", "11")).toBeNull();
  });
});
