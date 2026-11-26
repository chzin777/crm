/**
 * Copiloto de resposta do /chat (sob demanda): monta o prompt com as mesmas instruções comerciais e o tom de /ia,
 * mas para o ATENDENTE revisar. Funciona com o atendimento autônomo ligado ou desligado e nunca envia nada.
 * Sem banco: testável.
 */
import { formatBr } from "@/lib/br-time";
import { assemblePrompt, type AssembledPrompt, type PromptModule } from "@/lib/ai/prompt-modules";
import { promptConditions } from "@/lib/ai/prompt-composer";
import type { AiSettings } from "@/lib/ai/settings";

export type CopilotCustomer = {
  name: string | null;
  city: string | null;
  store: string | null;
  tier: string | null;
  rfvpSegment: string | null;
  campaign: string | null;
};

/** Dados resumidos do cliente para a sugestão (o que for desconhecido fica de fora). */
export function customerProfileBlock(customer: CopilotCustomer) {
  const lines = [
    customer.name ? `Nome: ${customer.name}` : "",
    customer.city ? `Cidade: ${customer.city}` : "Cidade: não informada",
    customer.store ? `Loja de preferência (código VMSet): ${customer.store}` : "",
    customer.tier ? `Nível do cliente: ${customer.tier}` : "",
    customer.rfvpSegment ? `Perfil RFV-P: ${customer.rfvpSegment}` : "",
    customer.campaign ? `Chegou pela campanha: "${customer.campaign}" (responda no contexto dessa campanha)` : "",
  ].filter(Boolean);
  return `Perfil do cliente:\n${lines.map((line) => `- ${line}`).join("\n")}`;
}

/**
 * Prompt de sistema da sugestão: os mesmos módulos de /ia (condição @copiloto em vez de @atendimento), com o perfil do
 * cliente, a base de conhecimento e a dica do turno nas variáveis. Nenhum texto de instrução vem do código.
 */
export function assembleCopilotPrompt(input: { modules: PromptModule[]; settings: AiSettings; agentName: string; knowledge: string; customer: CopilotCustomer; text?: string; conversationText?: string; /** Fato do turno (ex.: mensagem vaga ou resposta curta do cliente). */ turnHint?: string; now?: Date }): AssembledPrompt {
  const now = input.now ?? new Date();
  return assemblePrompt(input.modules, {
    conversationText: input.conversationText ?? input.text ?? "",
    conditions: ["@copiloto", ...promptConditions({ text: input.text ?? "", preferredCity: input.customer.city ?? undefined })],
    vars: {
      nome_agente: input.settings.agentName,
      nome_atendente: input.agentName.trim().split(/\s+/)[0] || "atendente",
      perfil_cliente: customerProfileBlock(input.customer),
      base_conhecimento: input.knowledge,
      contexto_do_turno: input.turnHint ?? "",
      data_hora: formatBr(now, { dateStyle: "full", timeStyle: "short" }),
    },
  });
}

export function buildCopilotPrompt(input: Parameters<typeof assembleCopilotPrompt>[0]) {
  return assembleCopilotPrompt(input).system;
}
