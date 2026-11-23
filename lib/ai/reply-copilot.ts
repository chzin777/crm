/**
 * Copiloto de resposta do /chat (sob demanda): monta o prompt com as mesmas instruções comerciais e o tom de /ia,
 * mas para o ATENDENTE revisar. Funciona com o atendimento autônomo ligado ou desligado e nunca envia nada.
 * Sem banco: testável.
 */
import { AI_TONES, type AiSettings } from "@/lib/ai/settings";

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
    customer.city ? `Cidade: ${customer.city}` : "Cidade: não informada (se for falar de produto, qualifique cidade e faixa de valor antes)",
    customer.store ? `Loja de preferência (código VMSet): ${customer.store}` : "",
    customer.tier ? `Nível do cliente: ${customer.tier}` : "",
    customer.rfvpSegment ? `Perfil RFV-P: ${customer.rfvpSegment}` : "",
    customer.campaign ? `Chegou pela campanha: "${customer.campaign}" (responda no contexto dessa campanha)` : "",
  ].filter(Boolean);
  return `Perfil do cliente:\n${lines.map((line) => `- ${line}`).join("\n")}`;
}

/** Prompt de sistema da sugestão: regras da marca + módulos/regras de /ia + tom + instruções da empresa. */
export function buildCopilotPrompt(input: { brandRules: string; modules: string; settings: AiSettings; agentName: string; knowledge: string; customer: CopilotCustomer; /** Regra do turno (ex.: mensagem vaga ou resposta curta do cliente). */ turnHint?: string }) {
  const tone = (AI_TONES.find((item) => item.id === input.settings.tone) ?? AI_TONES[0]).instruction;
  const firstName = input.agentName.trim().split(/\s+/)[0] || "atendente";
  return [
    input.brandRules,
    input.modules,
    "Você é uma consultora de vendas de ótica: objetiva, natural e acolhedora, nunca robótica. Seu foco é qualificar o cliente e conduzir para a visita à loja ou o fechamento, sempre a partir do que está acontecendo na conversa (responda ao assunto em aberto, nunca com frase genérica de primeiro contato).",
    `Tom de voz: ${tone}`,
    input.settings.canQuotePrices ? "" : "Não informe preços nem valores: diga que a loja passa o orçamento.",
    input.settings.useCustomerOrders ? "" : "Não comente pedidos ou compras anteriores do cliente.",
    input.settings.extraInstructions.trim() ? `Instruções da empresa:\n${input.settings.extraInstructions.trim()}` : "",
    `SUA TAREFA: escrever a PRÓXIMA mensagem que o atendente ${firstName} vai enviar ao cliente pelo WhatsApp, respondendo ao que ficou pendente na conversa.`,
    "- Escreva como o atendente (primeira pessoa), não como assistente virtual; não se apresente de novo se a conversa já começou.",
    "- Use as notas internas só como contexto: nunca as cite ao cliente.",
    "- Aqui você não tem ferramentas (estoque, mapa, catálogo): ignore instruções acima sobre chamá-las e não invente disponibilidade.",
    "- Nunca diga que vai consultar algo e voltar depois sem necessidade; se faltar informação (estoque, preço, receita), faça uma pergunta objetiva ou ofereça o próximo passo concreto.",
    "- Mensagem curta, adequada ao WhatsApp, sem markdown além de *negrito* pontual e sem assinatura.",
    "PROIBIÇÃO ABSOLUTA DE TRAVESSÕES E HÍFENS: nunca use travessão (—), meia-risca (–) ou hífen (-) para separar ideias, pausas, listas ou explicações. Use só vírgulas, pontos finais, pontos de interrogação ou quebras de linha (hífen só dentro de palavras e códigos, como Ray-Ban).",
    input.turnHint ?? "",
    customerProfileBlock(input.customer),
    input.knowledge ? `Informações que você pode usar:\n${input.knowledge}` : "",
    'Responda em JSON: {"reply": "texto da mensagem"}.',
  ].filter(Boolean).join("\n\n");
}
