import "server-only";
import { readAiSettings, recordAiUsage } from "@/lib/ai/store";
import type { AiSettings } from "@/lib/ai/settings";
import { estimateTokens, TRANSCRIPTION_MODEL, transcriptionCostUsd } from "@/lib/ai/attachments";
import { audioFileName, type AiContentPart } from "@/lib/ai/multimodal";

/** Cliente mínimo da OpenAI (Chat Completions via fetch): a chave fica só no servidor (.env). */
const API_URL = "https://api.openai.com/v1/chat/completions";
const TRANSCRIPTION_URL = "https://api.openai.com/v1/audio/transcriptions";
const TIMEOUT_MS = 45_000;

export class AiError extends Error {
  constructor(message: string, readonly status = 502, readonly creditExhausted = false) {
    super(message);
  }
}

export const aiConfigured = () => !!process.env.OPENAI_API_KEY?.trim();

/** content em partes leva imagem (image_url) e PDF (file) junto do texto. */
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string | AiContentPart[] };
export type AiCallMeta = { feature: string; conversationId?: string | null; userId?: string | null; maxTokens?: number; settings?: AiSettings };

/** Erros da OpenAI traduzidos para a equipe: nunca expõe a chave nem o corpo bruto. */
function friendlyError(status: number, code: string | undefined, type: string | undefined) {
  if (code === "credit_balance_exhausted" || type === "insufficient_quota") return new AiError("A conta da OpenAI está sem créditos. Adicione créditos em platform.openai.com para usar a IA.", 402, true);
  if (status === 401) return new AiError("A chave da OpenAI é inválida ou foi revogada.", 502);
  if (status === 404) return new AiError("O modelo de IA configurado não existe nesta conta. Revise o modelo na página Inteligência Artificial.", 502);
  if (status === 429) return new AiError("Limite de uso da OpenAI atingido. Tente de novo em instantes.", 429);
  if (status >= 500) return new AiError("A OpenAI está instável no momento. Tente de novo em instantes.", 503);
  return new AiError("Não foi possível gerar a resposta da IA.", 502);
}

/** Pede uma resposta em JSON, registra tokens e custo, e devolve o objeto já lido. */
export async function aiJson<T>(messages: ChatMessage[], meta: AiCallMeta): Promise<T> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new AiError("IA não configurada: defina OPENAI_API_KEY no servidor.", 503);
  // O teste da página /ia usa os parâmetros ainda não salvos.
  const settings = meta.settings ?? (await readAiSettings());
  const model = settings.model || process.env.OPENAI_MODEL?.trim() || "gpt-5.4-mini";
  const base = { feature: meta.feature, model, conversationId: meta.conversationId, userId: meta.userId };

  type Body = {
    error?: { code?: string; type?: string; param?: string };
    choices?: { message?: { content?: string | null } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const call = async (temperature: number | null) => {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, response_format: { type: "json_object" }, max_completion_tokens: meta.maxTokens ?? 1200, ...(temperature === null ? {} : { temperature }) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { response, body: (await response.json().catch(() => ({}))) as Body };
  };

  let response: Response;
  let body: Body;
  try {
    ({ response, body } = await call(settings.temperature));
    // Modelo que só aceita a temperatura padrão: repete sem ela em vez de falhar.
    if (response.status === 400 && settings.temperature !== null && body.error?.param === "temperature") ({ response, body } = await call(null));
  } catch {
    await recordAiUsage({ ...base, inputTokens: 0, outputTokens: 0, ok: false, error: "Tempo esgotado" });
    throw new AiError("A IA demorou demais para responder. Tente de novo.", 504);
  }
  if (!response.ok) {
    const error = friendlyError(response.status, body.error?.code, body.error?.type);
    // Motivo original da OpenAI no log do servidor (a tela mostra a versão traduzida).
    console.error(`[ai] OpenAI ${response.status} (${meta.feature}): ${(body.error as { message?: string } | undefined)?.message ?? body.error?.code ?? "sem detalhe"}`);
    await recordAiUsage({ ...base, inputTokens: 0, outputTokens: 0, ok: false, error: error.message, creditExhausted: error.creditExhausted });
    throw error;
  }
  await recordAiUsage({ ...base, inputTokens: body.usage?.prompt_tokens ?? 0, outputTokens: body.usage?.completion_tokens ?? 0, ok: true });
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new AiError("A IA não devolveu conteúdo. Tente de novo.");
  try {
    return JSON.parse(content) as T;
  } catch {
    throw new AiError("A IA devolveu uma resposta fora do formato. Tente de novo.");
  }
}

/**
 * Transcreve o áudio do cliente (whisper-1, português). Registra no consumo pela duração do áudio;
 * os tokens gravados são a estimativa do texto transcrito.
 */
export async function transcribeAudio(audio: { name: string; mime: string; data: Uint8Array }, meta: Omit<AiCallMeta, "maxTokens">): Promise<string> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new AiError("IA não configurada: defina OPENAI_API_KEY no servidor.", 503);
  const base = { feature: "transcription", model: TRANSCRIPTION_MODEL, conversationId: meta.conversationId, userId: meta.userId };
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio.data)], { type: audio.mime.split(";")[0] || "audio/ogg" }), audioFileName(audio.mime, audio.name || "audio"));
  form.append("model", TRANSCRIPTION_MODEL);
  form.append("language", "pt");
  form.append("response_format", "verbose_json");

  type Body = { error?: { code?: string; type?: string; message?: string }; text?: string; duration?: number };
  let response: Response;
  let body: Body;
  try {
    response = await fetch(TRANSCRIPTION_URL, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(TIMEOUT_MS) });
    body = (await response.json().catch(() => ({}))) as Body;
  } catch {
    await recordAiUsage({ ...base, inputTokens: 0, outputTokens: 0, ok: false, error: "Tempo esgotado na transcrição" });
    throw new AiError("A transcrição do áudio demorou demais. Tente de novo.", 504);
  }
  if (!response.ok) {
    const error = response.status === 400 ? new AiError("Não foi possível ler este áudio. Tente outro formato (OGG, MP3, M4A, WAV ou WEBM).", 422) : friendlyError(response.status, body.error?.code, body.error?.type);
    console.error(`[ai] OpenAI ${response.status} (transcrição): ${body.error?.message ?? body.error?.code ?? "sem detalhe"}`);
    await recordAiUsage({ ...base, inputTokens: 0, outputTokens: 0, ok: false, error: error.message, creditExhausted: error.creditExhausted });
    throw error;
  }
  const text = body.text?.trim() ?? "";
  await recordAiUsage({ ...base, inputTokens: 0, outputTokens: estimateTokens(text), ok: true, costUsd: transcriptionCostUsd(Number(body.duration)) });
  return text;
}
