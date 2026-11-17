/** Divisores entre atendimentos na timeline do contato no /chat (seguro para o navegador). */

export type ChatSession = { id: string; createdAt: string | Date; closedAt: string | Date | null };

const stamp = (value: string | Date) => {
  const date = new Date(value);
  const day = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });
  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  return `${day} às ${time}`;
};

/**
 * Divisor entre dois atendimentos na timeline do contato: aparece quando a mensagem é de outro atendimento
 * que a anterior. Mensagem sem atendimento (recém-enviada na tela) segue a anterior.
 */
export function sessionBreak(previous: { conversationId?: string } | undefined, current: { conversationId?: string }, sessions: ReadonlyMap<string, ChatSession>) {
  if (!previous?.conversationId || !current.conversationId || previous.conversationId === current.conversationId) return null;
  const ended = sessions.get(previous.conversationId);
  const started = sessions.get(current.conversationId);
  return {
    closed: ended?.closedAt ? `Atendimento encerrado em ${stamp(ended.closedAt)}` : null,
    opened: started ? `Novo atendimento iniciado em ${stamp(started.createdAt)}` : "Novo atendimento",
  };
}
