/** Regras de exclusão de mensagens do /chat (compartilhadas entre a tela e a API). */

/** O WhatsApp só permite revogar mensagens recentes; usamos 48 h, abaixo do limite do aplicativo. */
export const DELETE_FOR_EVERYONE_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * O CRM envia pela API oficial da Meta (WhatsApp Cloud API), que não tem chamada para apagar uma mensagem já
 * enviada no WhatsApp do cliente. Enquanto o provedor não oferecer isso, "Apagar para todos" fica indisponível.
 */
export const PROVIDER_SUPPORTS_REVOKE = false;
export const REVOKE_UNSUPPORTED_MESSAGE =
  "A API oficial do WhatsApp (Meta Cloud API), usada pelo CRM, não permite apagar uma mensagem no WhatsApp do cliente depois de enviada. Use “Apagar para mim” para removê-la do CRM.";

type Deletable = { author: string; internal: boolean; createdAt: string | Date; delivery?: string | null };

/** Mensagem do CRM (atendente ou robô), enviada ao cliente e ainda dentro do prazo do WhatsApp. */
export function eligibleForEveryone(message: Deletable, now = Date.now()) {
  if (message.internal || (message.author !== "agent" && message.author !== "bot")) return false;
  if (message.delivery === "failed" || message.delivery === "sending") return false;
  return now - new Date(message.createdAt).getTime() <= DELETE_FOR_EVERYONE_WINDOW_MS;
}
