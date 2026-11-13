import { isCourtesyClosing } from "@/lib/ai/closing";

/**
 * Encerramento do atendimento pela IA (tool encerrarAtendimento): mesma sequência do botão "Encerrar" do /chat
 * (fecha a conversa no banco e envia a pesquisa de satisfação), com travas fixas no código. Sem banco nem rede.
 */

export const AI_FAREWELL = "Por nada! Qualquer coisa que precisar, é só chamar por aqui 😊";
/** Depois do encerramento, um "valeu"/"👍" nesse prazo fica na conversa encerrada (não abre outra). */
export const POST_CLOSE_WINDOW_MS = 2 * 60 * 60 * 1000;

export type CloseBlock = "disabled" | "queued" | "assigned" | "human_request" | "pending_question";
export type CloseDecision = { close: true } | { close: false; blocked: CloseBlock | null };

/**
 * Trava fixa: a IA só encerra quando pediu (tool ou action "resolved"), a opção está ligada e a conversa está só com
 * ela. Nunca encerra conversa na fila humana, com atendente atribuído, com pedido de atendente ou dúvida em aberto.
 */
export function aiCloseDecision(input: { requested: boolean; enabled: boolean; queued: boolean; assigned: boolean; asksHuman: boolean; pendingText: string }): CloseDecision {
  if (!input.requested) return { close: false, blocked: null };
  if (!input.enabled) return { close: false, blocked: "disabled" };
  if (input.queued) return { close: false, blocked: "queued" };
  if (input.assigned) return { close: false, blocked: "assigned" };
  if (input.asksHuman) return { close: false, blocked: "human_request" };
  // Pergunta nova junto do agradecimento ("obrigado! e vocês abrem sábado?"): ainda há dúvida.
  if (/\?/.test(input.pendingText) && !isCourtesyClosing(input.pendingText.replace(/\?/g, ""))) return { close: false, blocked: "pending_question" };
  return { close: true };
}

export const CLOSE_BLOCK_LABELS: Record<CloseBlock, string> = {
  disabled: "a opção de encerrar pela IA está desligada",
  queued: "o cliente está na fila aguardando atendente",
  assigned: "há um atendente na conversa",
  human_request: "o cliente pediu um atendente",
  pending_question: "o cliente ainda tem uma dúvida",
};

/**
 * Ordem obrigatória do encerramento: 1) despedida curta (uma só), 2) encerramento oficial no banco,
 * 3) pesquisa de satisfação. Falha da despedida não impede o encerramento.
 */
export async function runAiClose(farewell: string, deps: { sendFarewell: (text: string) => Promise<unknown>; close: () => Promise<boolean>; survey: () => Promise<unknown> }) {
  const steps: string[] = [];
  const text = farewell.trim() || AI_FAREWELL;
  try {
    await deps.sendFarewell(text);
    steps.push("farewell");
  } catch {
    steps.push("farewell_failed");
  }
  if (!(await deps.close())) return steps;
  steps.push("closed");
  await deps.survey();
  steps.push("survey");
  return steps;
}

/**
 * "valeu"/"ok"/"👍" logo depois do encerramento (sem conversa aberta): fica registrado na conversa encerrada,
 * sem abrir outro atendimento nem mandar nova despedida. Nota da pesquisa (0 a 10) não é cortesia: segue para o NPS.
 */
export function isPostCloseCourtesy(input: { text: string; isText: boolean; lastClosedAt: Date | null; receivedAt: Date; hasOpen: boolean }) {
  if (input.hasOpen || !input.lastClosedAt || !input.isText) return false;
  const age = input.receivedAt.getTime() - input.lastClosedAt.getTime();
  return age >= 0 && age <= POST_CLOSE_WINDOW_MS && isCourtesyClosing(input.text);
}

export const CLOSE_TOOL = {
  type: "function" as const,
  function: {
    name: "encerrarAtendimento",
    description: "Encerra o atendimento depois da sua despedida e libera a pesquisa de satisfação. Use só quando o cliente agradecer dando o assunto por resolvido e NÃO estiver aguardando atendente na fila.",
    parameters: {
      type: "object",
      properties: {
        motivoResumo: { type: "string", description: "Resumo curto do que foi resolvido, ex.: \"Informou preço e lojas do Ray-Ban Justin\"." },
      },
      required: ["motivoResumo"],
      additionalProperties: false,
    },
  },
};

/** Regra fixa do prompt (só com a opção "Encerrar quando o cliente confirmar que foi resolvido" ligada). */
export const CLOSE_RULES = [
  "ENCERRAMENTO DO ATENDIMENTO (regra fixa): quando o cliente agradecer dando o assunto por encerrado (\"muito obrigado, já me ajudou\", \"valeu, era só isso\", \"tudo certo, obrigado\", \"até mais\") e NÃO estiver aguardando atendente na fila, escreva UMA despedida breve e calorosa (ex.: \"Por nada! Qualquer coisa que precisar, é só chamar por aqui 😊\") e chame encerrarAtendimento para finalizar o atendimento e liberar a pesquisa de satisfação.",
  "No encerramento, não faça perguntas abertas (nada de \"Posso ajudar em algo mais?\"). Se o cliente agradeceu mas fez outra pergunta ou pediu um atendente, NÃO encerre: responda a pergunta.",
].join("\n");
