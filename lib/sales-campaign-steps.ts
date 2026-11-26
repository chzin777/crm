/**
 * Validação por etapa do assistente "Nova campanha com premiação" (/vendas/campanhas).
 * Mesmas regras do servidor (parseCampaignInput), checadas antes de avançar cada etapa.
 */
import type { CampaignAudience, CampaignMetric, RewardMode } from "@/lib/sales-campaigns-shared";

export type CampaignDraft = {
  name: string;
  metric: CampaignMetric;
  target: number;
  startDate: string;
  endDate: string;
  audience: CampaignAudience;
  groups: { name: string; stores: number[] }[];
  rewardMode: RewardMode;
  rewardLabel: string;
  rewardAmount: number;
};

export const CAMPAIGN_STEPS = 3;

const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`));

/** Erro da etapa (1 = identificação e meta, 2 = escopo e público, 3 = prêmio) ou "" quando pode avançar. */
export function validateCampaignStep(step: number, draft: CampaignDraft): string {
  if (step === 1) {
    if (!draft.name.trim()) return "Dê um nome para a campanha.";
    if (draft.rewardMode !== "RANKING" && !(draft.target > 0)) return draft.metric === "QUANTIDADE" ? "Informe o alvo da meta em unidades (mínimo 1)." : "Informe o alvo da meta em R$.";
    if (draft.metric === "QUANTIDADE" && draft.rewardMode !== "RANKING" && !Number.isInteger(draft.target)) return "A meta em unidades precisa ser um número inteiro.";
    if (!isDate(draft.startDate) || !isDate(draft.endDate)) return "Informe a data de início e a de término.";
    if (draft.startDate > draft.endDate) return "A data de término precisa ser igual ou depois da data de início.";
    return "";
  }
  if (step === 2) {
    if (draft.audience === "GRUPO") {
      if (!draft.groups.some((group) => group.stores.length)) return "Monte pelo menos um grupo com lojas.";
      if (draft.groups.some((group) => !group.name.trim())) return "Dê um nome para cada grupo.";
    }
    return "";
  }
  if (step === 3) {
    if (!draft.rewardLabel.trim()) return "Descreva o prêmio (ex.: Voucher iFood).";
    if (!(draft.rewardAmount >= 0)) return "Valor do prêmio inválido.";
    return "";
  }
  return "";
}

/** Primeira etapa com erro (para o "Criar campanha" levar direto ao campo pendente). */
export function firstInvalidStep(draft: CampaignDraft): { step: number; error: string } | null {
  for (let step = 1; step <= CAMPAIGN_STEPS; step += 1) {
    const error = validateCampaignStep(step, draft);
    if (error) return { step, error };
  }
  return null;
}

/** Liga ou desliga uma loja na lista (ordenada, sem repetição). */
export const toggleStore = (stores: number[], store: number) =>
  (stores.includes(store) ? stores.filter((item) => item !== store) : [...stores, store]).sort((a, b) => a - b);
