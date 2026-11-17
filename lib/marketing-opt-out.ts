import { phoneVariants } from "@/lib/chat/phone";

export type OptOutCommand = "opt_out" | "opt_in";

const OPT_OUT_WORDS = new Set(["SAIR", "PARAR", "CANCELAR RECEBIMENTO", "NAO QUERO MAIS", "DESCADASTRAR"]);
const OPT_IN_WORDS = new Set(["REATIVAR", "VOLTAR"]);

export const OPT_OUT_REPLY =
  "Pronto! Você foi removido(a) da nossa lista de envios promocionais e não receberá mais campanhas por aqui. Se precisar de atendimento, é só nos chamar! 😊";
export const OPT_IN_REPLY =
  "Pronto! Você voltou a receber nossas novidades e promoções por aqui. Para sair a qualquer momento, envie SAIR. 😊";

/** Sem acento, maiúsculas, sem pontuação/emoji e com espaços únicos: "Não quero mais!" → "NAO QUERO MAIS". */
export function normalizeCommand(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Só a mensagem inteira vale como comando: "quero sair mais cedo" não descadastra ninguém. */
export function detectOptOutCommand(text: string | null | undefined): OptOutCommand | null {
  if (!text) return null;
  const normalized = normalizeCommand(text);
  if (OPT_OUT_WORDS.has(normalized)) return "opt_out";
  if (OPT_IN_WORDS.has(normalized)) return "opt_in";
  return null;
}

/** Chaves (id do contato e variações do telefone) de quem não recebe campanha. */
export function optOutKeys(contacts: { id: string; phone: string | null }[]) {
  const keys = new Set<string>();
  for (const contact of contacts) {
    keys.add(contact.id);
    if (contact.phone) for (const variant of phoneVariants(contact.phone.replace(/\D/g, ""))) keys.add(variant);
  }
  return keys;
}

/** Remove da lista quem pediu para sair (por id ou por qualquer variação do telefone). */
export function withoutOptedOut<T extends { id: string; telefone: string }>(recipients: T[], keys: Set<string>) {
  if (keys.size === 0) return recipients;
  return recipients.filter((recipient) => {
    if (keys.has(recipient.id)) return false;
    const digits = recipient.telefone?.replace(/\D/g, "") ?? "";
    return !digits || !phoneVariants(digits).some((variant) => keys.has(variant));
  });
}
