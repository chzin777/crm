/**
 * Pós-venda óptico (puro, sem banco): revisão anual de grau e reposição de lentes de contato a partir das vendas
 * espelhadas do VMSet. Usado pelo job diário (lib/commercial/jobs-db) e pelos testes.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Revisão de grau: lembrete 11 meses (335 dias) depois da venda de lentes de grau. */
export const RX_REVIEW_DAYS = 335;
/** Dias de tolerância depois do vencimento (relógio parado, deploy): o lembrete ainda sai, uma única vez. */
export const RX_REVIEW_CATCHUP_DAYS = 7;
/** Reposição de lentes de contato: lembrete 5 dias antes do término estimado. */
export const CONTACT_LENS_LEAD_DAYS = 5;
/** Término já passou há mais que isso: o lembrete deixa de fazer sentido. */
export const CONTACT_LENS_STALE_DAYS = 3;

export type LensModality = "diaria" | "quinzenal" | "mensal" | "trimestral" | "anual";

/** Duração de cada lente (dias) e lentes por caixa padrão de cada modalidade. */
export const MODALITY: Record<LensModality, { daysPerLens: number; lensesPerBox: number; label: string }> = {
  diaria: { daysPerLens: 1, lensesPerBox: 30, label: "descarte diário" },
  quinzenal: { daysPerLens: 14, lensesPerBox: 6, label: "descarte quinzenal" },
  mensal: { daysPerLens: 30, lensesPerBox: 6, label: "descarte mensal" },
  trimestral: { daysPerLens: 90, lensesPerBox: 2, label: "descarte trimestral" },
  anual: { daysPerLens: 365, lensesPerBox: 2, label: "descarte anual" },
};

const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

/** Item do VMSet é lente de contato (categoria "LENTES DE CONTATO" ou descrição "LENTE DE CONTATO ..."). */
export function isContactLensItem(item: { category?: string | null; subcategory?: string | null; description?: string | null }) {
  const all = fold([item.category, item.subcategory, item.description].filter(Boolean).join(" "));
  return /LENTES? DE CONTATO/.test(all);
}

/** Venda de óculos de grau (lentes oftálmicas): base do lembrete de revisão anual. */
export function isRxLensItem(item: { category?: string | null; description?: string | null }) {
  const category = fold(item.category ?? "");
  return category === "LENTES" && !isContactLensItem(item);
}

/**
 * Modalidade pela descrição do VMSet ("LENTE DE CONTATO ACUVUE MOIST 1 DAY -7.50", "BIOFINITY", "ACUVUE 2").
 * Sem pista, mensal (a mais comum no balcão).
 */
export function contactLensModality(description: string | null | undefined): LensModality {
  const text = fold(description ?? "");
  if (/\b1[\s-]?DAY\b|DAILIES|\bDAILY\b|DIARI|\bONE DAY\b|1-DAY|\bTRUEYE\b|\bMYDAY\b|CLARITI 1/.test(text)) return "diaria";
  if (/QUINZENA|\bACUVUE 2\b|ACUVUE OASYS(?! 1)|\bOASYS\b|\bVITA\b|2 SEMANAS|\bBIWEEKLY\b/.test(text)) return "quinzenal";
  if (/\bANUA|\bNATURAL VISION\b|\bOPTYCOLOR\b|\bSOLOTICA\b|\bHIDROCOR\b/.test(text)) return "anual";
  if (/TRIMESTR|\b3 MESES\b|\bAVAIRA\b/.test(text)) return "trimestral";
  return "mensal";
}

/** Lentes por caixa explícitas na descrição ("C/ 6", "30 UN", "CX 90"); senão, a padrão da modalidade. */
export function lensesPerBox(description: string | null | undefined, modality: LensModality) {
  const text = fold(description ?? "");
  const match = /(?:C\/|CX\.?|CAIXA(?: COM)?|COM)\s*(\d{1,3})\b|\b(\d{1,3})\s*(?:UN\b|UND|UNID|LENTES)/.exec(text);
  const value = Number(match?.[1] ?? match?.[2]);
  return Number.isFinite(value) && value >= 1 && value <= 180 ? value : MODALITY[modality].lensesPerBox;
}

/**
 * Dias que as caixas compradas duram para os dois olhos: caixas × lentes por caixa × dias por lente ÷ 2.
 * Uma caixa só (cliente pode ter comprado por olho) conta como um olho apenas: o lembrete erra para cedo, nunca tarde.
 */
export function contactLensDurationDays(items: { description: string | null; quantity: number }[]) {
  let lensDays = 0;
  for (const item of items) {
    const modality = contactLensModality(item.description);
    const boxes = Math.max(1, Math.round(item.quantity || 1));
    lensDays += boxes * lensesPerBox(item.description, modality) * MODALITY[modality].daysPerLens;
  }
  const days = Math.floor(lensDays / 2);
  return Math.min(400, Math.max(7, days));
}

const startOfDay = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
const addDaysUtc = (date: Date, days: number) => new Date(startOfDay(date).getTime() + days * DAY_MS);
const daysBetween = (from: Date, to: Date) => Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);

export type ContactLensPlan = { runOutDate: Date; reminderDate: Date; durationDays: number; modality: LensModality };

/** Término estimado e data do lembrete (5 dias antes) de uma compra de lentes de contato. */
export function planContactLensReminder(saleDate: Date, items: { description: string | null; quantity: number }[], leadDays = CONTACT_LENS_LEAD_DAYS): ContactLensPlan {
  const durationDays = contactLensDurationDays(items);
  const runOutDate = addDaysUtc(saleDate, durationDays);
  return { runOutDate, reminderDate: addDaysUtc(runOutDate, -leadDays), durationDays, modality: contactLensModality(items[0]?.description) };
}

/** Lembrete de reposição vence hoje (ou venceu há pouco e o término ainda não passou do limite). */
export function contactLensReminderDue(plan: ContactLensPlan, today: Date) {
  return daysBetween(plan.reminderDate, today) >= 0 && daysBetween(plan.runOutDate, today) <= CONTACT_LENS_STALE_DAYS;
}

/** Revisão de grau vence: venda há 335 dias (com tolerância de 7 dias para relógio parado). */
export function rxReviewDue(saleDate: Date, today: Date, days = RX_REVIEW_DAYS) {
  const elapsed = daysBetween(saleDate, today);
  return elapsed >= days && elapsed <= days + RX_REVIEW_CATCHUP_DAYS;
}

/** Nome curto do produto para a variável do modelo: "LENTE DE CONTATO ACUVUE OASYS -1.50" → "Acuvue Oasys". */
export function contactLensProductName(description: string | null | undefined) {
  const base = (description ?? "")
    .replace(/LENTES? DE CONTATO/i, "")
    .replace(/[+-]\s?\d+[.,]\d+/g, "")
    .replace(/\b(C\/|CX\.?)\s*\d+\b/gi, "")
    .replace(/[-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!base) return "suas lentes de contato";
  return base.toLowerCase().replace(/(^|\s)(\S)/g, (_, space: string, letter: string) => `${space}${letter.toUpperCase()}`);
}

/**
 * Valores das variáveis do modelo oficial, na ordem {{1}}, {{2}}, {{3}}: primeiro nome, item e loja.
 * O modelo usa só as que tiver; sem valor, um texto neutro (a Meta recusa parâmetro vazio).
 */
export function reminderTemplateParams(count: number, input: { name: string | null; item: string | null; store: string | null }) {
  const first = (input.name ?? "").trim().split(/\s+/)[0] ?? "";
  const pretty = first ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : "cliente";
  const values = [pretty, input.item?.trim() || "seus óculos", input.store?.trim() || "nossa loja"];
  return Array.from({ length: Math.max(0, count) }, (_, index) => values[index] ?? values[0]);
}
