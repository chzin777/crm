/**
 * Falhas de envio da WhatsApp Cloud API: código da Meta, motivo em português para a bolha do /chat e
 * nova tentativa com espera curta para erros passageiros. Puro (usado no servidor, no navegador e nos testes).
 */

/** Códigos em que vale tentar o mesmo celular com/sem o 9º dígito. */
export const PHONE_FALLBACK_CODES = new Set([131026, 131047]);
/** Erros passageiros da Meta: tentam de novo sozinhos (2 s e depois 5 s). */
export const TRANSIENT_CODES = new Set([131000, 130429]);
export const RETRY_DELAYS_MS = [2_000, 5_000];

const LABELS: Record<number, string> = {
  131026: "Não entregue pelo WhatsApp (número incompatível ou indisponível no momento)",
  131047: "Fora da janela de 24h: envie um modelo aprovado",
  131049: "A Meta segurou a mensagem para não saturar o cliente com marketing",
  131050: "O cliente parou de receber mensagens de marketing desta empresa",
  130472: "Número em teste da Meta: mensagens de marketing não chegam a este cliente",
  131000: "Falha passageira da Meta",
  130429: "Limite de envio da Meta atingido; tente em instantes",
  131053: "A Meta não conseguiu processar a mídia",
  131021: "Não é possível enviar para o próprio número da empresa",
};

// Falhas antigas gravadas sem o código: reconhece pelo texto em inglês da Meta.
const BY_TEXT: [RegExp, number][] = [
  [/message undeliverable/i, 131026],
  [/more than 24 hours/i, 131047],
  [/healthy ecosystem/i, 131049],
  [/part of an experiment/i, 130472],
  [/something went wrong/i, 131000],
];

/** Motivo gravado na mensagem: "(#131026) Message Undeliverable." */
export const withMetaCode = (code: number | undefined, text: string) => (code ? `(#${code}) ${text}` : text);

export function metaErrorCode(reason: string | null | undefined): number | null {
  if (!reason) return null;
  const match = reason.match(/\(#(\d{3,6})\)/);
  if (match) return Number(match[1]);
  return BY_TEXT.find(([pattern]) => pattern.test(reason))?.[1] ?? null;
}

/** Texto curto em português para a bolha e o detalhe técnico para o tooltip. */
export function describeFailure(reason: string | null | undefined): { text: string; code: number | null; detail: string } {
  const raw = (reason ?? "").trim();
  const code = metaErrorCode(raw);
  const text = (code && LABELS[code]) || raw.replace(/^\(#\d+\)\s*/, "") || "Falha no envio";
  const detail = [code ? `Erro ${code}` : "", raw].filter(Boolean).join(" · ") || "Falha no envio";
  return { text, code, detail };
}

export function isTransientMetaError(error: unknown) {
  const meta = (error ?? {}) as { code?: unknown; httpStatus?: unknown };
  return (typeof meta.code === "number" && TRANSIENT_CODES.has(meta.code)) || (typeof meta.httpStatus === "number" && meta.httpStatus >= 500);
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Envia e, em erro passageiro da Meta (131000, 130429, 5xx), tenta de novo até 2 vezes (2 s, 5 s). */
export async function sendWithRetry<T>(send: () => Promise<T>, delays: number[] = RETRY_DELAYS_MS, sleep: (ms: number) => Promise<void> = wait): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await send();
    } catch (error) {
      if (attempt >= delays.length || !isTransientMetaError(error)) throw error;
      await sleep(delays[attempt]);
    }
  }
}
