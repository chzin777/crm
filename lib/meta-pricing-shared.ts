/**
 * Tarifas da Meta (WhatsApp Cloud API, Brasil) usadas nas estimativas da tela. Sem dependências de servidor.
 * A Meta publica os preços em US$ por mensagem de modelo entregue; o CRM guarda o valor em R$ (usado nas métricas)
 * e a cotação usada na conversão.
 */
export type PricingCategory = "marketing" | "utility" | "authentication";

export type MetaPricingView = {
  /** R$ por mensagem entregue. */
  marketing: number;
  utility: number;
  authentication: number;
  /** Cotação US$ → R$ usada para converter a tabela da Meta. */
  usdBrlRate: number;
  conversionWindowDays: number;
};

/** Tabela da Meta para o Brasil (US$ por mensagem), valores padrão. */
export const DEFAULT_USD_PRICES: Record<PricingCategory, number> = { marketing: 0.0625, utility: 0.008, authentication: 0.0315 };
export const DEFAULT_USD_BRL_RATE = 5.5;

export const PRICING_CATEGORIES: { key: PricingCategory; label: string; hint: string }[] = [
  { key: "marketing", label: "Marketing", hint: "Promoções, ofertas e convites" },
  { key: "utility", label: "Utilidade", hint: "Avisos de pedido, confirmações" },
  { key: "authentication", label: "Autenticação", hint: "Códigos de verificação" },
];

export const formatBrl = (value: number, digits = 2) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: digits, maximumFractionDigits: digits });
export const formatUsd = (value: number, digits = 2) => `US$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

/** Preço unitário em US$ a partir do valor guardado em R$. */
export const usdPrice = (pricing: MetaPricingView, category: PricingCategory) => (pricing.usdBrlRate > 0 ? pricing[category] / pricing.usdBrlRate : 0);

/** Número digitado com vírgula ou ponto; inválido vira NaN. */
export const parseDecimal = (value: string) => Number(value.replace(/\s/g, "").replace(",", "."));
