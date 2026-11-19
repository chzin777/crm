/**
 * Regras da fila humana × atendimento da IA (sem banco: testável e usado pelo relógio e pelo agente).
 *
 * - Enquanto a IA atende, a conversa fica com status "bot" e menuState.aiActive = true: fora da fila humana
 *   (não conta posição, não entra nos alertas de espera).
 * - No transbordo (ou quando a IA deixa de poder atender), volta para "waiting" a partir daquele momento,
 *   na fila de destino, e só então passa a ocupar posição (visível só para a equipe).
 */

type StateLike = { aiActive?: boolean; notifiedPosition?: number | null };

const stateOf = (raw: unknown): StateLike => (raw && typeof raw === "object" ? (raw as StateLike) : {});

/** Conversa sob atendimento ativo da IA (sem transbordo executado). */
export function isAiHandling(conversation: { status: string; assigneeId?: string | null; menuState: unknown }) {
  return !conversation.assigneeId && stateOf(conversation.menuState).aiActive === true && conversation.status !== "waiting";
}

/** Dados gravados quando a IA assume: sai da fila humana (posição e espera zeradas). */
export function aiTakeoverPatch() {
  return { status: "bot" as const, waitingSince: null };
}

/** Dados gravados no transbordo: entra na fila de destino agora, como qualquer cliente que acabou de chegar. */
export function handoffPatch(queueId: string | null, now: Date) {
  return { status: "waiting" as const, waitingSince: now, queueId };
}

export type QueueRow = {
  id: string;
  status: string;
  queueId: string | null;
  queueName: string | null;
  assigneeId: string | null;
  closedAt: Date | null;
  waitingSince: Date | null;
  lastInboundAt: Date | null;
  menuState: unknown;
};

export type PositionUpdate = { id: string; position: number; positionSince: string };

/**
 * Posições da fila humana (uso interno: /filas e destaque 1º/2º/3º no /chat). Só conta quem espera uma pessoa:
 * status "waiting", sem dono, aberta, com fila e fora do atendimento da IA. A fila é 100% interna e silenciosa:
 * o cliente nunca recebe mensagem sobre posição ou avanço.
 */
export function planQueuePositions(rows: QueueRow[], options: { now: Date }): PositionUpdate[] {
  const waiting = rows
    .filter((row) => row.status === "waiting" && !row.closedAt && !row.assigneeId && row.queueId && row.waitingSince && !isAiHandling(row))
    .sort((a, b) => a.waitingSince!.getTime() - b.waitingSince!.getTime());
  const counters = new Map<string, number>();
  const updates: PositionUpdate[] = [];
  for (const row of waiting) {
    const position = (counters.get(row.queueId!) ?? 0) + 1;
    counters.set(row.queueId!, position);
    const last = stateOf(row.menuState).notifiedPosition ?? null;
    if (last === position) continue;
    updates.push({ id: row.id, position, positionSince: last === null ? row.waitingSince!.toISOString() : options.now.toISOString() });
  }
  return updates;
}

/**
 * Como a IA atua numa conversa:
 * - "exclusive": a IA atende sozinha (ainda sem transbordo);
 * - "queued": já transferida e aguardando na fila, sem atendente humano: a IA continua ajudando (espera assistida),
 *   sem transferir de novo e sem tirar a conversa da fila;
 * - "paused": humano assumiu (atendente atribuído ou em atendimento), atendente já escreveu ao cliente depois do
 *   transbordo, IA pausada pelo operador ou conversa encerrada: a IA fica em silêncio.
 */
export type AiConversationMode = "exclusive" | "queued" | "paused";

export function aiConversationMode(
  conversation: { status: string; assigneeId: string | null; closedAt: Date | null; menuState?: unknown },
  flags: { handedOff: boolean; humanReplied: boolean },
): AiConversationMode {
  if (conversation.closedAt || conversation.assigneeId || conversation.status === "in_progress") return "paused";
  if (flags.humanReplied || (stateOf(conversation.menuState) as { aiPaused?: boolean }).aiPaused === true) return "paused";
  if (!flags.handedOff) return "exclusive";
  return conversation.status === "waiting" ? "queued" : "paused";
}
