/**
 * Horário oficial de Brasília. O servidor da aplicação e o Postgres rodam em UTC e o navegador pode estar em
 * qualquer fuso: todo cálculo de dia, hora ou exibição passa por aqui com o fuso explícito.
 */
export const BR_TZ = "America/Sao_Paulo";

const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: BR_TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const clockFormat = new Intl.DateTimeFormat("en-US", { timeZone: BR_TZ, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Dia (AAAA-MM-DD) em Brasília. */
export const brDay = (date: Date = new Date()) => dayFormat.format(date);

/** Soma dias a um AAAA-MM-DD (aritmética de calendário, sem fuso). */
export const addDays = (day: string, days: number) => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/** Hoje − `days` em Brasília. */
export const brDaysAgo = (days: number, now: Date = new Date()) => addDays(brDay(now), -days);

/** Dia da semana (0 = domingo), hora e minuto em Brasília. */
export function brClock(date: Date = new Date()) {
  const parts = clockFormat.formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return {
    weekday: WEEKDAYS.indexOf(part("weekday")),
    hour: Number(part("hour")),
    minute: Number(part("minute")),
    second: Number(part("second")),
    day: `${part("year")}-${part("month")}-${part("day")}`,
  };
}

/** Diferença de Brasília para UTC naquele instante, em minutos (hoje −180; segue a regra vigente do fuso). */
function brOffsetMinutes(date: Date) {
  const clock = brClock(date);
  const asUtc = Date.UTC(Number(clock.day.slice(0, 4)), Number(clock.day.slice(5, 7)) - 1, Number(clock.day.slice(8, 10)), clock.hour, clock.minute, clock.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** Instante de um horário de parede de Brasília ("2026-11-12", "09:00"), qualquer que seja o fuso do ambiente. */
export function brWallTime(day: string, time: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const guess = new Date(`${day}T${time}:00Z`);
  if (Number.isNaN(guess.getTime())) return null;
  const result = new Date(guess.getTime() - brOffsetMinutes(guess) * 60000);
  return new Date(guess.getTime() - brOffsetMinutes(result) * 60000);
}

/**
 * Janela de dias (inclusiva, AAAA-MM-DD, dias de Brasília) do critério "Compraram no ERP":
 * hoje, ontem, nos últimos N dias (hoje incluído) ou entre duas datas. null se o operador não for conhecido.
 */
export function purchaseWindow(operator: string, value: string | undefined, value2: string | undefined, now: Date = new Date()) {
  const today = brDay(now);
  switch (operator) {
    case "today": return { start: today, end: today };
    case "yesterday": { const day = addDays(today, -1); return { start: day, end: day }; }
    case "within_days": return { start: addDays(today, -Math.max(0, Math.floor(Number(value)) - 1)), end: today };
    case "between": { const [start, end] = [value ?? "", value2 ?? ""].sort(); return { start, end }; }
    default: return null;
  }
}

/** Dia útil (seg a sex) `daysAhead` dias à frente de hoje em Brasília, às `hour` horas de Brasília. */
export function brNextBusinessDay(daysAhead: number, hour: number, now: Date = new Date()) {
  let day = addDays(brDay(now), daysAhead);
  const weekday = (value: string) => new Date(`${value}T12:00:00Z`).getUTCDay();
  while (weekday(day) === 0 || weekday(day) === 6) day = addDays(day, 1);
  return brWallTime(day, `${String(hour).padStart(2, "0")}:00`) as Date;
}

/** Meia-noite de Brasília do dia informado (padrão: hoje). */
export const brStartOfDay = (day: string = brDay()) => brWallTime(day, "00:00") as Date;

/** Formata no fuso de Brasília (pt-BR); `value` aceita Date, ISO ou timestamp. */
export function formatBr(value: Date | string | number | null | undefined, options: Intl.DateTimeFormatOptions = { dateStyle: "short", timeStyle: "short" }) {
  if (value === null || value === undefined || value === "") return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { ...options, timeZone: BR_TZ }).format(date);
}
