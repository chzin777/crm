import { DISPATCH_TAG } from "@/lib/chat/dispatch-history";

/**
 * Lista do /chat com 1 entrada por contato: cada atendimento continua sendo um registro próprio no banco
 * (SLA, métricas, pipeline, cliente recorrente), mas a lateral mostra só o mais recente de cada cliente.
 */
export type ConversationCandidate = {
  id: string;
  contactId: string;
  status: string;
  tags: string[];
  closedAt: Date | null;
  lastMessageAt: Date | null;
  createdAt: Date;
};

export type ConsolidatedEntry = { id: string; contactId: string; totalSessions: number };

/** Conversa que só guarda envios sem resposta (campanha) não conta como atendimento. */
export const isSession = (row: Pick<ConversationCandidate, "tags">) => !row.tags.includes(DISPATCH_TAG);

const time = (value: Date | null) => value?.getTime() ?? null;
/** Momento do atendimento para escolher o mais recente do contato. */
const recency = (row: ConversationCandidate) => time(row.lastMessageAt) ?? time(row.closedAt) ?? row.createdAt.getTime();

function latestOf(rows: ConversationCandidate[]) {
  // A conversa aberta (no máximo 1 por contato, garantido pelo openKey) é sempre a atual.
  return rows.find((row) => !row.closedAt) ?? rows.reduce((best, row) => (recency(row) > recency(best) || (recency(row) === recency(best) && row.createdAt > best.createdAt) ? row : best));
}

/**
 * "all": 1 por contato, sempre o atendimento mais recente (ordem: última mensagem).
 * "closed": 1 por contato cujo atendimento mais recente está encerrado e sem nenhuma conversa aberta (ordem: encerramento).
 * `openContactIds` vem do banco inteiro: conversa aberta em outra fila também tira o cliente das encerradas.
 */
export function consolidateByContact(rows: ConversationCandidate[], tab: "all" | "closed", openContactIds: ReadonlySet<string>): ConsolidatedEntry[] {
  const byContact = new Map<string, ConversationCandidate[]>();
  for (const row of rows) {
    const list = byContact.get(row.contactId);
    if (list) list.push(row);
    else byContact.set(row.contactId, [row]);
  }

  const entries: { row: ConversationCandidate; totalSessions: number }[] = [];
  for (const [contactId, list] of byContact) {
    const sessions = list.filter(isSession);
    const totalSessions = Math.max(1, sessions.length);
    if (tab === "closed") {
      if (openContactIds.has(contactId) || !sessions.length) continue;
      const latest = latestOf(sessions);
      if (latest.status !== "closed" || !latest.closedAt) continue;
      entries.push({ row: latest, totalSessions });
    } else {
      // Contato que só recebeu campanha (sem resposta) não entra; com conversa aberta, entra sempre.
      const open = list.find((row) => !row.closedAt);
      if (open) entries.push({ row: open, totalSessions });
      else if (sessions.length) entries.push({ row: latestOf(sessions), totalSessions });
    }
  }

  const key = (row: ConversationCandidate) => (tab === "closed" ? time(row.closedAt) : time(row.lastMessageAt));
  entries.sort((a, b) => {
    const [x, y] = [key(a.row), key(b.row)];
    if (x !== y) return x === null ? 1 : y === null ? -1 : y - x;
    return a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0;
  });
  return entries.map(({ row, totalSessions }) => ({ id: row.id, contactId: row.contactId, totalSessions }));
}

/** Lembretes: 1 por contato, mantendo o retorno mais próximo (lista já ordenada por vencimento). */
export function firstPerContact<T>(items: T[], contactOf: (item: T) => string | undefined) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const contactId = contactOf(item);
    if (!contactId || seen.has(contactId)) return false;
    seen.add(contactId);
    return true;
  });
}
