import "server-only";

/** Cliente mínimo da OpenAI (Chat Completions via fetch): a chave fica só no servidor (.env). */
const API_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-5.4-mini";
const TIMEOUT_MS = 45_000;

export class AiError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

export const aiConfigured = () => !!process.env.OPENAI_API_KEY?.trim();

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/** Erros da OpenAI traduzidos para a equipe: nunca expõe a chave nem o corpo bruto. */
function friendlyError(status: number, code: string | undefined, type: string | undefined) {
  if (code === "credit_balance_exhausted" || type === "insufficient_quota") return new AiError("A conta da OpenAI está sem créditos. Adicione créditos em platform.openai.com para usar a IA.", 402);
  if (status === 401) return new AiError("A chave da OpenAI é inválida ou foi revogada.", 502);
  if (status === 429) return new AiError("Limite de uso da OpenAI atingido. Tente de novo em instantes.", 429);
  if (status >= 500) return new AiError("A OpenAI está instável no momento. Tente de novo em instantes.", 503);
  return new AiError("Não foi possível gerar a resposta da IA.", 502);
}

/** Pede uma resposta em JSON e devolve o objeto já lido. */
export async function aiJson<T>(messages: ChatMessage[], options: { maxTokens?: number } = {}): Promise<T> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new AiError("IA não configurada: defina OPENAI_API_KEY no servidor.", 503);
  let response: Response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL,
        messages,
        response_format: { type: "json_object" },
        max_completion_tokens: options.maxTokens ?? 1200,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new AiError("A IA demorou demais para responder. Tente de novo.", 504);
  }
  const body = (await response.json().catch(() => ({}))) as {
    error?: { code?: string; type?: string };
    choices?: { message?: { content?: string | null } }[];
  };
  if (!response.ok) throw friendlyError(response.status, body.error?.code, body.error?.type);
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new AiError("A IA não devolveu conteúdo. Tente de novo.");
  try {
    return JSON.parse(content) as T;
  } catch {
    throw new AiError("A IA devolveu uma resposta fora do formato. Tente de novo.");
  }
}
