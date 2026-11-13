import { afterEach, describe, expect, it, vi } from "vitest";
import { sendWhatsAppTypingIndicator, typingAllowed, typingPayload, TYPING_RENEW_MS, WHATSAPP_GRAPH_API, withTyping } from "@/lib/chat/typing";

afterEach(() => vi.useRealTimers());

describe("indicador de digitando da Meta", () => {
  it("payload exato e endpoint /{phoneNumberId}/messages na Graph API v21.0", async () => {
    const fetch = vi.fn(async (_url: string, _init: { body: string; headers: Record<string, string> }) => ({ ok: true, status: 200, json: async () => ({ success: true }) }));
    const ok = await sendWhatsAppTypingIndicator({ phoneNumberId: "123", accessToken: "tok", messageId: "wamid.ABC", fetch });
    expect(ok).toBe(true);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v21.0/123/messages");
    expect(WHATSAPP_GRAPH_API).toMatch(/\/v(2[1-9]|[3-9]\d)\.0$/);
    expect(JSON.parse(init.body)).toEqual({ messaging_product: "whatsapp", status: "read", message_id: "wamid.ABC", typing_indicator: { type: "text" } });
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(typingPayload("x").typing_indicator).toEqual({ type: "text" });
  });

  it("wamid expirado, erro de rede ou tempo esgotado não lançam erro", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const refused = vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: { code: 131009, message: "message_id expirado" } }) }));
    await expect(sendWhatsAppTypingIndicator({ phoneNumberId: "1", accessToken: "t", messageId: "wamid.old", fetch: refused })).resolves.toBe(false);
    const offline = vi.fn(async () => { throw new Error("ECONNRESET"); });
    await expect(sendWhatsAppTypingIndicator({ phoneNumberId: "1", accessToken: "t", messageId: "w", fetch: offline })).resolves.toBe(false);
    const hanging = vi.fn((_url: string, init: { signal: AbortSignal }) => new Promise<never>((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("timeout")))));
    await expect(sendWhatsAppTypingIndicator({ phoneNumberId: "1", accessToken: "t", messageId: "w", fetch: hanging, timeoutMs: 20 })).resolves.toBe(false);
    await expect(sendWhatsAppTypingIndicator({ phoneNumberId: "1", accessToken: "t", messageId: "" })).resolves.toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("digitando durante a resposta da IA", () => {
  it("dispara antes da inferência/consulta de estoque", async () => {
    const order: string[] = [];
    const result = await withTyping(
      async () => { order.push("typing"); },
      async () => { order.push("estoque VMSet"); order.push("LLM"); return "resposta"; },
    );
    expect(result).toBe("resposta");
    expect(order).toEqual(["typing", "estoque VMSet", "LLM"]);
  });

  it("falha ou lentidão do indicador não bloqueia nem derruba a resposta", async () => {
    const never = () => new Promise<never>(() => undefined);
    await expect(withTyping(never, async () => "ok")).resolves.toBe("ok");
    await expect(withTyping(async () => { throw new Error("Meta fora"); }, async () => "ok")).resolves.toBe("ok");
  });

  it("renova uma única vez depois de 20 s se a resposta ainda não saiu", async () => {
    vi.useFakeTimers();
    const typing = vi.fn(async () => true);
    let finish: (value: string) => void = () => undefined;
    const pending = withTyping(typing, () => new Promise<string>((resolve) => { finish = resolve; }));
    await vi.advanceTimersByTimeAsync(0);
    expect(typing).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(TYPING_RENEW_MS);
    expect(typing).toHaveBeenCalledTimes(2);
    finish("ok");
    await expect(pending).resolves.toBe("ok");
    await vi.advanceTimersByTimeAsync(TYPING_RENEW_MS * 3);
    expect(typing).toHaveBeenCalledTimes(2);
  });

  it("resposta rápida não renova", async () => {
    vi.useFakeTimers();
    const typing = vi.fn(async () => true);
    await withTyping(typing, async () => "rápida");
    await vi.advanceTimersByTimeAsync(TYPING_RENEW_MS * 2);
    expect(typing).toHaveBeenCalledTimes(1);
  });
});

describe("atendente digitando no /chat", () => {
  it("no máximo uma chamada a cada 15 s", () => {
    expect(typingAllowed(0, 15_000)).toBe(true);
    expect(typingAllowed(10_000, 24_999)).toBe(false);
    expect(typingAllowed(10_000, 25_000)).toBe(true);
  });
});
