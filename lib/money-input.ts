/**
 * Máscara e sanitização dos campos numéricos (puro; usado pelos inputs e pelos testes).
 * Dinheiro: só dígitos, com as casas de centavos "andando" (digitar 1, 2, 3 → R$ 1,23). Quantidade: só inteiros positivos.
 */

const MAX_MONEY_DIGITS = 11; // até R$ 999.999.999,99
const MAX_QTY_DIGITS = 7;

/** Só os dígitos do texto (letras, sinais e símbolos somem). */
export const onlyDigits = (value: string) => value.replace(/\D+/g, "");

/** Texto digitado/colado → centavos (inteiro ≥ 0). "R$ 1.234,56" → 123456; "abc" → 0. */
export function moneyInputToCents(value: string) {
  const digits = onlyDigits(value).replace(/^0+(?=\d)/, "").slice(-MAX_MONEY_DIGITS);
  return digits ? Number(digits) : 0;
}

/** Centavos → "R$ 1.234,56" (0 → ""). */
export function formatMoneyMask(cents: number) {
  if (!Number.isFinite(cents) || cents <= 0) return "";
  return (Math.round(cents) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ /g, " ");
}

/** Número em reais → texto mascarado. */
export const maskMoney = (value: number) => formatMoneyMask(Math.round((value || 0) * 100));

/** Texto mascarado → número em reais (o que vai para a API). */
export const moneyInputToNumber = (value: string) => moneyInputToCents(value) / 100;

/** Texto → quantidade inteira positiva ("12a" → 12, "3,5" → 35 sem vírgula; vazio → 0). */
export function quantityInputToNumber(value: string) {
  const digits = onlyDigits(value).replace(/^0+(?=\d)/, "").slice(0, MAX_QTY_DIGITS);
  return digits ? Number(digits) : 0;
}

/** Teclas liberadas num campo numérico: dígitos e as de edição/navegação (letras e símbolos são bloqueados). */
export function isAllowedNumericKey(event: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }) {
  if (event.ctrlKey || event.metaKey || event.altKey) return true;
  if (/^\d$/.test(event.key)) return true;
  return ["Backspace", "Delete", "Tab", "Enter", "Escape", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key);
}
