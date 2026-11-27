/** Mensagens carregadas ao abrir a conversa (e a cada página ao rolar para cima). */
export const MESSAGE_PAGE_SIZE = 40;

type FindMany<Row> = (args: {
  where: { conversationId: { in: string[] }; createdAt?: { gte: Date } };
  orderBy: ({ createdAt: "desc" } | { id: "desc" })[];
  take: number;
  cursor?: { id: string };
  skip?: number;
}) => Promise<Row[]>;

/**
 * Página por cursor das mensagens dos atendimentos do contato: busca as mais recentes (DESC, usa o índice
 * conversationId + createdAt) com 1 a mais para saber se há anteriores, e devolve em ordem cronológica.
 * nextCursor = a mais antiga desta página (a próxima busca começa logo antes dela).
 */
export async function latestMessagesPage<Row extends { id: string }>(findMany: FindMany<Row>, input: { sessionIds: string[]; cursor?: string | null; after?: string | null; pageSize?: number }) {
  const size = input.pageSize ?? MESSAGE_PAGE_SIZE;
  const rows = await findMany({
    where: { conversationId: { in: input.sessionIds }, ...(input.after ? { createdAt: { gte: new Date(input.after) } } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: size + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });
  const page = rows.slice(0, size);
  return { items: page.reverse(), nextCursor: rows.length > size ? page[0].id : null };
}
