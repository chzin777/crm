import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Preço por mensagem de modelo entregue (Meta, Brasil), em R$. A Meta cobra por mensagem de modelo
 * entregue; mensagens livres dentro da janela de 24h (atendimento) não são cobradas.
 * Ordem de prioridade: Configurações do CRM > variável de ambiente > padrão.
 */
export type MetaPricing = { marketing: number; utility: number; authentication: number; usdBrlRate: number; conversionWindowDays: number };

const DEFAULTS: MetaPricing = {
  // Referência: US$ 0,0625 (marketing), US$ 0,008 (utilidade) e US$ 0,0315 (autenticação) a ~R$ 5,50.
  marketing: 0.34,
  utility: 0.04,
  authentication: 0.17,
  usdBrlRate: 5.5,
  conversionWindowDays: 7,
};

const positive = (value: unknown) => {
  const parsed = typeof value === "string" ? Number(value.replace(",", ".")) : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

export async function getMetaPricing(): Promise<MetaPricing> {
  const row = await prisma.crmWorkspaceData.findUnique({ where: { key: "settings" }, select: { value: true } });
  const settings = (row?.value ?? {}) as Record<string, unknown>;
  const pick = (setting: string, env: string, fallback: number) => positive(settings[setting]) ?? positive(process.env[env]) ?? fallback;
  return {
    marketing: pick("metaCustoMarketing", "META_PRICE_MARKETING_BRL", DEFAULTS.marketing),
    utility: pick("metaCustoUtilidade", "META_PRICE_UTILITY_BRL", DEFAULTS.utility),
    authentication: pick("metaCustoAutenticacao", "META_PRICE_AUTHENTICATION_BRL", DEFAULTS.authentication),
    usdBrlRate: pick("cotacaoUsdBrl", "META_USD_BRL_RATE", DEFAULTS.usdBrlRate) || DEFAULTS.usdBrlRate,
    conversionWindowDays: Math.max(1, Math.round(pick("janelaConversaoDias", "CAMPAIGN_CONVERSION_WINDOW_DAYS", DEFAULTS.conversionWindowDays))),
  };
}

/**
 * Grava as tarifas da Meta a partir da tabela em US$ e da cotação: guarda o valor em R$ (o que as métricas usam)
 * e a cotação. Mescla com as demais configurações, sem apagar nada.
 */
export async function saveMetaPricing(usd: { marketing: number; utility: number; authentication: number }, usdBrlRate: number) {
  const row = await prisma.crmWorkspaceData.findUnique({ where: { key: "settings" }, select: { value: true } });
  const current = (row?.value && typeof row.value === "object" && !Array.isArray(row.value) ? row.value : {}) as Record<string, unknown>;
  const brl = (value: number) => String(Math.round(value * usdBrlRate * 10_000) / 10_000);
  const value = {
    ...current,
    metaCustoMarketing: brl(usd.marketing),
    metaCustoUtilidade: brl(usd.utility),
    metaCustoAutenticacao: brl(usd.authentication),
    cotacaoUsdBrl: String(usdBrlRate),
  };
  await prisma.crmWorkspaceData.upsert({ where: { key: "settings" }, create: { key: "settings", value }, update: { value } });
  return getMetaPricing();
}

/** Preço de uma mensagem conforme a categoria do modelo; sem modelo (mensagem livre) não há custo. */
export function priceFor(pricing: MetaPricing, category: string | null | undefined) {
  const normalized = (category ?? "").toUpperCase();
  if (normalized === "MARKETING") return pricing.marketing;
  if (normalized === "UTILITY") return pricing.utility;
  if (normalized === "AUTHENTICATION") return pricing.authentication;
  return 0;
}
