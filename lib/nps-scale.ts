/**
 * NPS de 0 a 10 (regras puras: tela, API, chat e automações).
 * 0 a 6 = Baixa (detrator), 7 e 8 = Boa (neutro), 9 e 10 = Excelente (promotor).
 * Avaliações antigas de 1 a 5 ficam gravadas com scale = 5 e não entram nos cálculos novos.
 */

export const NPS_MAX = 10;
export const NPS_SCALE = 10;
export const LEGACY_NPS_SCALE = 5;

export type NpsBand = "detractor" | "neutral" | "promoter";

export const NPS_BANDS: Record<NpsBand, { label: string; group: string; range: string }> = {
  detractor: { label: "Baixa", group: "Detratores", range: "0 a 6" },
  neutral: { label: "Boa", group: "Neutros", range: "7 e 8" },
  promoter: { label: "Excelente", group: "Promotores", range: "9 e 10" },
};

export function npsBand(score: number): NpsBand {
  if (score >= 9) return "promoter";
  if (score >= 7) return "neutral";
  return "detractor";
}

/** Badge da nota: vermelha (baixa), âmbar (boa) e verde (excelente). */
export const NPS_BAND_BADGE: Record<NpsBand, string> = {
  detractor: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  neutral: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  promoter: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
};

export const isNpsScore = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= NPS_MAX;

// ---------------------------------------------------------------- Tipos de pesquisa

export const NPS_SURVEY_TYPES = ["ATENDIMENTO", "PRODUTO_ADAPTACAO"] as const;
export type NpsSurveyType = (typeof NPS_SURVEY_TYPES)[number];
export const isNpsSurveyType = (value: unknown): value is NpsSurveyType => (NPS_SURVEY_TYPES as readonly unknown[]).includes(value);

export const NPS_SURVEY_LABELS: Record<NpsSurveyType, string> = {
  ATENDIMENTO: "Atendimento",
  PRODUTO_ADAPTACAO: "Produto e adaptação",
};

// ---------------------------------------------------------------- Leitura da nota no WhatsApp

const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu;
const WORDS: Record<string, number> = { zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10 };
const plain = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Nota de 0 a 10: "9", "10!", "nota 8", "8 - gostei", "dez", "10️⃣" ou o toque num botão/lista (id nps_N).
 * Frase solta como "2 óculos" ou "comprei 3" não vira nota.
 */
export function parseNps10(text: string, choiceId?: string | null): number | null {
  const picked = choiceId?.match(/^nps_(\d{1,2})$/);
  if (picked && isNpsScore(Number(picked[1]))) return Number(picked[1]);
  const clean = plain(text.replace(EMOJI, " ")).replace(/\s+/g, " ").trim();
  if (!clean) return null;
  const match = clean.match(/^(?:(?:a\s+)?nota|dou|minha nota e|e)?\s*:?\s*(\d{1,2}|zero|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)(?:\s*(?:\/\s*10|de 10))?\s*(?:[-.)!:,]\s*.*|\s+(?:pontos?|estrelas?))?[!.]*$/);
  if (!match) return null;
  const score = /^\d+$/.test(match[1]) ? Number(match[1]) : WORDS[match[1]];
  return isNpsScore(score) ? score : null;
}

// ---------------------------------------------------------------- Indicadores

export type NpsMetrics = {
  count: number;
  sum: number;
  average: number | null;
  /** % promotores − % detratores (−100 a 100); null sem respostas. */
  nps: number | null;
  promoters: number;
  neutrals: number;
  detractors: number;
};

export function npsMetrics(scores: number[]): NpsMetrics {
  const valid = scores.filter(isNpsScore);
  const promoters = valid.filter((score) => score >= 9).length;
  const detractors = valid.filter((score) => score <= 6).length;
  const sum = valid.reduce((total, score) => total + score, 0);
  return {
    count: valid.length,
    sum,
    average: valid.length ? Math.round((sum / valid.length) * 10) / 10 : null,
    nps: valid.length ? Math.round(((promoters - detractors) / valid.length) * 100) : null,
    promoters,
    neutrals: valid.length - promoters - detractors,
    detractors,
  };
}

export type NpsAnswer = { contactId: string; surveyType: string; score: number; comment?: string | null; answeredAt: Date | string; orderKey?: string | null };

export type CustomerNps = {
  contactId: string;
  count: number;
  /** Soma de todas as notas do cliente (atendimento + produto). */
  sum: number;
  /** Média geral do cliente (1 casa). */
  average: number;
  /** Última nota de cada tipo de pesquisa. */
  latest: Partial<Record<NpsSurveyType, number>>;
  lastAnsweredAt: string;
};

/** Consolidado por cliente: soma, média geral e a última nota de cada pesquisa. */
export function consolidateByCustomer(answers: NpsAnswer[]): CustomerNps[] {
  const byContact = new Map<string, NpsAnswer[]>();
  for (const answer of answers) {
    if (!isNpsScore(answer.score)) continue;
    byContact.set(answer.contactId, [...(byContact.get(answer.contactId) ?? []), answer]);
  }
  return [...byContact.entries()].map(([contactId, list]) => {
    const sorted = [...list].sort((a, b) => new Date(a.answeredAt).getTime() - new Date(b.answeredAt).getTime());
    const sum = sorted.reduce((total, item) => total + item.score, 0);
    const latest: Partial<Record<NpsSurveyType, number>> = {};
    for (const item of sorted) if (isNpsSurveyType(item.surveyType)) latest[item.surveyType] = item.score;
    return {
      contactId,
      count: sorted.length,
      sum,
      average: Math.round((sum / sorted.length) * 10) / 10,
      latest,
      lastAnsweredAt: new Date(sorted[sorted.length - 1].answeredAt).toISOString(),
    };
  }).sort((a, b) => b.lastAnsweredAt.localeCompare(a.lastAnsweredAt));
}

// ---------------------------------------------------------------- Modelo oficial (Meta) da pesquisa

/**
 * Modelos oficiais prontos (fora da janela de 24 h), um por pesquisa, sem travessões ou hífens: {{1}} = primeiro nome.
 * O cliente responde digitando o número de 0 a 10.
 */
export const NPS_TEMPLATES: Record<NpsSurveyType, { name: string; language: string; category: "UTILITY"; body: string; footer: string; examples: string[] }> = {
  ATENDIMENTO: {
    name: "nps_atendimento_0_10",
    language: "pt_BR",
    category: "UTILITY",
    body: "Olá, {{1}}! 😊 Obrigado por escolher a Óticas Brasil. Queremos muito saber como foi o seu atendimento hoje! De 0 a 10 (sendo 0 a 6 baixa, 7 e 8 boa e 9 e 10 excelente), qual nota você dá para nossa equipe? É só responder com o número!",
    footer: "Sua opinião nos ajuda a melhorar",
    examples: ["Maria"],
  },
  PRODUTO_ADAPTACAO: {
    name: "nps_produto_adaptacao_0_10",
    language: "pt_BR",
    category: "UTILITY",
    body: "Olá, {{1}}! 😊 Já faz 30 dias desde a sua compra na Óticas Brasil e queremos saber como você está se adaptando aos seus óculos! De 0 a 10 (sendo 0 a 6 baixa, 7 e 8 boa e 9 e 10 excelente), que nota você dá para o seu produto e conforto visual? Responda com o número!",
    footer: "Sua opinião nos ajuda a melhorar",
    examples: ["Maria"],
  },
};
export const npsTemplatePreset = (name: string | null | undefined) => NPS_SURVEY_TYPES.find((type) => NPS_TEMPLATES[type].name === name) ?? null;

// ---------------------------------------------------------------- Lista interativa (dentro da janela de 24 h)

/** Rodapé da lista: o WhatsApp aceita até 10 linhas, então a nota 0 vai digitada. Também marca a pesquisa no histórico. */
export const NPS_LIST_FOOTER = "Para dar nota 0, é só responder 0";
export const NPS_LIST_BUTTON = "Avaliar agora";

const NPS_LIST_BODY: Record<NpsSurveyType, string> = {
  ATENDIMENTO: "Olá, {{nome}}! 😊 Passando rapidinho para saber como foi sua experiência com a nossa equipe hoje na Óticas Brasil. Sua opinião ajuda muito a gente a melhorar cada vez mais! Toque no botão abaixo e escolha uma nota de 0 a 10:",
  PRODUTO_ADAPTACAO: "Olá, {{nome}}! 😊 Já faz 30 dias desde a sua compra na Óticas Brasil e queremos saber como você está se adaptando aos seus óculos! Toque no botão abaixo e escolha uma nota de 0 a 10:",
};

const NPS_ROW_DESCRIPTIONS: Record<number, string> = {
  10: "Excelente! Nota 10",
  9: "Muito bom! Quase perfeito",
  8: "Bom, gostei",
  7: "Razoável, dá para melhorar",
  6: "Regular, esperava mais",
  5: "Fraco, precisa melhorar",
  4: "Ruim, tive problemas",
  3: "Ruim, fiquei insatisfeito",
  2: "Muito ruim",
  1: "Péssimo",
};

/** Primeiro nome com inicial maiúscula (vazio quando não há nome). */
export const npsFirstName = (name: string | null | undefined) => {
  const first = String(name ?? "").trim().split(/\s+/)[0] ?? "";
  if (!first || /\d/.test(first)) return "";
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
};

/** {{nome}} vira o primeiro nome; sem nome, "Olá, {{nome}}!" fica "Olá!". */
export const fillNpsName = (text: string, name?: string | null) => {
  const first = npsFirstName(name);
  return first ? text.replace(/\{\{\s*nome\s*\}\}/gi, first) : text.replace(/,?\s*\{\{\s*nome\s*\}\}/gi, "");
};

/** Pergunta padrão da lista (editável em Configurações do chat). */
export const npsListBody = (surveyType: NpsSurveyType) => NPS_LIST_BODY[surveyType];

/** Lista interativa da pesquisa: botão "Avaliar agora", notas de 10 a 1 (id nps_N) e a nota 0 digitada. */
export function buildNpsList(surveyType: NpsSurveyType, name?: string | null, customBody?: string | null) {
  const descriptions: Record<number, string> = { ...NPS_ROW_DESCRIPTIONS, 10: surveyType === "ATENDIMENTO" ? "Excelente! Atendimento nota 10" : "Excelente! Óculos nota 10", 8: surveyType === "ATENDIMENTO" ? "Bom, gostei do atendimento" : "Bom, estou gostando" };
  const body = fillNpsName(customBody?.trim() || NPS_LIST_BODY[surveyType], name).slice(0, 1000);
  return {
    body,
    footer: NPS_LIST_FOOTER,
    button: NPS_LIST_BUTTON,
    rows: Array.from({ length: 10 }, (_, index) => 10 - index).map((score) => ({ id: `nps_${score}`, title: `Nota ${score}`, description: descriptions[score] })),
  };
}

/** Texto da lista gravado no /chat (o rodapé no fim marca a mensagem como pesquisa). */
export const npsListText = (list: { body: string; footer: string }) => `${list.body}\n${list.footer}`;

/**
 * Envio híbrido: janela de 24 h aberta = lista interativa (texto livre permitido); fechada = modelo oficial aprovado.
 * null = janela fechada e nenhum modelo vinculado (a Meta bloquearia o envio).
 */
export function npsDeliveryMode(input: { windowOpen: boolean; hasTemplate: boolean }): "list" | "template" | null {
  if (input.windowOpen) return "list";
  return input.hasTemplate ? "template" : null;
}

/** Modelo pronto antigo (3 variáveis): segue válido para quem já o tem aprovado e vinculado. */
export const NPS_TEMPLATE = {
  name: "nps_avaliacao_0_10",
  language: "pt_BR",
  category: "UTILITY" as const,
  body: "Olá, {{1}}! Tudo bem? Aqui é da {{2}}. De 0 a 10, que nota você dá para sua experiência com {{3}}? Sendo 0 a 6 baixa, 7 e 8 boa e 9 e 10 excelente. Basta responder com o número!",
  footer: "Sua opinião nos ajuda a melhorar",
  examples: ["Maria", "Óticas Brasil", "o atendimento na loja"],
};

export const NPS_COMPANY = "Óticas Brasil";

/** Assunto do {{3}} por tipo de pesquisa. */
export const NPS_SUBJECT: Record<NpsSurveyType, string> = {
  ATENDIMENTO: "o atendimento que você recebeu na loja",
  PRODUTO_ADAPTACAO: "seus óculos novos e a adaptação às lentes",
};

/** Variáveis padrão do modelo de NPS: {{1}} primeiro nome, {{2}} empresa, {{3}} assunto da pesquisa. */
export function npsTemplateParams(surveyType: NpsSurveyType, count = 3): string[] {
  const defaults = ["primeiro_nome", `fixo:${NPS_COMPANY}`, `fixo:${NPS_SUBJECT[surveyType]}`];
  return Array.from({ length: count }, (_, index) => defaults[index] ?? "primeiro_nome");
}

/** Chave do pedido no VMSet (loja + número) usada para nunca repetir a mesma pesquisa no mesmo pedido. */
export const npsOrderKey = (store: string | null | undefined, orderNumber: string | null | undefined) => {
  const loja = String(store ?? "").trim();
  const numero = String(orderNumber ?? "").trim();
  return loja && numero ? `${loja}-${numero}`.slice(0, 160) : null;
};
