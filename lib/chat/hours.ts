/** Horário de atendimento (regra pura, sem banco): usado no webhook, na tela de configuração e nos testes. */

export type HoursSlot = { day: number; open: string; close: string };
export type HoursRule = { enabled: boolean; schedule: HoursSlot[]; autoReplyMessage: string };

export const GLOBAL_HOURS_SCOPE = "global";
export const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export const DEFAULT_AUTO_REPLY =
  "Olá! Recebemos sua mensagem, mas estamos fora do horário de atendimento ({horario}). Assim que abrirmos, respondemos por aqui.";

/** Seg a sex 08:00-18:00 e sábado 08:00-12:00, ponto de partida da tela de configuração. */
export const DEFAULT_SCHEDULE: HoursSlot[] = [
  ...[1, 2, 3, 4, 5].map((day) => ({ day, open: "08:00", close: "18:00" })),
  { day: 6, open: "08:00", close: "12:00" },
];

/** Resposta automática repetida para o mesmo cliente só depois deste intervalo. */
export const AUTO_REPLY_COOLDOWN_MS = 12 * 60 * 60 * 1000;
export const OFF_HOURS_TAG = "fora do horário";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** Mantém só faixas válidas (dia 0..6, HH:MM, abertura antes do fechamento), um registro por dia. */
export function sanitizeSchedule(input: unknown): HoursSlot[] {
  if (!Array.isArray(input)) return [];
  const byDay = new Map<number, HoursSlot>();
  for (const item of input) {
    const slot = item as Partial<HoursSlot>;
    if (typeof slot.day !== "number" || !Number.isInteger(slot.day) || slot.day < 0 || slot.day > 6) continue;
    if (typeof slot.open !== "string" || typeof slot.close !== "string" || !TIME.test(slot.open) || !TIME.test(slot.close)) continue;
    if (toMinutes(slot.open) >= toMinutes(slot.close)) continue;
    byDay.set(slot.day, { day: slot.day, open: slot.open, close: slot.close });
  }
  return [...byDay.values()].sort((a, b) => a.day - b.day);
}

/** Dia da semana e minuto do dia em Brasília, independente do fuso do servidor. */
export function brazilClock(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { day: WEEKDAY_INDEX[value("weekday")] ?? 0, minutes: Number(value("hour")) * 60 + Number(value("minute")) };
}

/** Regra desligada conta como aberto: sem configuração, nada muda no atendimento. */
export function isOpenAt(rule: Pick<HoursRule, "enabled" | "schedule">, date: Date) {
  if (!rule.enabled) return true;
  const { day, minutes } = brazilClock(date);
  const slot = sanitizeSchedule(rule.schedule).find((item) => item.day === day);
  return !!slot && minutes >= toMinutes(slot.open) && minutes < toMinutes(slot.close);
}

const hourLabel = (time: string) => (time.endsWith(":00") ? `${Number(time.slice(0, 2))}h` : time.replace(":", "h"));

/** "seg a sex, 8h às 18h; sáb, 8h às 12h": dias seguidos com o mesmo horário viram um intervalo. */
export function describeSchedule(schedule: HoursSlot[]) {
  const slots = sanitizeSchedule(schedule);
  const groups: { first: number; last: number; open: string; close: string }[] = [];
  for (const slot of slots) {
    const previous = groups[groups.length - 1];
    if (previous && previous.last === slot.day - 1 && previous.open === slot.open && previous.close === slot.close) previous.last = slot.day;
    else groups.push({ first: slot.day, last: slot.day, open: slot.open, close: slot.close });
  }
  return groups
    .map((group) => {
      const days = group.first === group.last ? WEEKDAY_SHORT[group.first] : `${WEEKDAY_SHORT[group.first]} a ${WEEKDAY_SHORT[group.last]}`;
      return `${days}, ${hourLabel(group.open)} às ${hourLabel(group.close)}`;
    })
    .join("; ");
}

export const autoReplyText = (rule: HoursRule) =>
  (rule.autoReplyMessage.trim() || DEFAULT_AUTO_REPLY).replaceAll("{horario}", describeSchedule(rule.schedule) || "horário comercial");
