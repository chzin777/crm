/**
 * Lead Score & níveis (Bronze, Prata, Ouro, Diamante). Puro: usado pelo motor, pelas rotas, pela tela e pelos testes.
 * As regras de quanto cada evento vale ficam nas automações (nó "Alterar pontuação"); aqui só as faixas dos níveis.
 */

export const TIERS = ["BRONZE", "PRATA", "OURO", "DIAMANTE"] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_META: Record<Tier, { label: string; badge: string; ring: string }> = {
  DIAMANTE: { label: "Diamante", badge: "bg-[#051647] text-[#C4D600] dark:bg-[#C4D600] dark:text-[#051647]", ring: "ring-[#051647]/20 dark:ring-[#C4D600]/40" },
  OURO: { label: "Ouro", badge: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300", ring: "ring-amber-300/60" },
  PRATA: { label: "Prata", badge: "bg-slate-200 text-slate-700 dark:bg-slate-600/40 dark:text-slate-200", ring: "ring-slate-300/70" },
  BRONZE: { label: "Bronze", badge: "bg-[#F7915E]/20 text-[#9a4a1c] dark:text-[#F7915E]", ring: "ring-[#F7915E]/40" },
};

/** Pontuação mínima de cada nível (Bronze começa em qualquer valor abaixo de Prata). */
export type TierThresholds = { PRATA: number; OURO: number; DIAMANTE: number };
export const DEFAULT_THRESHOLDS: TierThresholds = { PRATA: 100, OURO: 300, DIAMANTE: 700 };
export const SCORE_LIMIT = 1_000_000;

export const isTier = (value: unknown): value is Tier => (TIERS as readonly unknown[]).includes(value);

/** Faixas válidas: inteiros não negativos e crescentes (Prata < Ouro < Diamante). */
export function readThresholds(raw: unknown): TierThresholds {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const num = (key: keyof TierThresholds) => {
    const parsed = Math.round(Number(value[key]));
    return Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed, SCORE_LIMIT) : DEFAULT_THRESHOLDS[key];
  };
  const result = { PRATA: num("PRATA"), OURO: num("OURO"), DIAMANTE: num("DIAMANTE") };
  return result.PRATA < result.OURO && result.OURO < result.DIAMANTE ? result : DEFAULT_THRESHOLDS;
}

/** Problemas das faixas digitadas na tela (vazio = válidas). */
export function thresholdProblems(raw: Record<string, unknown>): string[] {
  const values = (["PRATA", "OURO", "DIAMANTE"] as const).map((key) => Number(raw[key]));
  if (values.some((value) => !Number.isInteger(value) || value < 0)) return ["Use números inteiros a partir de 0."];
  if (!(values[0] < values[1] && values[1] < values[2])) return ["As faixas precisam crescer: Prata < Ouro < Diamante."];
  return [];
}

export function tierFor(score: number, thresholds: TierThresholds = DEFAULT_THRESHOLDS): Tier {
  if (score >= thresholds.DIAMANTE) return "DIAMANTE";
  if (score >= thresholds.OURO) return "OURO";
  if (score >= thresholds.PRATA) return "PRATA";
  return "BRONZE";
}

export const tierRank = (tier: string) => Math.max(0, TIERS.indexOf(tier as Tier));

/** Novo saldo (nunca negativo, até o limite) e nível depois de somar delta. */
export function applyScore(current: number, delta: number, thresholds: TierThresholds = DEFAULT_THRESHOLDS) {
  const score = Math.max(0, Math.min(SCORE_LIMIT, Math.round(current + delta)));
  return { score, tier: tierFor(score, thresholds) };
}

/** Faixa de pontos de cada nível para a tela: "100 a 299", "700+". */
export function tierRangeLabel(tier: Tier, thresholds: TierThresholds) {
  if (tier === "DIAMANTE") return `${thresholds.DIAMANTE}+ pts`;
  const next = tier === "OURO" ? thresholds.DIAMANTE : tier === "PRATA" ? thresholds.OURO : thresholds.PRATA;
  const start = tier === "OURO" ? thresholds.OURO : tier === "PRATA" ? thresholds.PRATA : 0;
  return `${start} a ${next - 1} pts`;
}
