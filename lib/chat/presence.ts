/**
 * Presença realista antes de cada bloco enviado pelo motor (IA, automações): "digitando..." para texto e
 * "gravando áudio" para nota de voz, com tempo calculado pelo tamanho do texto ou pela duração do áudio.
 * Sem banco: testável e compartilhado.
 *
 * Provedor atual (WhatsApp Cloud API): o indicador nativo só tem o tipo "text" e precisa do wamid da última
 * mensagem do cliente; por isso "recording" mostra o mesmo indicador, mas com o tempo de gravação do áudio.
 */

export type PresenceKind = "composing" | "recording";
export type PresenceMode = "auto" | "custom" | "off";

export type PresenceLimits = { minMs: number; maxMs: number; textMsPerChar: number };

/** Limites padrão: 1,2 s a 20 s (o indicador da Meta dura ~25 s), ~45 ms por caractere. */
export const PRESENCE_LIMITS: PresenceLimits = { minMs: 1_200, maxMs: 20_000, textMsPerChar: 45 };
/** Override manual no nó da automação: até 20 s. */
export const PRESENCE_OVERRIDE_MAX_SECONDS = 20;
/** Bitrate do ogg/opus gerado por convertToOggOpus (32 kbps): base da estimativa da duração. */
export const VOICE_BITRATE_BPS = 32_000;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const isPresenceMode = (value: unknown): value is PresenceMode => value === "auto" || value === "custom" || value === "off";

/** Duração aproximada (s) de um ogg/opus a 32 kbps pelo tamanho do arquivo. */
export function estimateVoiceSeconds(bytes: number) {
  return Math.max(0, Math.round(((bytes * 8) / VOICE_BITRATE_BPS) * 10) / 10);
}

/**
 * Tempo de presença (ms) do bloco: off → 0; custom → segundos informados (0 a 20 s); auto → texto pelo número de
 * caracteres e áudio pela duração, sempre entre o mínimo e o máximo configurados.
 */
export function presenceDurationMs(
  input: { kind: PresenceKind; text?: string; audioSeconds?: number; mode?: PresenceMode; overrideSeconds?: number | null },
  limits: PresenceLimits = PRESENCE_LIMITS,
) {
  const mode = input.mode ?? "auto";
  if (mode === "off") return 0;
  if (mode === "custom") {
    const seconds = Number(input.overrideSeconds);
    return Number.isFinite(seconds) ? Math.round(clamp(seconds, 0, PRESENCE_OVERRIDE_MAX_SECONDS) * 1000) : 0;
  }
  const raw = input.kind === "recording"
    ? Math.max(0, Number(input.audioSeconds) || 0) * 1000
    : (input.text ?? "").trim().length * limits.textMsPerChar;
  return Math.round(clamp(raw, limits.minMs, Math.max(limits.minMs, limits.maxMs)));
}

/**
 * Mostra a presença e espera o tempo calculado antes do envio. Falha do indicador nunca impede o envio;
 * sem tempo (0), não chama o indicador.
 */
export async function simulatePresence(durationMs: number, deps: { indicate: () => Promise<unknown>; sleep?: (ms: number) => Promise<void> }) {
  if (!(durationMs > 0)) return 0;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  try {
    void Promise.resolve(deps.indicate()).catch(() => undefined);
  } catch {
    // indicador é opcional
  }
  await sleep(durationMs);
  return durationMs;
}
