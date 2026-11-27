import type { ChatSession } from "@/lib/chat/session-divider";
import type { ChatMessageItem } from "@/lib/chat/types";

/**
 * Cache em memória (navegador) da última página de mensagens por conversa: reabrir uma conversa já vista ou
 * pré-carregada no hover é instantâneo; a tela revalida em segundo plano. Requisições iguais em voo são reaproveitadas.
 */
export type MessagePage = { items: ChatMessageItem[]; nextCursor: string | null; sessions?: ChatSession[] };

const MAX_ENTRIES = 40;
const PREFETCH_FRESH_MS = 15_000;
const pages = new Map<string, { page: MessagePage; at: number }>();
const inflight = new Map<string, Promise<MessagePage>>();

export function cachedMessages(conversationId: string): MessagePage | null {
  return pages.get(conversationId)?.page ?? null;
}

export function rememberMessages(conversationId: string, page: MessagePage) {
  pages.delete(conversationId);
  pages.set(conversationId, { page, at: Date.now() });
  // LRU simples: sai a conversa vista há mais tempo.
  while (pages.size > MAX_ENTRIES) pages.delete(pages.keys().next().value as string);
}

/** Últimas mensagens da conversa (rede), gravando no cache; chamadas simultâneas dividem a mesma requisição. */
export function loadLatestMessages(conversationId: string, fetcher: typeof fetch = fetch): Promise<MessagePage> {
  const running = inflight.get(conversationId);
  if (running) return running;
  const request = fetcher(`/api/chat/conversations/${conversationId}/messages`, { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) throw new Error("Falha ao carregar mensagens.");
      const page = (await response.json()) as MessagePage;
      rememberMessages(conversationId, page);
      return page;
    })
    .finally(() => inflight.delete(conversationId));
  inflight.set(conversationId, request);
  return request;
}

/** Pré-carrega no hover da lista; ignora se o cache é recente. Falha silenciosa (o clique busca de novo). */
export function prefetchMessages(conversationId: string, fetcher: typeof fetch = fetch) {
  const entry = pages.get(conversationId);
  if (entry && Date.now() - entry.at < PREFETCH_FRESH_MS) return;
  void loadLatestMessages(conversationId, fetcher).catch(() => undefined);
}

export function clearMessageCache() {
  pages.clear();
  inflight.clear();
}
