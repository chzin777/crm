/**
 * Aniversário e idade a partir de Contact.birthDate (texto). Formatos aceitos, iguais aos do SQL em
 * app/api/segments/audience/route.ts: "1980-02-10", "10/02/1980" e o Date.toString() da importação
 * ("Sun Feb 10 1980 00:00:00 GMT+0000 (...)"). Datas inválidas ou vazias não entram no critério.
 */

export type BirthParts = { year: number; month: number; day: number };
export type BirthdayOperator = "today" | "this_week" | "this_month" | "month" | "age";

const MONTHS_EN = "JanFebMarAprMayJunJulAugSepOctNovDec";

export const MONTH_NAMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export function parseBirthDate(value: string | null | undefined): BirthParts | null {
  const text = (value ?? "").trim();
  let parts: BirthParts | null = null;
  let match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (match) parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  else if ((match = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(text))) parts = { year: Number(match[3]), month: Number(match[2]), day: Number(match[1]) };
  else if ((match = /^[A-Z][a-z]{2} ([A-Z][a-z]{2}) (\d{2}) (\d{4})/.exec(text))) {
    const index = MONTHS_EN.indexOf(match[1]);
    parts = { year: Number(match[3]), month: index >= 0 && index % 3 === 0 ? index / 3 + 1 : 0, day: Number(match[2]) };
  }
  if (!parts || parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > 31 || parts.year < 1900) return null;
  return parts;
}

export const isLeapYear = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/** Mês e dia como número (MMDD). Quem nasceu em 29/02 comemora em 28/02 nos anos não bissextos. */
export function birthdayKey(birth: BirthParts, year: number) {
  if (birth.month === 2 && birth.day === 29 && !isLeapYear(year)) return 228;
  return birth.month * 100 + birth.day;
}

/** Idade completa em `today`: só soma o ano depois do aniversário daquele ano. */
export function ageOn(birth: BirthParts, today: BirthParts) {
  const beforeBirthday = birth.month * 100 + birth.day > today.month * 100 + today.day;
  return today.year - birth.year - (beforeBirthday ? 1 : 0);
}

const toParts = (date: Date): BirthParts => ({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() });

/** Segunda a domingo da semana de `today` (mesma regra do date_trunc('week') do Postgres). */
export function weekKeys(today: BirthParts) {
  const base = new Date(Date.UTC(today.year, today.month - 1, today.day));
  const monday = new Date(base);
  monday.setUTCDate(base.getUTCDate() - ((base.getUTCDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, offset) => {
    const day = new Date(monday);
    day.setUTCDate(monday.getUTCDate() + offset);
    const parts = toParts(day);
    return parts.month * 100 + parts.day;
  });
}

const toInt = (value: string | undefined) => (value === undefined || value.trim() === "" ? null : Number(value));

/** Se o contato atende ao critério de aniversário/idade em `today` (dia de Brasília). Sem data válida, nunca atende. */
export function matchesBirthday(birthDate: string | null | undefined, operator: BirthdayOperator, today: BirthParts, valor?: string, valor2?: string): boolean {
  const birth = parseBirthDate(birthDate);
  if (!birth || birth.year > today.year) return false;
  switch (operator) {
    case "today": return birthdayKey(birth, today.year) === today.month * 100 + today.day;
    case "this_week": return weekKeys(today).includes(birthdayKey(birth, today.year));
    case "this_month": return birth.month === today.month;
    case "month": return birth.month === toInt(valor);
    case "age": {
      const age = ageOn(birth, today);
      const min = toInt(valor);
      const max = toInt(valor2);
      return (min === null || age >= min) && (max === null || age <= max);
    }
  }
}

export function describeBirthday(operator: string, valor?: string, valor2?: string) {
  switch (operator) {
    case "today": return "Aniversariantes de hoje";
    case "this_week": return "Aniversariantes desta semana";
    case "this_month": return "Aniversariantes deste mês";
    case "month": return `Aniversariantes de ${MONTH_NAMES[(toInt(valor) ?? 0) - 1] ?? "—"}`;
    case "age": {
      const min = toInt(valor);
      const max = toInt(valor2);
      if (min !== null && max !== null) return `Idade entre ${min} e ${max} anos`;
      if (min !== null) return `Idade a partir de ${min} anos`;
      return `Idade até ${max} anos`;
    }
    default: return "Idade e aniversário";
  }
}

/** Erro de preenchimento do critério, ou null. */
export function validateBirthday(operator: string, valor?: string, valor2?: string): string | null {
  if (operator === "month") {
    const month = toInt(valor);
    return month !== null && Number.isInteger(month) && month >= 1 && month <= 12 ? null : "Escolha o mês dos aniversariantes.";
  }
  if (operator !== "age") return null;
  const min = toInt(valor);
  const max = toInt(valor2);
  if (min === null && max === null) return "Informe a idade mínima, a máxima ou as duas.";
  for (const value of [min, max]) {
    if (value !== null && (!Number.isInteger(value) || value < 0 || value > 130)) return "Informe idades entre 0 e 130 anos.";
  }
  if (min !== null && max !== null && min > max) return "A idade mínima não pode passar da máxima.";
  return null;
}
