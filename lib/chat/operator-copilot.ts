import { extractCpf } from "@/lib/ai/installments";
import type { ChatMessage } from "@/lib/ai/openai";
import { detectIntents, extractProductReference, type ChatOperationalContext, type ContextMessage, type QuickQueryKind } from "@/lib/chat/operational-context";
import type { QuickQueryParams, QuickQueryResult } from "@/lib/chat/quick-query";

/**
 * Mini-chat interno do operador no Copiloto VMSet: a IA responde ao atendente usando só consultas de leitura
 * (faturas, estoque, compras, receitas) e o contexto da conversa. Nada aqui envia mensagem ao cliente.
 */

export type CopilotTurn = { role: "operator" | "copilot"; text: string };
export type CopilotAnswer = { answer: string; customerReply: string | null; consulted: QuickQueryKind[] };
export type CopilotDeps = {
  ai: (messages: ChatMessage[]) => Promise<{ consulta?: unknown }>;
  query: (kind: QuickQueryKind, params: QuickQueryParams) => Promise<QuickQueryResult>;
};

const MAX_QUESTION = 600;

const SYSTEM = [
  "Classifique o pedido do operador escolhendo uma consulta read-only. Não responda ao cliente e não invente dados.",
  "Você recebe apenas sinais operacionais sem dados pessoais: intenção detectada, se há produto e se há identidade disponível.",
  "Devolva JSON: {\"consulta\":\"faturas|estoque|compras|receitas|nenhuma\"}.",
].join("\n");

const isQuickQueryKind = (value: unknown): value is QuickQueryKind => value === "faturas" || value === "estoque" || value === "compras" || value === "receitas";

function formatAnswer(result: QuickQueryResult) {
  const lines = [
    result.title,
    result.subtitle,
    ...result.lines.map((line) => `${line.label}: ${line.value}`),
    ...(result.candidates ?? []).map((candidate) => `${candidate.name} (CPF ${candidate.cpfMasked})`),
  ].filter(Boolean);
  return lines.slice(0, 9).join("\n");
}

export async function runOperatorCopilot(input: { question: string; context: ChatOperationalContext }, deps: CopilotDeps): Promise<CopilotAnswer> {
  const question = input.question.trim().slice(0, MAX_QUESTION);
  if (!question) return { answer: "Escreva uma pergunta.", customerReply: null, consulted: [] };
  const message: ContextMessage = { author: "customer", text: question };
  const explicitCpf = extractCpf(question);
  const detectedIntent = detectIntents([message])[0] ?? input.context.intent;
  const product = extractProductReference([message]) ?? input.context.product;
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: JSON.stringify({
        intencao: detectedIntent,
        produtoDetectado: product,
        identidadeDisponivel: Boolean(explicitCpf?.valid || input.context.cpf || input.context.name),
      }),
    },
  ];
  const plan = await deps.ai(messages);
  if (!isQuickQueryKind(plan.consulta)) return { answer: "Não identifiquei a consulta. Pergunte sobre faturas, estoque, compras/OS ou receituário.", customerReply: null, consulted: [] };

  const params: QuickQueryParams = plan.consulta === "estoque"
    ? { term: product }
    : plan.consulta === "receitas"
      ? {}
      : { cpf: explicitCpf?.valid ? explicitCpf.cpf : input.context.cpf, name: input.context.name };
  const result = await deps.query(plan.consulta, params);
  console.log(`[copiloto] consultas: ${plan.consulta}`);
  return { answer: formatAnswer(result) || result.title, customerReply: result.reply, consulted: [plan.consulta] };
}
