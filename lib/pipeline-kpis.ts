/**
 * Indicadores do topo da página Pipelines (puro): calculados sobre os cards da pipeline ativa já carregados na tela.
 */
import { parseBrl } from "@/lib/sales-pipeline";

const DAY_MS = 24 * 60 * 60 * 1000;
export const WON_STAGE = "ganho";

export type KpiCard = {
  coluna: string;
  valor?: string;
  estimatedValue?: number | null;
  valorFaturado?: number | null;
  abertaEm?: string;
  entrouEmEtapaEm?: string;
  customerType?: string;
};

export type PipelineKpis = {
  total: number;
  open: number;
  openValue: number;
  newLast30: number;
  wonMonth: number;
  wonMonthValue: number;
  /** Ganhos ÷ total de negócios da pipeline (0 a 1); null sem negócios. */
  conversion: number | null;
  /** Valor médio dos ganhos do mês; null sem ganho. */
  averageTicket: number | null;
  overdue: number;
  recurring: number;
};

/** Valor do negócio: estimado pela IA/atendente ou o "R$" digitado no card. */
export function cardValue(card: Pick<KpiCard, "estimatedValue" | "valor">) {
  return card.estimatedValue && card.estimatedValue > 0 ? card.estimatedValue : parseBrl(card.valor) ?? 0;
}

const time = (value: string | undefined) => {
  const parsed = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

/** Mesmo mês/ano em Brasília (UTC−3), sem depender do fuso do navegador. */
const brMonth = (ms: number) => new Date(ms - 3 * 60 * 60 * 1000).toISOString().slice(0, 7);

export function pipelineKpis<T extends KpiCard>(cards: T[], options: { now?: Date; isOverdue?: (card: T) => boolean } = {}): PipelineKpis {
  const now = (options.now ?? new Date()).getTime();
  const month = brMonth(now);
  const open = cards.filter((card) => card.coluna !== WON_STAGE);
  const won = cards.filter((card) => card.coluna === WON_STAGE);
  const wonMonth = won.filter((card) => {
    const at = time(card.entrouEmEtapaEm) ?? time(card.abertaEm);
    return at !== null && brMonth(at) === month;
  });
  const wonMonthValue = wonMonth.reduce((sum, card) => sum + (card.valorFaturado && card.valorFaturado > 0 ? card.valorFaturado : cardValue(card)), 0);
  const wonWithValue = wonMonth.filter((card) => (card.valorFaturado ?? 0) > 0 || cardValue(card) > 0).length;
  return {
    total: cards.length,
    open: open.length,
    openValue: Math.round(open.reduce((sum, card) => sum + cardValue(card), 0) * 100) / 100,
    newLast30: cards.filter((card) => {
      const at = time(card.abertaEm);
      return at !== null && now - at <= 30 * DAY_MS;
    }).length,
    wonMonth: wonMonth.length,
    wonMonthValue: Math.round(wonMonthValue * 100) / 100,
    conversion: cards.length ? won.length / cards.length : null,
    averageTicket: wonWithValue ? Math.round((wonMonthValue / wonWithValue) * 100) / 100 : null,
    overdue: options.isOverdue ? open.filter(options.isOverdue).length : 0,
    recurring: cards.filter((card) => card.customerType === "recorrente").length,
  };
}
