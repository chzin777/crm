/**
 * Encerramento por inatividade do cliente (sem banco: testável e usado pelo relógio do /chat).
 *
 * Regra pela direção da última mensagem visível da conversa (notas internas e mensagens de sistema não contam):
 * - última do cliente: ele espera a equipe. Nunca avisa nem encerra; aviso pendente é cancelado ("reset").
 * - última do operador/IA/automático: depois de `askMs` sem resposta, avisa 1 vez ("warn");
 *   `closeMs` depois do aviso, ainda sem resposta, encerra ("close").
 * - alguém da equipe escreveu depois do aviso: o aviso perde efeito e a contagem recomeça ("reset").
 */

export type InactivityAction = "none" | "reset" | "warn" | "close";

export type InactivityInput = {
  lastAuthor: "customer" | "agent" | "bot" | null;
  lastAt: Date | null;
  warnedAt: Date | null;
  now: Date;
  askMs: number;
  closeMs: number;
};

export function planInactivity({ lastAuthor, lastAt, warnedAt, now, askMs, closeMs }: InactivityInput): InactivityAction {
  if (!lastAuthor || !lastAt) return warnedAt ? "reset" : "none";
  if (lastAuthor === "customer") return warnedAt ? "reset" : "none";
  if (warnedAt) {
    // O próprio aviso é gravado antes de warnedAt; mensagem da equipe depois dele reinicia a contagem.
    if (lastAt.getTime() > warnedAt.getTime()) return "reset";
    return now.getTime() - warnedAt.getTime() >= closeMs ? "close" : "none";
  }
  return now.getTime() - lastAt.getTime() >= askMs ? "warn" : "none";
}
