import "server-only";
import { readAiSettings, recordAiUsage } from "@/lib/ai/store";

/** Cliente mínimo da OpenAI (Chat Completions via fetch): a chave fica só no servidor (.env). */
const API_URL = "https://api.openai.com/v1/chat/completions";
const TIMEOUT_MS = 45_000;

export class AiError extends Error {
  constructor(message: string, readonly status = 502, readonly creditExhausted = false) {
    super(message);
  }
}

export const aiConfigured = () => !!process.env.OPENAI_API_KEY?.trim();

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type AiCallMeta = { feature: string; conversationId?: string | null; userId?: string | null; maxTokens?: number };

/** Erros da OpenAI traduzidos para a equipe: nunca expõe a chave nem o corpo bruto. */
function friendlyError(status: number, code: string | undefined, type: string | undefined) {
  if (code === "credit_balance_exhausted" || type === "insufficient_quota") return new AiError("A conta da OpenAI está sem créditos. Adicione créditos em platform.openai.com para usar a IA.", 402, true);
  if (status === 401) return new AiError("A chave da OpenAI é inválida ou foi revogada.", 502);
  if (status === 404) return new AiError("O modelo de IA configurado não existe nesta conta. Revise o modelo em Configurações.", 502);
  if (status === 429) return new AiError("Limite de uso da OpenAI atingido. Tente de novo em instantes.", 429);
  if (status >= 500) return new AiError("A OpenAI está instável no momento. Tente de novo em instantes.", 503);
  return new AiError("Não foi possível gerar a resposta da IA.", 502);
}

/** Pede uma resposta em JSON, registra tokens e custo, e devolve o objeto já lido. */
export async function aiJson<T>(messages: ChatMessage[], meta: AiCallMeta): Promise<T> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new AiError("IA não configurada: defina OPENAI_API_KEY no servidor.", 503);
  const settings = await readAiSettings();
  const model = settings.model || process.env.OPENAI_MODEL?.trim() || "gpt-5.4-mini";
  const base = { feature: meta.feature, model, conversationId: meta.conversationId, userId: meta.userId };

  let response: Response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, response_format: { type: "json_object" }, max_completion_tokens: meta.maxTokens ?? 1200 }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    await recordAiUsage({ ...base, inputTokens: 0, outputTokens: 0, ok: false, error: "Tempo esgotado" });
    throw new AiError("A IA demorou demais para responder. Tente de novo.", 504);
  }
  const body = (await response.json().catch(() => ({}))) as {
    error?: { code?: string; type?: string };
    choices?: { message?: { content?: string | null } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  if (!response.ok) {
    const error = friendlyError(response.status, body.error?.code, body.error?.type);
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
