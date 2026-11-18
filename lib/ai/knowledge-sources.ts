import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { AiSettings } from "@/lib/ai/settings";

/**
 * Antigas "Fontes automáticas" da aba Geral, agora documentos Markdown da Base de Conhecimento.
 * Ligar/desligar o documento substitui o toggle; o texto editável vira a instrução da IA e os dados ao vivo
 * (lojas, horários, preços) continuam vindo do sistema. Não são divididos em trechos de RAG (entram inteiros).
 */
export const KNOWLEDGE_SOURCES = [
  {
    key: "lojas",
    flag: "useStores",
    title: "Fonte automática: Lojas e endereços",
    content: "# Lojas e endereços\n\nUse o cadastro de Lojas (só as lojas ativas, listadas abaixo e atualizadas automaticamente) para informar endereço, bairro e cidade.\n\n- Indique a loja mais próxima da cidade do cliente.\n- Nunca invente endereço que não está na lista.",
  },
  {
    key: "horarios",
    flag: "useOperatingHours",
    title: "Fonte automática: Horário de atendimento",
    content: "# Horário de atendimento\n\nInforme o horário com base nos horários cadastrados em Filas › Horário de atendimento (listados abaixo, horário de Brasília).\n\n- Fora do horário, avise com naturalidade quando a equipe volta.",
  },
  {
    key: "pedidos",
    flag: "useCustomerOrders",
    title: "Fonte automática: Pedidos do próprio cliente",
    content: "# Pedidos do próprio cliente\n\nVocê pode informar ao cliente dados dos pedidos dele que aparecem no histórico do ERP (data, loja, situação).\n\n- Nunca comente pedidos de outra pessoa.",
  },
  {
    key: "precos",
    flag: "canQuotePrices",
    title: "Fonte automática: Preços de referência",
    content: "# Preços de referência\n\nVocê pode citar preços usando o preço médio dos mais vendidos (listado abaixo) só como referência \"a partir de\".\n\n- Sempre diga que o valor final é confirmado na loja.",
  },
  {
    key: "crediario",
    flag: "requireApprovalForFinancialQueries",
    title: "Fonte automática: Aprovação de parcelas e crediário",
    content: "# Aprovação de parcelas e crediário\n\nPara consultar parcelas ou crediário, peça nome completo e CPF. A resposta com os valores fica pronta no /chat para o operador conferir e enviar.\n\n- Avise o cliente que um atendente vai confirmar os valores em instantes.",
  },
] as const satisfies readonly { key: string; flag: keyof AiSettings; title: string; content: string }[];

export type KnowledgeSourceKey = (typeof KNOWLEDGE_SOURCES)[number]["key"];
export const isKnowledgeSourceKey = (value: unknown): value is KnowledgeSourceKey => KNOWLEDGE_SOURCES.some((source) => source.key === value);

let seeded = false;

/** Cria os documentos que faltam (idempotente), ligados conforme a escolha que estava salva nos toggles. */
export async function ensureKnowledgeSources(settings: AiSettings) {
  if (seeded) return;
  const existing = await prisma.knowledgeDocument.findMany({ where: { systemKey: { not: null } }, select: { systemKey: true } });
  const missing = KNOWLEDGE_SOURCES.filter((source) => !existing.some((row) => row.systemKey === source.key));
  for (const source of missing) {
    try {
      await prisma.knowledgeDocument.create({
        data: { systemKey: source.key, title: source.title, content: source.content, source: "md", active: settings[source.flag] === true, status: "indexado", chunkCount: 0 },
      });
    } catch (error) {
      // Outro container (Blue/Green) criou ao mesmo tempo.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    }
  }
  seeded = true;
}

/** Toggles efetivos: o estado ligado/desligado dos documentos da Base de Conhecimento. */
export async function applyKnowledgeSources(settings: AiSettings): Promise<AiSettings> {
  await ensureKnowledgeSources(settings);
  const rows = await prisma.knowledgeDocument.findMany({ where: { systemKey: { not: null } }, select: { systemKey: true, active: true } });
  const next = { ...settings };
  for (const source of KNOWLEDGE_SOURCES) {
    const row = rows.find((item) => item.systemKey === source.key);
    if (row) next[source.flag] = row.active;
  }
  return next;
}

/** Texto Markdown das fontes ligadas (instrução da IA para cada uma). */
export async function activeSourceNotes(): Promise<Partial<Record<KnowledgeSourceKey, string>>> {
  const rows = await prisma.knowledgeDocument.findMany({ where: { systemKey: { not: null }, active: true }, select: { systemKey: true, content: true } });
  const notes: Partial<Record<KnowledgeSourceKey, string>> = {};
  for (const row of rows) if (isKnowledgeSourceKey(row.systemKey) && row.content.trim()) notes[row.systemKey] = row.content.trim();
  return notes;
}
