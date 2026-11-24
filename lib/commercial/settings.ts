/** Configuração da suíte comercial (puro): modelos oficiais dos lembretes e chave da recuperação de orçamento. */

export type TemplateRef = { name: string; language: string } | null;

export type CommercialSettings = {
  /** Modelo aprovado da Meta para a revisão anual de grau (11 meses). Vazio = lembrete desligado. */
  rxReviewTemplate: TemplateRef;
  /** Modelo aprovado da Meta para a reposição de lentes de contato (5 dias antes do término). */
  contactLensTemplate: TemplateRef;
  /** Acompanhamento automático (texto livre, janela de 24 h) de quem consultou produto/preço/receita e sumiu 4 a 6 h. */
  budgetRecoveryEnabled: boolean;
};

export const DEFAULT_COMMERCIAL_SETTINGS: CommercialSettings = { rxReviewTemplate: null, contactLensTemplate: null, budgetRecoveryEnabled: true };

function template(value: unknown): TemplateRef {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 512) : "";
  const language = typeof raw.language === "string" ? raw.language.trim().slice(0, 15) : "";
  return name && language && /^[a-z0-9_]+$/.test(name) ? { name, language } : null;
}

export function sanitizeCommercialSettings(value: unknown): CommercialSettings {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    rxReviewTemplate: template(raw.rxReviewTemplate),
    contactLensTemplate: template(raw.contactLensTemplate),
    budgetRecoveryEnabled: typeof raw.budgetRecoveryEnabled === "boolean" ? raw.budgetRecoveryEnabled : DEFAULT_COMMERCIAL_SETTINGS.budgetRecoveryEnabled,
  };
}
