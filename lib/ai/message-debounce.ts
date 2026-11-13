/**
 * Agrupamento de mensagens picadas: espera adaptativa pelo conteúdo da última mensagem, teto de 12 s desde a
 * primeira do lote e um buffer por conversa que dispara a IA uma única vez com o lote inteiro.
 * Sem banco: testável com relógio falso; o atendimento real usa o mesmo buffer (lib/ai/agent.ts).
 */

export const DEBOUNCE_QUICK_MS = 1_800;
export const DEBOUNCE_MEDIUM_MS = 3_800;
export const DEBOUNCE_EXTENDED_MS = 5_500;
/** Nunca espera mais de 12 s desde a primeira mensagem do lote. */
export const DEBOUNCE_MAX_WAIT_MS = 12_000;
/** Agrupamento desligado em /ia: responde quase na hora. */
export const DEBOUNCE_OFF_MS = 1_500;

export type DebounceInput = { text: string; hasMedia?: boolean; buffered?: number };

const plain = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const CONNECTIVE_END = /(?:^|\s)(e|mas|que|pra|para|com|no|na|nos|nas|de|do|da|dos|das|em|um|uma|o|a|os|as|tipo|assim|ou|por|pelo|pela|se|quando|porque|pq|tb|tambem)$/;

/**
 * Quanto esperar depois desta mensagem:
 * - ~1,8 s: pergunta fechada ("?" e mais de 15 caracteres) ou mídia com legenda completa;
 * - ~3,8 s: saudação isolada ou frase declarativa curta;
 * - ~5,5 s: fragmento (menos de 12 caracteres sem "?", termina em conectivo ou reticências) ou lote já acumulado.
 */
export function calculateAdaptiveDebounceMs(input: DebounceInput) {
  const raw = input.text?.trim() ?? "";
  const text = plain(raw);
  const question = /\?\s*$/.test(raw);
  const fragment = /(\.\.\.|…)\s*$/.test(raw) || CONNECTIVE_END.test(text.replace(/[!,.;:]+$/, "").trim());
  if (fragment) return DEBOUNCE_EXTENDED_MS;
  if (question && raw.length > 15) return DEBOUNCE_QUICK_MS;
  if (input.hasMedia && raw.length > 15) return DEBOUNCE_QUICK_MS;
  // Já há mensagens no lote: o cliente está mandando em partes.
  if ((input.buffered ?? 0) > 1) return DEBOUNCE_EXTENDED_MS;
  // Muito curta sem pergunta ("oi", "então", "bom dia"): quase sempre vem mais coisa.
  if (!question && raw.length < 12 && !input.hasMedia) return DEBOUNCE_EXTENDED_MS;
  // Saudação um pouco maior ("Boa tarde, pessoal") ou frase curta declarativa: espera média.
  return DEBOUNCE_MEDIUM_MS;
}

/** Espera final respeitando o teto de 12 s desde a primeira mensagem do lote. */
export function cappedDelay(adaptiveMs: number, batchStartedAt: number, now: number, maxWaitMs = DEBOUNCE_MAX_WAIT_MS) {
  return Math.max(0, Math.min(adaptiveMs, batchStartedAt + maxWaitMs - now));
}

export type BufferedMessage = { id: string; text: string; hasMedia?: boolean; at?: number };
export type FlushedBatch = { key: string; messages: BufferedMessage[]; startedAt: number; text: string; lastId: string };

type Timers = { set: (fn: () => void, ms: number) => unknown; clear: (handle: unknown) => void; now: () => number };

/**
 * Buffer por conversa: cada mensagem entra no lote e reinicia o disparo com a espera adaptativa (com teto);
 * ao vencer, o lote é drenado de uma vez (nenhum disparo duplicado) e entregue em ordem a onFlush.
 */
export function createMessageBuffer(options: { onFlush: (batch: FlushedBatch) => void | Promise<void>; enabled?: () => boolean; timers?: Partial<Timers> }) {
  const timers: Timers = {
    set: options.timers?.set ?? ((fn, ms) => setTimeout(fn, ms)),
    clear: options.timers?.clear ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)),
    now: options.timers?.now ?? Date.now,
  };
  const batches = new Map<string, { messages: BufferedMessage[]; startedAt: number; handle: unknown }>();

  const flush = (key: string) => {
    const batch = batches.get(key);
    if (!batch) return;
    batches.delete(key);
    const messages = [...batch.messages];
    void Promise.resolve(
      options.onFlush({ key, messages, startedAt: batch.startedAt, lastId: messages[messages.length - 1].id, text: messages.map((item) => item.text.trim()).filter(Boolean).join("\n") }),
    ).catch((error) => console.error("[ai] lote de mensagens:", error));
  };

  return {
    /** Adiciona a mensagem ao lote da conversa e devolve quanto vai esperar (ms). */
    add(key: string, message: BufferedMessage) {
      const now = timers.now();
      const batch = batches.get(key) ?? { messages: [], startedAt: now, handle: null };
      if (batch.messages.some((item) => item.id === message.id)) return null;
      if (batch.handle !== null) timers.clear(batch.handle);
      batch.messages.push({ ...message, at: message.at ?? now });
      const adaptive = options.enabled && !options.enabled() ? DEBOUNCE_OFF_MS : calculateAdaptiveDebounceMs({ text: message.text, hasMedia: message.hasMedia, buffered: batch.messages.length });
      const wait = cappedDelay(adaptive, batch.startedAt, now);
      batch.handle = timers.set(() => flush(key), wait);
      batches.set(key, batch);
      return wait;
    },
    pending: (key: string) => batches.get(key)?.messages.length ?? 0,
    flushNow: flush,
  };
}
