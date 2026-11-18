/**
 * Matriz RFV-P (Recência, Frequência, Valor e Pontualidade), nota 1 a 5 por pilar, código "RFV-P" (máximo 555-5).
 * Puro (sem banco): faixas parametrizáveis, notas, segmentos e o CASE em SQL gerado das mesmas regras.
 */

export type Pillar = "r" | "f" | "v" | "p";
export const PILLARS: { key: Pillar; letter: string; label: string; hint: string }[] = [
  { key: "r", letter: "R", label: "Recência", hint: "Dias desde a última compra concluída no VMSet" },
  { key: "f", letter: "F", label: "Frequência", hint: "Compras concluídas na janela" },
  { key: "v", letter: "V", label: "Valor", hint: "Total gasto ou ticket médio na janela" },
  { key: "p", letter: "P", label: "Pontualidade", hint: "Parcelas de carnê/boleto/crédito pagas em dia" },
];

/** Cortes das notas 5, 4, 3 e 2 (abaixo do último = nota 1). */
type Cuts = [number, number, number, number];
export type RfvpSettings = {
  /** Dias máximos para nota 5, 4, 3 e 2 (mais que isso, ou nunca comprou = 1). */
  recency: { cuts: Cuts };
  /** Compras mínimas na janela para nota 5, 4, 3 e 2. */
  frequency: { months: number; cuts: Cuts };
  /** Valor mínimo (R$) na janela para nota 5, 4, 3 e 2: total gasto ou ticket médio. */
  value: { months: number; metric: "total" | "avg"; cuts: Cuts };
  /**
   * Parcelas vencidas na janela: nota k quando % pagas em dia ≥ onTime[k] OU atraso médio ≤ delay[k] dias.
   * Título em aberto vencido há mais de severeOverdueDays = nota 1. Sem crediário (só à vista/PIX/cartão) = noCredit.
   */
  punctuality: { months: number; graceDays: number; onTime: Cuts; delay: Cuts; severeOverdueDays: number; noCredit: number };
};

export const DEFAULT_RFVP: RfvpSettings = {
  recency: { cuts: [30, 90, 180, 365] },
  frequency: { months: 24, cuts: [5, 4, 3, 2] },
  value: { months: 24, metric: "total", cuts: [3000, 1500, 700, 300] },
  punctuality: { months: 24, graceDays: 0, onTime: [100, 90, 75, 50], delay: [0, 3, 10, 30], severeOverdueDays: 30, noCredit: 5 },
};

const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};
const readCuts = (raw: unknown, fallback: Cuts, max: number): Cuts => {
  const list = Array.isArray(raw) ? raw : [];
  return fallback.map((item, index) => clampInt(list[index], 0, max, item)) as Cuts;
};
const descending = (cuts: Cuts) => cuts[0] > cuts[1] && cuts[1] > cuts[2] && cuts[2] > cuts[3];
const ascending = (cuts: Cuts) => cuts[0] < cuts[1] && cuts[1] < cuts[2] && cuts[2] < cuts[3];
const atLeast = (cuts: Cuts) => cuts[0] >= cuts[1] && cuts[1] >= cuts[2] && cuts[2] >= cuts[3];
const atMost = (cuts: Cuts) => cuts[0] <= cuts[1] && cuts[1] <= cuts[2] && cuts[2] <= cuts[3];

/** Problemas das faixas digitadas (vazio = válidas). */
export function rfvpProblems(settings: RfvpSettings): string[] {
  const problems: string[] = [];
  if (!ascending(settings.recency.cuts)) problems.push("Recência: os dias precisam crescer da nota 5 para a nota 2.");
  if (!descending(settings.frequency.cuts)) problems.push("Frequência: as compras precisam diminuir da nota 5 para a nota 2.");
  if (!descending(settings.value.cuts)) problems.push("Valor: os valores precisam diminuir da nota 5 para a nota 2.");
  if (!atLeast(settings.punctuality.onTime)) problems.push("Pontualidade: o % em dia não pode aumentar da nota 5 para a nota 2.");
  if (!atMost(settings.punctuality.delay)) problems.push("Pontualidade: o atraso médio não pode diminuir da nota 5 para a nota 2.");
  return problems;
}

/** Lê o JSON salvo (ou digitado), limitando cada número; faixas fora de ordem voltam ao padrão do pilar. */
export function readRfvpSettings(raw: unknown, keepOrder = false): RfvpSettings {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, Record<string, unknown> | undefined>;
  const d = DEFAULT_RFVP;
  const recency = { cuts: readCuts(value.recency?.cuts, d.recency.cuts, 3650) };
  const frequency = { months: clampInt(value.frequency?.months, 1, 120, d.frequency.months), cuts: readCuts(value.frequency?.cuts, d.frequency.cuts, 1000) };
  const valueCfg = { months: clampInt(value.value?.months, 1, 120, d.value.months), metric: value.value?.metric === "avg" ? "avg" as const : "total" as const, cuts: readCuts(value.value?.cuts, d.value.cuts, 10_000_000) };
  const p = value.punctuality;
  const punctuality = {
    months: clampInt(p?.months, 1, 120, d.punctuality.months), graceDays: clampInt(p?.graceDays, 0, 30, d.punctuality.graceDays),
    onTime: readCuts(p?.onTime, d.punctuality.onTime, 100), delay: readCuts(p?.delay, d.punctuality.delay, 365),
    severeOverdueDays: clampInt(p?.severeOverdueDays, 1, 3650, d.punctuality.severeOverdueDays), noCredit: clampInt(p?.noCredit, 1, 5, d.punctuality.noCredit),
  };
  // keepOrder: devolve como digitado (a tela valida com rfvpProblems antes de salvar).
  if (keepOrder) return { recency, frequency, value: valueCfg, punctuality };
  return {
    recency: ascending(recency.cuts) ? recency : d.recency,
    frequency: descending(frequency.cuts) ? frequency : { ...frequency, cuts: d.frequency.cuts },
    value: descending(valueCfg.cuts) ? valueCfg : { ...valueCfg, cuts: d.value.cuts },
    punctuality: atLeast(punctuality.onTime) && atMost(punctuality.delay) ? punctuality : { ...punctuality, onTime: d.punctuality.onTime, delay: d.punctuality.delay },
  };
}

// ---------------------------------------------------------------- Notas

export type PunctualityStats = { due: number; onTime: number; avgDelay: number; maxOverdueDays: number };
export type RfvpMetrics = { daysSinceLastPurchase: number | null; purchases: number; value: number; punctuality: PunctualityStats | null };
export type RfvpScores = Record<Pillar, number>;

export function scoreRecency(days: number | null, s: RfvpSettings) {
  if (days === null) return 1;
  const index = s.recency.cuts.findIndex((cut) => days <= cut);
  return index < 0 ? 1 : 5 - index;
}
const scoreMin = (amount: number, cuts: Cuts) => { const index = cuts.findIndex((cut) => amount >= cut); return index < 0 ? 1 : 5 - index; };
export const scoreFrequency = (purchases: number, s: RfvpSettings) => scoreMin(purchases, s.frequency.cuts);
export const scoreValue = (amount: number, s: RfvpSettings) => scoreMin(amount, s.value.cuts);

export function scorePunctuality(stats: PunctualityStats | null, s: RfvpSettings) {
  const cfg = s.punctuality;
  if (stats && stats.maxOverdueDays > cfg.severeOverdueDays) return 1;
  if (!stats || stats.due <= 0) return cfg.noCredit;
  const pct = (stats.onTime / stats.due) * 100;
  const index = cfg.onTime.findIndex((cut, i) => pct >= cut || stats.avgDelay <= cfg.delay[i]);
  return index < 0 ? 1 : 5 - index;
}

export function scoreRfvp(metrics: RfvpMetrics, s: RfvpSettings): RfvpScores {
  return { r: scoreRecency(metrics.daysSinceLastPurchase, s), f: scoreFrequency(metrics.purchases, s), v: scoreValue(metrics.value, s), p: scorePunctuality(metrics.punctuality, s) };
}

export const rfvpCode = (scores: RfvpScores) => `${scores.r}${scores.f}${scores.v}-${scores.p}`;
export const RFVP_CODE_PATTERN = /^[1-5]{3}-[1-5]$/;

export function parseRfvpCode(code: string | null | undefined): RfvpScores | null {
  if (!code || !RFVP_CODE_PATTERN.test(code)) return null;
  return { r: Number(code[0]), f: Number(code[1]), v: Number(code[2]), p: Number(code[4]) };
}

// ---------------------------------------------------------------- Segmentos

type Range = [number, number];
type SegmentRule = { key: string; label: string; description: string; tone: string; dot: string; when: Partial<Record<Pillar, Range>> };

/** Primeiro que casa vence (ordem importa). Sempre há um segmento (o último não tem condição). */
export const RFVP_SEGMENTS: SegmentRule[] = [
  { key: "campeoes_pagadores", label: "Campeões Pagadores", description: "Compram muito, recentemente, gastam bem e pagam em dia.", tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300", dot: "bg-emerald-500", when: { r: [4, 5], f: [4, 5], v: [4, 5], p: [4, 5] } },
  { key: "alto_valor_risco", label: "Alto Valor com Risco de Inadimplência", description: "Gastam bem, mas atrasam ou têm parcela em aberto: cobrança cuidadosa.", tone: "bg-[#F7915E]/20 text-[#9a4a1c] dark:text-[#F7915E]", dot: "bg-[#F7915E]", when: { v: [4, 5], p: [1, 2] } },
  { key: "fieis_em_dia", label: "Fiéis em Dia", description: "Compram com frequência e pagam em dia.", tone: "bg-[#C4D600]/30 text-[#051647] dark:text-[#C4D600]", dot: "bg-[#C4D600]", when: { r: [3, 5], f: [4, 5], p: [4, 5] } },
  { key: "novos_promissores", label: "Novos Promissores", description: "Compraram há pouco tempo, ainda com poucas compras.", tone: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300", dot: "bg-sky-500", when: { r: [4, 5], f: [1, 2], p: [3, 5] } },
  { key: "inadimplentes", label: "Inadimplentes", description: "Pontualidade baixa ou título vencido há muito tempo.", tone: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300", dot: "bg-red-500", when: { p: [1, 2] } },
  { key: "em_risco", label: "Em Risco / Hibernando", description: "Já compraram com frequência, mas sumiram.", tone: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300", dot: "bg-amber-500", when: { r: [1, 2], f: [3, 5] } },
  { key: "regulares", label: "Regulares", description: "Compraram no último semestre, sem destaque.", tone: "bg-[#002187]/10 text-[#002187] dark:bg-white/10 dark:text-slate-200", dot: "bg-[#002187] dark:bg-slate-300", when: { r: [3, 5] } },
  { key: "inativos", label: "Inativos / Perdidos", description: "Sem compras recentes (ou nunca compraram).", tone: "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-400", dot: "bg-slate-400", when: {} },
];
export const RFVP_SEGMENT_BY_KEY = Object.fromEntries(RFVP_SEGMENTS.map((item) => [item.key, item]));
export const segmentLabel = (key: string | null | undefined) => (key ? RFVP_SEGMENT_BY_KEY[key]?.label ?? key : "Sem cálculo");

export function rfvpSegment(scores: RfvpScores): string {
  return RFVP_SEGMENTS.find((rule) => (Object.entries(rule.when) as [Pillar, Range][]).every(([pillar, [min, max]]) => scores[pillar] >= min && scores[pillar] <= max))!.key;
}

/** O mesmo CASE dos segmentos em SQL (colunas r, f, v, p). Só números e chaves do código: sem entrada do usuário. */
export function segmentCaseSql(columns: Record<Pillar, string>) {
  const branches = RFVP_SEGMENTS.map((rule) => {
    const parts = (Object.entries(rule.when) as [Pillar, Range][]).map(([pillar, [min, max]]) => `${columns[pillar]} BETWEEN ${min} AND ${max}`);
    return parts.length ? `WHEN ${parts.join(" AND ")} THEN '${rule.key}'` : `ELSE '${rule.key}'`;
  });
  return `CASE ${branches.join(" ")} END`;
}

/** Variáveis do contato para as mensagens das automações: {{rfvp.codigo}}, {{rfvp.r}}... */
export function rfvpVars(row: { code: string | null; segment: string | null }, prefix = "rfvp"): Record<string, string> {
  const scores = parseRfvpCode(row.code);
  return {
    [`${prefix}.codigo`]: row.code ?? "", [`${prefix}.segmento`]: row.segment ? segmentLabel(row.segment) : "",
    [`${prefix}.r`]: scores ? String(scores.r) : "", [`${prefix}.f`]: scores ? String(scores.f) : "", [`${prefix}.v`]: scores ? String(scores.v) : "", [`${prefix}.p`]: scores ? String(scores.p) : "",
  };
}

// ---------------------------------------------------------------- Gatilho "Mudança na matriz RFV-P"

export type RfvpSnapshot = { code: string; segment: string };
export const RFVP_TRIGGER_MODES = [
  { value: "segment", label: "Entrou num segmento" },
  { value: "pillar", label: "Nota de um pilar passou a ser..." },
  { value: "code", label: "Atingiu um código exato (ex.: 555-5)" },
  { value: "any", label: "Qualquer mudança no código ou segmento" },
];

/**
 * Casa quando a condição passou a valer agora (não valia antes): entrou no segmento, a nota cruzou o limite
 * (ex.: P caiu para 2 ou menos) ou atingiu o código.
 */
export function rfvpTriggerMatches(config: Record<string, unknown>, before: RfvpSnapshot, after: RfvpSnapshot): boolean {
  const mode = String(config.mode ?? "segment");
  if (mode === "any") return before.code !== after.code || before.segment !== after.segment;
  if (mode === "code") {
    const code = String(config.code ?? "").trim();
    return RFVP_CODE_PATTERN.test(code) && after.code === code && before.code !== code;
  }
  if (mode === "pillar") {
    const pillar = (["r", "f", "v", "p"] as const).find((item) => item === config.pillar) ?? "p";
    const limit = Math.round(Number(config.value)) || 0;
    const holds = (code: string) => {
      const scores = parseRfvpCode(code);
      if (!scores) return false;
      return config.operator === "gte" ? scores[pillar] >= limit : scores[pillar] <= limit;
    };
    return holds(after.code) && !holds(before.code);
  }
  const segment = String(config.segment ?? "any");
  return after.segment !== before.segment && (segment === "any" || segment === after.segment);
}

export function describeRfvpTrigger(config: Record<string, unknown>): string {
  const mode = String(config.mode ?? "segment");
  if (mode === "any") return "Qualquer mudança no RFV-P";
  if (mode === "code") return `Atingiu ${String(config.code || "(defina o código)")}`;
  if (mode === "pillar") {
    const pillar = PILLARS.find((item) => item.key === config.pillar) ?? PILLARS[3];
    return `${pillar.letter} (${pillar.label}) ${config.operator === "gte" ? "≥" : "≤"} ${Number(config.value) || 0}`;
  }
  return config.segment && config.segment !== "any" ? `Entrou em ${segmentLabel(String(config.segment))}` : "Mudou de segmento";
}
