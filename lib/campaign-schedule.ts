import { addDays, brClock, brWallTime } from "@/lib/br-time";

/** Ritmo do disparo: lotes de `batchSize` mensagens com `intervalSeconds` de pausa entre eles; `randomDelay` espaça cada envio (1 a 4 s). */
export type CampaignCadence = { batchSize: number; intervalSeconds: number; randomDelay?: boolean };
/** Janela de horário de Brasília em que a campanha pode enviar ("HH:MM"). */
export type CampaignSendWindow = { start: string; end: string; skipSundays?: boolean };
/** Segunda mensagem (template aprovado) para quem recebeu e não respondeu nem comprou em `afterHours` horas. */
export type CampaignFollowUp = {
  enabled: boolean;
  afterHours: number;
  modelo: { name: string; language: string; params: string[]; hasImage?: boolean; buttons?: { type: string; text: string }[] } | null;
};

export const CADENCE_LIMITS = { batchSize: [1, 5000], intervalSeconds: [5, 3600] } as const;
export const FOLLOW_UP_HOURS = [1, 168] as const;

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const clamp = (value: number, [min, max]: readonly [number, number]) => Math.min(max, Math.max(min, Math.round(value)));

/** Cadência válida ou null (desligada/sem dados coerentes). */
export function normalizeCadence(value: unknown): CampaignCadence | null {
  const cadence = value as Partial<CampaignCadence> | null | undefined;
  if (!cadence || !Number.isFinite(cadence.batchSize) || !Number.isFinite(cadence.intervalSeconds)) return null;
  return {
    batchSize: clamp(cadence.batchSize as number, CADENCE_LIMITS.batchSize),
    intervalSeconds: clamp(cadence.intervalSeconds as number, CADENCE_LIMITS.intervalSeconds),
    randomDelay: cadence.randomDelay === true,
  };
}

/** Janela válida (início antes do fim, mesmo dia) ou null. */
export function normalizeWindow(value: unknown): CampaignSendWindow | null {
  const window = value as Partial<CampaignSendWindow> | null | undefined;
  if (!window || typeof window.start !== "string" || typeof window.end !== "string") return null;
  if (!TIME.test(window.start) || !TIME.test(window.end) || toMinutes(window.start) >= toMinutes(window.end)) return null;
  return { start: window.start, end: window.end, skipSundays: window.skipSundays === true };
}

/** O instante está dentro da janela (horário de Brasília)? Sem janela, sempre. */
export function insideWindow(window: CampaignSendWindow | null, now: Date = new Date()) {
  if (!window) return true;
  const clock = brClock(now);
  if (window.skipSundays && clock.weekday === 0) return false;
  const minutes = clock.hour * 60 + clock.minute;
  return minutes >= toMinutes(window.start) && minutes < toMinutes(window.end);
}

/** Próximo início de janela depois de `now` (hoje mais tarde ou nos próximos dias, pulando domingo se pedido). */
export function nextWindowStart(window: CampaignSendWindow, now: Date = new Date()): Date {
  const today = brClock(now).day;
  for (let offset = 0; offset <= 8; offset += 1) {
    const day = addDays(today, offset);
    const start = brWallTime(day, window.start);
    if (!start || start.getTime() <= now.getTime()) continue;
    if (window.skipSundays && brClock(start).weekday === 0) continue;
    return start;
  }
  return new Date(now.getTime() + 24 * 60 * 60 * 1000);
}

/** Espera depois do envio de número `sentCount` (1, 2, ...): pausa de lote ao fechar cada lote; senão o espaçamento normal. */
export function cadenceWaitMs(cadence: CampaignCadence | null, sentCount: number, baseDelayMs: number, random: () => number = Math.random) {
  if (cadence && sentCount > 0 && sentCount % cadence.batchSize === 0) return cadence.intervalSeconds * 1000;
  if (cadence?.randomDelay) return 1000 + Math.floor(random() * 3000);
  return baseDelayMs;
}

/** Follow-up válido (ligado e com template) ou null. */
export function normalizeFollowUp(value: unknown): CampaignFollowUp | null {
  const followUp = value as Partial<CampaignFollowUp> | null | undefined;
  if (!followUp?.enabled || !followUp.modelo?.name || !followUp.modelo.language) return null;
  return { enabled: true, afterHours: clamp(Number(followUp.afterHours) || 24, FOLLOW_UP_HOURS), modelo: { ...followUp.modelo, params: followUp.modelo.params ?? [] } };
}
