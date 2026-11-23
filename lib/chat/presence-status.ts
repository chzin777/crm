/** Presença do operador (sem banco: usada no servidor e nas telas). */
export type PresenceStatus = "ONLINE" | "AWAY" | "OFFLINE";
export const PRESENCE_STATUSES: PresenceStatus[] = ["ONLINE", "AWAY", "OFFLINE"];

export const PRESENCE_LABELS: Record<PresenceStatus, string> = { ONLINE: "Online", AWAY: "Ausente / Pausa", OFFLINE: "Offline" };
export const PRESENCE_HINTS: Record<PresenceStatus, string> = {
  ONLINE: "Recebe novos atendimentos da fila e do rodízio",
  AWAY: "Não recebe novos; continua com os atendimentos atuais",
  OFFLINE: "Fora do atendimento",
};
/** Cor da bolinha (paleta oficial: verde elétrico, laranja e cinza). */
export const PRESENCE_DOT: Record<PresenceStatus, string> = { ONLINE: "bg-[#C4D600]", AWAY: "bg-[#F7915E]", OFFLINE: "bg-slate-300 dark:bg-slate-600" };

/** Tela do CRM aberta há pouco (pulso do /chat ou interação): sem isso, a pessoa está offline de fato. */
const CONNECTED_MS = 2 * 60 * 1000;

export const parsePresence = (value: unknown): PresenceStatus => (value === "AWAY" || value === "OFFLINE" ? value : "ONLINE");

/** Status mostrado: a escolha do operador, rebaixada para Offline quando ele não está com o CRM aberto. */
export function effectivePresence(agent: { presenceStatus?: string | null; paused?: boolean | null; lastSeenAt?: Date | string | null; lastActivityAt?: Date | string | null } | null | undefined, now = Date.now()): PresenceStatus {
  if (!agent) return "OFFLINE";
  const chosen = agent.paused && parsePresence(agent.presenceStatus) === "ONLINE" ? "AWAY" : parsePresence(agent.presenceStatus);
  if (chosen === "OFFLINE") return "OFFLINE";
  const last = Math.max(agent.lastSeenAt ? new Date(agent.lastSeenAt).getTime() : 0, agent.lastActivityAt ? new Date(agent.lastActivityAt).getTime() : 0);
  return now - last < CONNECTED_MS ? chosen : "OFFLINE";
}

/** Operador ONLINE sem interação há mais que `minutes` minutos vai para Ausente (0 desliga). */
export function shouldAutoAway(agent: { presenceStatus: string; lastActivityAt: Date | null }, minutes: number, now = Date.now()) {
  if (minutes <= 0 || parsePresence(agent.presenceStatus) !== "ONLINE" || !agent.lastActivityAt) return false;
  return now - agent.lastActivityAt.getTime() > minutes * 60 * 1000;
}

/** Assinatura do atendente no formato do WhatsApp (`*Nome:*` + quebra), sem duplicar se já estiver no texto. */
export function signWithName(text: string, name: string) {
  const clean = name.trim();
  if (!clean || !text.trim()) return text;
  const prefix = `*${clean}:*`;
  return text.trimStart().startsWith(prefix) ? text : `${prefix}\n${text}`;
}
