/**
 * Roteamento do transbordo da IA: a IA conhece as filas ativas (id, nome e quando usar), escolhe o queue_id
 * pelo assunto e o servidor valida. Pedido de atendente sem assunto ganha 1 pergunta de triagem.
 * Sem banco aqui: testável e igual no WhatsApp e no teste da página /ia.
 */
import type { AiSettings } from "@/lib/ai/settings";

export type RoutingQueue = { id: string; name: string; description?: string | null; archived?: boolean };

const plain = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Fila "Atendimento Geral" (ou a que tiver "geral" no nome): destino de assunto genérico ou não identificado. */
export function isGeneralQueue(queue: { name: string }) {
  return /\bgeral\b/.test(plain(queue.name));
}

/** Sugestão de uso pelo nome, quando a fila não tem descrição nem dica na página /ia. */
export function defaultQueueHint(name: string) {
  const n = plain(name);
  if (/geral/.test(n)) return "assunto genérico, não identificado ou que não se encaixa nas outras filas";
  // Pós-venda antes de vendas: "pos-venda" também contém "venda".
  if (/pos.?venda|assist|garant|suporte|tecnic/.test(n)) return "ajuste, conserto, garantia, troca, defeito, acompanhamento de pedido já comprado, prazo de entrega";
  if (/vend|comerc|loja virtual|orcament/.test(n)) return "orçamento, compra, preços, receita para fazer óculos ou lentes, disponibilidade de produto";
  if (/financ|cobranc|boleto|credi/.test(n)) return "boleto, pagamento, parcelas, nota fiscal, cobrança, crediário";
  if (/\blj\b|loja|unidade/.test(n)) return `cliente da ${name} (atendimento daquela unidade)`;
  return "";
}

/** Bloco do prompt com as filas que a IA pode escolher. */
export function queueRoutingBlock(queues: RoutingQueue[], hints: Record<string, string>) {
  const active = queues.filter((queue) => !queue.archived);
  if (!active.length) return "";
  const lines = active.map((queue) => {
    const hint = hints[queue.id]?.trim() || queue.description?.trim() || defaultQueueHint(queue.name) || "sem descrição";
    return `- queue_id "${queue.id}": ${queue.name} — usar para: ${hint}`;
  });
  return `FILAS DE TRANSBORDO (escolha uma pelo queue_id ao transferir):\n${lines.join("\n")}`;
}

/** Regra fixa no código: rotear direto quando o assunto é claro; 1 pergunta de triagem quando não é. */
export const ROUTING_RULES = [
  "ROTEAMENTO DO TRANSBORDO (regra fixa):",
  "- Ao transferir (action \"handoff\"), preencha \"queue_id\" com a fila cujo uso combina com o assunto da conversa, e \"reason\" com um resumo curto para o atendente do que o cliente precisa (ex.: \"Orçamento de óculos de grau com receita nova\").",
  "- Roteamento direto: se a conversa já deixa claro o assunto (orçamento, receita, compra → vendas/comercial; ajuste, conserto, garantia, troca, pedido já comprado → pós-venda/assistência; pagamento, boleto → financeiro; loja específica → fila da loja), transfira já para essa fila, sem perguntas repetidas.",
  "- Triagem em 1 pergunta: se o cliente só pedir um atendente sem dizer o assunto, faça UMA pergunta curta para identificar o setor (ex.: \"Claro! Só para eu te encaminhar para a equipe certa: é sobre orçamento/compra, acompanhamento de pedido ou assistência/garantia?\"). Se depois disso continuar genérico, transfira para a fila de atendimento geral.",
  "- Nunca invente queue_id: use só os da lista de filas.",
].join("\n");

/** Instruções extras do turno quando o cliente pediu uma pessoa. */
export const TRIAGE_NOW = "O cliente pediu um atendente sem dizer o assunto: NÃO transfira ainda. Responda (action \"reply\") só com a pergunta curta de triagem do setor, cumprimentando se for a primeira resposta.";
export const ROUTE_NOW = "O cliente pediu para falar com uma pessoa: transfira agora (action \"handoff\"), escolhendo o queue_id pelo assunto da conversa (genérico ou não identificado → atendimento geral) e com o resumo em \"reason\". Não faça mais perguntas.";

const FILLER = new Set(("quero queria gostaria preciso precisava falar conversar com um uma o a os as atendente atendentes atendimento pessoa pessoas humano humana " +
  "alguem real por favor pf pfv pls oi ola opa bom dia boa tarde noite me passa passar transfere transferir transfira pode poderia voce vc vcs chamar chama " +
  "ai ser de do da verdade tudo bem e sim ok quem para pra no na agora urgente rapido logo isso aqui gente equipe").split(" "));

/** Pedido de pessoa sem assunto ("quero falar com um atendente", "atendente por favor"). */
export function isBareHumanRequest(text: string, keywords: string[] = []) {
  let rest = ` ${plain(text).replace(/[^a-z0-9\s]/g, " ")} `;
  for (const keyword of keywords) {
    const term = plain(keyword).replace(/[^a-z0-9\s]/g, " ").trim();
    if (term) rest = rest.split(` ${term} `).join(" ");
  }
  const meaningful = rest.split(/\s+/).filter((word) => word.length >= 2 && !FILLER.has(word));
  return meaningful.length === 0;
}

export type HumanRequestMode = "direct" | "triage" | "route" | null;

/**
 * Pedido de pessoa (palavra de transferência): sem a IA escolhendo fila, transfere direto como antes.
 * Com a IA escolhendo: sem assunto e antes da 1ª resposta da IA → 1 pergunta de triagem; senão → transfere já, roteando.
 */
export function humanRequestMode(settings: Pick<AiSettings, "aiChoosesQueue" | "handoffKeywords">, input: { pendingText: string; aiReplies: number; asked: boolean }): HumanRequestMode {
  if (!input.asked) return null;
  if (!settings.aiChoosesQueue) return "direct";
  if (input.aiReplies === 0 && isBareHumanRequest(input.pendingText, settings.handoffKeywords)) return "triage";
  return "route";
}

export type QueueChoice = { queueId: string | null; source: "fixed" | "ai" | "fallback" | "current" | "none" };

/**
 * Fila final do transbordo, validada no servidor: escolha da IA (id ou nome) se existir e estiver ativa;
 * senão a fila padrão da configuração; senão "Atendimento Geral"; senão a fila atual da conversa.
 */
export function resolveHandoffQueue(queues: RoutingQueue[], input: { fixedQueueId: string; aiChooses: boolean; chosen?: string; currentQueueId: string | null }): QueueChoice {
  const active = queues.filter((queue) => !queue.archived);
  const byId = (id: string | null | undefined) => (id ? active.find((queue) => queue.id === id) : undefined);
  if (input.fixedQueueId && !input.aiChooses && byId(input.fixedQueueId)) return { queueId: input.fixedQueueId, source: "fixed" };
  const chosen = input.chosen?.trim();
  if (input.aiChooses && chosen) {
    const match = byId(chosen) ?? active.find((queue) => plain(queue.name) === plain(chosen));
    if (match) return { queueId: match.id, source: "ai" };
  }
  const fallback = byId(input.fixedQueueId) ?? active.find(isGeneralQueue);
  if (fallback) return { queueId: fallback.id, source: "fallback" };
  const current = byId(input.currentQueueId);
  if (current) return { queueId: current.id, source: "current" };
  return { queueId: null, source: "none" };
}

/** Espera assistida: a conversa já está na fila humana e a IA segue ajudando sem transferir de novo. */
export function queuedAssistBlock(queueName: string | null | undefined) {
  const fila = queueName?.trim() ? `na fila ${queueName.trim()}` : "na fila de atendimento";
  return [
    `ESTADO DA CONVERSA: o cliente já foi transferido e está aguardando atendimento ${fila} (alreadyQueued = true). Nenhum atendente assumiu ainda.`,
    "- Continue respondendo com atenção total: dúvidas, produtos, estoque, endereços e horários das lojas e informações gerais.",
    "- NÃO transfira de novo (não use action \"handoff\") e não repita que vai transferir ou encaminhar para a fila.",
    `- Se o cliente perguntar pelo atendente humano, tranquilize: diga que ele já está ${fila} e logo um atendente assume por aqui, e que enquanto isso pode perguntar o que precisar.`,
    "- Não cumprimente de novo.",
  ].join("\n");
}
