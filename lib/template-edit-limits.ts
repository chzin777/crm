/** Limites da Meta para modelos aprovados; rejeitados e pausados não têm limite. */
export const TEMPLATE_EDIT_LIMITS = { perDay: 1, perMonth: 10 };

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * DAY_MS;

export type TemplateEditUsage = {
  limited: boolean;
  used: number;
  limit: number;
  /** Quando a próxima edição fica liberada; null se já pode editar. */
  availableAt: string | null;
};

export function templateEditUsage(status: string, edits: Date[], now = new Date()): TemplateEditUsage {
  const limit = TEMPLATE_EDIT_LIMITS.perMonth;
  if (status !== "APPROVED") return { limited: false, used: 0, limit, availableAt: null };

  const recent = edits.map((date) => date.getTime()).filter((time) => now.getTime() - time < MONTH_MS).sort((a, b) => a - b);
  const blockedUntil: number[] = [];
  const last = recent.at(-1);
  if (last !== undefined && now.getTime() - last < DAY_MS) blockedUntil.push(last + DAY_MS);
  if (recent.length >= limit) blockedUntil.push(recent[recent.length - limit] + MONTH_MS);

  return {
    limited: true,
    used: recent.length,
    limit,
    availableAt: blockedUntil.length > 0 ? new Date(Math.max(...blockedUntil)).toISOString() : null,
  };
}

export const templateEditWindowStart = (now = new Date()) => new Date(now.getTime() - MONTH_MS);
