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
