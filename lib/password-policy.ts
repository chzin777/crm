/** Regras da senha definitiva (mesmo mínimo de 12 caracteres do login). Usado na tela e na API de primeiro acesso. */
export const PASSWORD_RULES = [
  { id: "length", label: "Pelo menos 12 caracteres", test: (value: string) => value.length >= 12 },
  { id: "letter", label: "Pelo menos uma letra", test: (value: string) => /\p{L}/u.test(value) },
  { id: "number", label: "Pelo menos um número", test: (value: string) => /\d/.test(value) },
] as const;

export const passwordMeetsPolicy = (value: string) => PASSWORD_RULES.every((rule) => rule.test(value));
