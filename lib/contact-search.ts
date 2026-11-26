/**
 * Busca de contatos (/contatos): nome, telefone, e-mail e CPF (com ou sem pontuação). Puro: usado pela API e pelos testes.
 * As colunas cpfDigits/phoneDigits têm índices (B-Tree de prefixo e trigramas) em prisma/contact-search.sql.
 */

export type ContactSearchWhere = { OR: Record<string, unknown>[] } | Record<string, never>;

const onlyDigits = (value: string) => value.replace(/\D/g, "");

/** CPF com 11 dígitos (repõe zeros à esquerda perdidos no cadastro do ERP). */
export function normalizeCpf(value: string | null | undefined): string {
  const digits = onlyDigits(value ?? "");
  return digits.length >= 8 && digits.length <= 11 ? digits.padStart(11, "0") : digits;
}

/** 123.456.789-00 (ou o que houver, quando não tem 11 dígitos). */
export function formatCpf(value: string | null | undefined): string {
  const cpf = normalizeCpf(value);
  return cpf.length === 11 ? `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}` : cpf;
}

/** Termo só de números e pontuação de CPF/telefone ("123.456.789-00", "(62) 99999-0000", "62999990000"). */
export const isNumericTerm = (term: string) => /^[\d\s().+\-/]+$/.test(term) && onlyDigits(term).length > 0;

/** Telefone digitado com DDI 55: a busca usa o número nacional (o cadastro guarda DDD + número). */
const nationalPhone = (digits: string) => (digits.length >= 12 && digits.startsWith("55") ? digits.slice(2) : digits);

/**
 * Filtro do Prisma para o termo:
 *  - número: CPF exato (11 dígitos) ou por prefixo, e telefone por trecho (com ou sem DDD/55);
 *  - texto: todas as palavras no nome (ILIKE com trigramas) ou o e-mail quando tem "@".
 */
export function buildContactSearch(raw: string): ContactSearchWhere {
  const term = raw.trim().slice(0, 120);
  if (!term) return {};
  if (isNumericTerm(term)) {
    const digits = onlyDigits(term);
    const or: Record<string, unknown>[] = [];
    if (digits.length >= 8 && digits.length <= 11) or.push({ cpfDigits: normalizeCpf(digits) });
    if (digits.length >= 3 && digits.length < 11) or.push({ cpfDigits: { startsWith: digits } });
    if (digits.length >= 4) or.push({ phoneDigits: { contains: nationalPhone(digits) } });
    return or.length ? { OR: or } : { OR: [{ cpfDigits: { startsWith: digits } }] };
  }
  if (term.includes("@")) return { OR: [{ email: { contains: term, mode: "insensitive" } }] };
  const words = term.split(/\s+/).filter(Boolean).slice(0, 6);
  return { OR: [{ AND: words.map((word) => ({ name: { contains: word, mode: "insensitive" } })) }, { email: { startsWith: term.toLowerCase(), mode: "insensitive" } }] };
}
