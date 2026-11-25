/**
 * Automações comerciais do VMSet (puro): revisão anual de grau, reposição de lentes de contato e recuperação de
 * orçamento aberto. Editadas em /automacoes; a configuração antiga (só os modelos e a chave da recuperação, salva na
 * tela de Conversão Real) é migrada automaticamente na leitura.
 */

export type TemplateRef = { name: string; language: string } | null;

/** Janela de envio em horas cheias de Brasília: de `from` (inclusive) até `to` (exclusive). */
export type SendWindow = { from: number; to: number };

export type RxReviewRule = { enabled: boolean; template: TemplateRef; days: number; window: SendWindow };
export type ContactLensRule = { enabled: boolean; template: TemplateRef; leadDays: number; window: SendWindow };
export type BudgetRecoveryRule = {
  enabled: boolean;
  minHours: number;
  maxHours: number;
  window: SendWindow;
  /** Texto livre com {nome} e {item}; vazio = mensagem automática que cita o item consultado. */
  message: string;
};

export type CommercialSettings = {
  rxReview: RxReviewRule;
  contactLens: ContactLensRule;
  budgetRecovery: BudgetRecoveryRule;
  /** Campos antigos espelhados (a cor anterior do blue/green ainda lê estes). */
  rxReviewTemplate: TemplateRef;
  contactLensTemplate: TemplateRef;
  budgetRecoveryEnabled: boolean;
};

export const DEFAULT_RX_REVIEW: RxReviewRule = { enabled: false, template: null, days: 335, window: { from: 9, to: 19 } };
export const DEFAULT_CONTACT_LENS: ContactLensRule = { enabled: false, template: null, leadDays: 5, window: { from: 9, to: 19 } };
export const DEFAULT_BUDGET_RECOVERY: BudgetRecoveryRule = { enabled: true, minHours: 4, maxHours: 6, window: { from: 8, to: 20 }, message: "" };

export const DEFAULT_COMMERCIAL_SETTINGS: CommercialSettings = withLegacy({ rxReview: DEFAULT_RX_REVIEW, contactLens: DEFAULT_CONTACT_LENS, budgetRecovery: DEFAULT_BUDGET_RECOVERY });

function withLegacy(rules: Pick<CommercialSettings, "rxReview" | "contactLens" | "budgetRecovery">): CommercialSettings {
  return {
    ...rules,
    rxReviewTemplate: rules.rxReview.enabled ? rules.rxReview.template : null,
    contactLensTemplate: rules.contactLens.enabled ? rules.contactLens.template : null,
    budgetRecoveryEnabled: rules.budgetRecovery.enabled,
  };
}

const record = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

function template(value: unknown): TemplateRef {
  const raw = record(value);
  const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 512) : "";
  const language = typeof raw.language === "string" ? raw.language.trim().slice(0, 15) : "";
  return name && language && /^[a-z0-9_]+$/.test(name) ? { name, language } : null;
}

function int(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
}

function window(value: unknown, fallback: SendWindow): SendWindow {
  const raw = record(value);
  const from = int(raw.from, fallback.from, 0, 23);
  const to = int(raw.to, fallback.to, 1, 24);
  return to > from ? { from, to } : fallback;
}

const bool = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);

export function sanitizeCommercialSettings(value: unknown): CommercialSettings {
  const raw = record(value);
  const rx = record(raw.rxReview);
  const lens = record(raw.contactLens);
  const budget = record(raw.budgetRecovery);
  // Migração: configuração antiga (só o modelo) vira a regra; modelo escolhido = automação ligada.
  const legacyRx = template(raw.rxReviewTemplate);
  const legacyLens = template(raw.contactLensTemplate);
  const rxTemplate = "template" in rx ? template(rx.template) : legacyRx;
  const lensTemplate = "template" in lens ? template(lens.template) : legacyLens;
  const minHours = int(budget.minHours, DEFAULT_BUDGET_RECOVERY.minHours, 1, 22);
  const maxHours = Math.max(minHours + 1, int(budget.maxHours, DEFAULT_BUDGET_RECOVERY.maxHours, 2, 23));
  return withLegacy({
    rxReview: {
      enabled: bool(rx.enabled, !!legacyRx) && !!rxTemplate,
      template: rxTemplate,
      days: int(rx.days, DEFAULT_RX_REVIEW.days, 30, 730),
      window: window(rx.window, DEFAULT_RX_REVIEW.window),
    },
    contactLens: {
      enabled: bool(lens.enabled, !!legacyLens) && !!lensTemplate,
      template: lensTemplate,
      leadDays: int(lens.leadDays, DEFAULT_CONTACT_LENS.leadDays, 0, 30),
      window: window(lens.window, DEFAULT_CONTACT_LENS.window),
    },
    budgetRecovery: {
      enabled: bool(budget.enabled, bool(raw.budgetRecoveryEnabled, DEFAULT_BUDGET_RECOVERY.enabled)),
      minHours,
      maxHours,
      window: window(budget.window, DEFAULT_BUDGET_RECOVERY.window),
      message: typeof budget.message === "string" ? budget.message.trim().slice(0, 1000) : "",
    },
  });
}

/** Hora de Brasília dentro da janela de envio. */
export const insideWindow = (hour: number, window: SendWindow) => hour >= window.from && hour < window.to;

/** Texto livre da recuperação: {nome} (primeiro nome) e {item} (item consultado ou "o que você consultou"). */
export function customRecoveryMessage(text: string, input: { name: string | null; item: string | null }) {
  const first = (input.name ?? "").trim().split(/\s+/)[0] ?? "";
  const name = first && !/^\+?\d/.test(first) ? `${first.charAt(0).toUpperCase()}${first.slice(1).toLowerCase()}` : "";
  return text
    .replace(/\{nome\}/gi, name)
    .replace(/\{item\}/gi, input.item?.trim() || "o que você consultou")
    .replace(/,\s*([!?.])/g, "$1")
    .replace(/\s+([!?.,])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
