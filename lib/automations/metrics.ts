/** Métricas do canvas de /automacoes (badges por nó e resumo no topo do editor). */
export type NodeMetrics = { entered: number; completed: number; errors: number; sent: number; delivered: number; replied: number; sales: number; revenue: number };
export type FlowMetrics = {
  nodes: Record<string, NodeMetrics>;
  summary: { leads: number; executions: number; active: number; completed: number; failed: number; delivered: number; replied: number; sales: number; revenue: number; attributionDays: number };
};

/** Número compacto para o badge: 1.234 → "1,2 mil". */
export function compactCount(value: number) {
  if (value < 1000) return String(value);
  if (value < 1_000_000) return `${(value / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return `${(value / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
}

/** Percentual inteiro seguro (0 quando a base é 0). */
export const percent = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);
