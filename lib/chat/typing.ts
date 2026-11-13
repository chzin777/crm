/**
 * Indicador nativo de "digitando..." da WhatsApp Cloud API: marca a mensagem do cliente como lida e mostra a
 * animação por até 25 s (some sozinha quando a resposta chega). Sem banco: testável e usado pela IA e pelo /chat.
 */

/** Versão da Graph API (typing_indicator exige v21.0 ou superior). */
export const WHATSAPP_GRAPH_API = "https://graph.facebook.com/v21.0";
export const TYPING_TIMEOUT_MS = 5_000;
/** O indicador dura ~25 s na Meta: renova uma vez se a resposta ainda não saiu em 20 s. */
export const TYPING_RENEW_MS = 20_000;
/** Atendente digitando no /chat: no máximo uma chamada a cada 15 s. */
export const TYPING_THROTTLE_MS = 15_000;

export function typingPayload(messageId: string) {
  return { messaging_product: "whatsapp", status: "read", message_id: messageId, typing_indicator: { type: "text" } };
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal; cache?: RequestCache }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/**
 * Envia o "digitando..." sem nunca lançar erro: wamid expirado, Meta fora ou tempo esgotado viram só um aviso no log.
 * Devolve true quando a Meta aceitou.
 */
export async function sendWhatsAppTypingIndicator(input: { phoneNumberId: string; accessToken: string; messageId: string; fetch?: FetchLike; timeoutMs?: number }): Promise<boolean> {
  if (!input.phoneNumberId || !input.accessToken || !input.messageId) return false;
  const doFetch: FetchLike = input.fetch ?? ((url, init) => fetch(url, init));
  try {
    const response = await doFetch(`${WHATSAPP_GRAPH_API}/${input.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${input.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(typingPayload(input.messageId)),
      signal: AbortSignal.timeout(input.timeoutMs ?? TYPING_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: { message?: string; code?: number } } | null;
      console.warn(`[meta] digitando... recusado (${response.status}, código ${body?.error?.code ?? "?"}): ${body?.error?.message ?? "sem detalhe"}`);
      return false;
    }
    return true;
  } catch (error) {
    console.warn(`[meta] digitando... não enviado: ${error instanceof Error ? error.message : error}`);
    return false;
  }
}

/**
 * Mostra "digitando..." enquanto `work` roda: dispara antes do trabalho (sem esperar a Meta) e renova uma vez
 * se ainda não terminou em 20 s. Falha do indicador nunca afeta o trabalho.
 */
export async function withTyping<T>(typing: () => Promise<unknown>, work: () => Promise<T>, renewAfterMs = TYPING_RENEW_MS): Promise<T> {
  // Chamada antes do trabalho começar, sem esperar a resposta da Meta; erro (até síncrono) é ignorado.
  const fire = () => {
    try {
      void Promise.resolve(typing()).catch(() => undefined);
    } catch {
      // indicador é opcional
    }
  };
  fire();
  const timer = setTimeout(fire, renewAfterMs);
  try {
    return await work();
  } finally {
    clearTimeout(timer);
  }
}

/** Throttle simples do /chat: true quando já pode chamar de novo. */
export function typingAllowed(lastAt: number, now: number, gapMs = TYPING_THROTTLE_MS) {
  return now - lastAt >= gapMs;
}
