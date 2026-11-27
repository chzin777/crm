import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cachedMessages, clearMessageCache, loadLatestMessages } from "@/lib/chat/message-cache";
import { mergeMessages } from "@/lib/chat/reconcile";
import { createActiveConversation, scopeToTimeline } from "@/lib/chat/timeline-guard";
import type { ChatMessageItem } from "@/lib/chat/types";

const msg = (id: string, conversationId: string, text: string): ChatMessageItem => ({
  id, conversationId, author: "customer", authorName: null, text, delivery: null, failureReason: null, internal: false, replyTo: null,
  createdAt: `2026-11-27T12:00:${id.padStart(2, "0").slice(-2)}.000Z`, attachment: null,
});
const page = (conversationId: string, items: ChatMessageItem[]) => ({ items, nextCursor: null, sessions: [{ id: conversationId, createdAt: "2026-11-27T10:00:00.000Z", closedAt: null }] });

/** Servidor falso: cada conversa responde no seu tempo. */
function slowServer(delays: Record<string, number>, bodies: Record<string, unknown>) {
  return vi.fn((url: string) => {
    const id = /conversations\/([^/]+)\/messages/.exec(url)![1];
    return new Promise<Response>((resolve) => setTimeout(() => resolve(new Response(JSON.stringify(bodies[id]), { status: 200 })), delays[id]));
  }) as unknown as typeof fetch;
}

/** Mesmo fluxo da timeline (MessageList): bilhete por abertura e merge só do que é do contato aberto. */
function timeline(fetcher: typeof fetch) {
  const active = createActiveConversation();
  let shown: ChatMessageItem[] = [];
  let open = "";
  let sessions: string[] = [];
  return {
    open(id: string) {
      open = id;
      sessions = [];
      shown = [];
      const ticket = active.open(id);
      return loadLatestMessages(id, fetcher).then((data) => {
        if (!ticket.isCurrent()) return;
        sessions = (data.sessions ?? []).map((session) => session.id);
        shown = mergeMessages(shown, scopeToTimeline(data.items, id, sessions));
      });
    },
    realtime(incoming: ChatMessageItem[]) {
      shown = mergeMessages(shown, scopeToTimeline(incoming, open, sessions));
    },
    get shown() {
      return shown;
    },
  };
}

describe("timeline do /chat: nunca mistura clientes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearMessageCache();
  });
  afterEach(() => vi.useRealTimers());

  it("troca rápida: A responde em 800 ms, B em 100 ms; só B fica na tela", async () => {
    const fetcher = slowServer({ A: 800, B: 100 }, {
      A: page("A", [msg("1", "A", "Syllas: resumo do transbordo")]),
      B: page("B", [msg("2", "B", "Alisson: bom dia")]),
    });
    const view = timeline(fetcher);
    const loadingA = view.open("A");
    await vi.advanceTimersByTimeAsync(50);
    const loadingB = view.open("B");
    await vi.advanceTimersByTimeAsync(1000);
    await Promise.all([loadingA, loadingB]);
    expect(view.shown.map((item) => item.conversationId)).toEqual(["B"]);
    expect(view.shown.map((item) => item.text)).toEqual(["Alisson: bom dia"]);
    // Cada conversa no seu cache.
    expect(cachedMessages("A")!.items.map((item) => item.conversationId)).toEqual(["A"]);
    expect(cachedMessages("B")!.items.map((item) => item.conversationId)).toEqual(["B"]);
  });

  it("evento em tempo real da conversa C com B aberta: zero vazamento na B", async () => {
    const view = timeline(slowServer({ B: 10 }, { B: page("B", [msg("2", "B", "Alisson: bom dia")]) }));
    const loading = view.open("B");
    await vi.advanceTimersByTimeAsync(20);
    await loading;
    view.realtime([msg("3", "C", "Thamyres: áudio"), msg("4", "B", "Alisson: obrigado")]);
    expect(view.shown.map((item) => item.text)).toEqual(["Alisson: bom dia", "Alisson: obrigado"]);
  });

  it("resposta do servidor com mensagem de outro contato é filtrada antes do cache", async () => {
    const fetcher = slowServer({ B: 10 }, { B: page("B", [msg("2", "B", "Alisson"), msg("5", "X", "outro cliente")]) });
    const loading = loadLatestMessages("B", fetcher);
    await vi.advanceTimersByTimeAsync(20);
    expect((await loading).items.map((item) => item.conversationId)).toEqual(["B"]);
  });

  it("atendimentos anteriores do MESMO contato continuam na timeline; mensagem temporária do envio passa", () => {
    const items = [msg("1", "B-antigo", "atendimento anterior"), msg("2", "B", "atual"), { ...msg("3", "B", "enviando"), conversationId: undefined }, msg("4", "Z", "intruso")];
    expect(scopeToTimeline(items, "B", ["B-antigo", "B"]).map((item) => item.id)).toEqual(["1", "2", "3"]);
  });

  it("bilhete vence ao trocar e ao fechar a conversa", () => {
    const active = createActiveConversation();
    const a = active.open("A");
    const b = active.open("B");
    expect(a.isCurrent()).toBe(false);
    expect(b.isCurrent()).toBe(true);
    active.close();
    expect(b.isCurrent()).toBe(false);
  });
});
