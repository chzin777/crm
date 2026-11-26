import { describe, expect, it } from "vitest";
import { firstInvalidStep, toggleStore, validateCampaignStep, type CampaignDraft } from "@/lib/sales-campaign-steps";

const draft = (over: Partial<CampaignDraft> = {}): CampaignDraft => ({
  name: "Foco Stepper Novembro", metric: "QUANTIDADE", target: 3, startDate: "2026-11-01", endDate: "2026-11-30",
  audience: "INDIVIDUAL", groups: [{ name: "Grupo 1", stores: [] }], rewardMode: "RECORRENTE", rewardLabel: "Voucher iFood", rewardAmount: 100, ...over,
});

describe("assistente da campanha com premiação: validação por etapa", () => {
  it("etapa 1 exige nome, alvo e período válido", () => {
    expect(validateCampaignStep(1, draft())).toBe("");
    expect(validateCampaignStep(1, draft({ name: "  " }))).toMatch(/nome/);
    expect(validateCampaignStep(1, draft({ target: 0 }))).toMatch(/unidades/);
    expect(validateCampaignStep(1, draft({ metric: "VALOR", target: 0 }))).toMatch(/R\$/);
    expect(validateCampaignStep(1, draft({ target: 2.5 }))).toMatch(/inteiro/);
    expect(validateCampaignStep(1, draft({ endDate: "2026-10-31" }))).toMatch(/término/);
    expect(validateCampaignStep(1, draft({ startDate: "" }))).toMatch(/início/);
    expect(validateCampaignStep(1, draft({ rewardMode: "RANKING", target: 0 }))).toBe("");
  });

  it("etapa 2 exige ao menos um grupo com lojas quando o público é grupo", () => {
    expect(validateCampaignStep(2, draft())).toBe("");
    expect(validateCampaignStep(2, draft({ audience: "GRUPO" }))).toMatch(/grupo com lojas/);
    expect(validateCampaignStep(2, draft({ audience: "GRUPO", groups: [{ name: "Norte", stores: [1, 2] }] }))).toBe("");
    expect(validateCampaignStep(2, draft({ audience: "GRUPO", groups: [{ name: " ", stores: [1] }] }))).toMatch(/nome/);
  });

  it("etapa 3 exige a descrição do prêmio e leva à primeira etapa com erro", () => {
    expect(validateCampaignStep(3, draft({ rewardLabel: "" }))).toMatch(/prêmio/);
    expect(firstInvalidStep(draft())).toBeNull();
    expect(firstInvalidStep(draft({ rewardLabel: "", name: "" }))).toEqual({ step: 1, error: "Dê um nome para a campanha." });
    expect(firstInvalidStep(draft({ audience: "GRUPO", rewardLabel: "" }))?.step).toBe(2);
  });

  it("seletor de lojas liga e desliga mantendo a ordem", () => {
    expect(toggleStore([18, 2], 5)).toEqual([2, 5, 18]);
    expect(toggleStore([2, 5, 18], 5)).toEqual([2, 18]);
  });
});
