/** Formas em que um número pode estar no cadastro: com e sem 55, com e sem o 9º dígito. */
export function phoneVariants(waId: string): string[] {
  const digits = waId.replace(/\D/g, "");
  const local = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
  const locals = new Set([local]);
  if (local.length === 11 && local[2] === "9") locals.add(local.slice(0, 2) + local.slice(3));
  // Só celular antigo (começa com 6 a 9) ganha o 9º dígito; fixo (2 a 5) viraria um celular de outra pessoa.
  if (local.length === 10 && /[6-9]/.test(local[2])) locals.add(`${local.slice(0, 2)}9${local.slice(2)}`);
  // Inclui a forma formatada "(62) 99999-9999", usada nos cadastros manuais.
  return [...new Set([digits, waId, ...[...locals].flatMap((item) => [item, `55${item}`, formatPhone(item)])])];
}

export function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const local = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return phone;
}

/**
 * Número brasileiro (55 + DDD) no formato da Meta e a variante com/sem o 9º dígito:
 * 5562984341780 -> [5562984341780, 556284341780]; 556284341780 -> [556284341780, 5562984341780].
 * Fixo (8 dígitos começando com 2 a 5) e números de outros países não têm variante.
 */
export function getBrazilianPhoneVariants(phone: string): string[] {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return [];
  if (!digits.startsWith("55") || (digits.length !== 12 && digits.length !== 13)) return [digits];
  const ddd = digits.slice(2, 4);
  const number = digits.slice(4);
  if (number.length === 9 && number[0] === "9") return [digits, `55${ddd}${number.slice(1)}`];
  if (number.length === 8 && /[6-9]/.test(number[0])) return [digits, `55${ddd}9${number}`];
  return [digits];
}

/** A outra forma do mesmo celular brasileiro (com ou sem o 9), ou null quando não existe. */
export const alternateBrazilianPhone = (phone: string) => getBrazilianPhoneVariants(phone)[1] ?? null;
