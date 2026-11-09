import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Preço por mensagem de modelo entregue (Meta, Brasil), em R$. A Meta cobra por mensagem de modelo
 * entregue; mensagens livres dentro da janela de 24h (atendimento) não são cobradas.
 * Ordem de prioridade: Configurações do CRM > variável de ambiente > padrão.
 */
export type MetaPricing = { marketing: number; utility: number; authentication: number; conversionWindowDays: number };

const DEFAULTS: MetaPricing = {
  // Referência: US$ 0,0625 (marketing) e US$ 0,0068 (utilidade) convertidos a ~R$ 5,50.
  marketing: 0.34,
  utility: 0.04,
  authentication: 0.04,
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
    conversionWindowDays: Math.max(1, Math.round(pick("janelaConversaoDias", "CAMPAIGN_CONVERSION_WINDOW_DAYS", DEFAULTS.conversionWindowDays))),
  };
}

/** Preço de uma mensagem conforme a categoria do modelo; sem modelo (mensagem livre) não há custo. */
export function priceFor(pricing: MetaPricing, category: string | null | undefined) {
  const normalized = (category ?? "").toUpperCase();
  if (normalized === "MARKETING") return pricing.marketing;
  if (normalized === "UTILITY") return pricing.utility;
  if (normalized === "AUTHENTICATION") return pricing.authentication;
  return 0;
}
