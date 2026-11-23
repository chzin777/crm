import { prisma } from "@/lib/prisma";
import { phoneVariants } from "@/lib/chat/phone";
import { attendantValues, DEFAULT_ATTENDANT_FALLBACK, type AttendantValues } from "@/lib/attendant-variables";

let cached: { at: number; value: string } | null = null;

/** Nome usado no lugar do atendente quando o contato ainda não tem operador (configurável em /configuracoes). */
export async function attendantFallbackName(): Promise<string> {
  if (cached && Date.now() - cached.at < 60_000) return cached.value;
  const row = await prisma.crmWorkspaceData.findUnique({ where: { key: "settings" }, select: { value: true } }).catch(() => null);
  const raw = (row?.value as { attendantFallbackName?: unknown } | null | undefined)?.attendantFallbackName;
  const value = typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 60) : DEFAULT_ATTENDANT_FALLBACK;
  cached = { at: Date.now(), value };
  return value;
}

/**
 * Atendente do contato para disparos (campanha, envio em massa): o operador da conversa aberta do contato;
 * sem conversa ou sem operador atribuído, o nome da equipe.
 */
export async function assignedAttendantValues(contact: { contactId?: string | null; phone?: string | null }): Promise<AttendantValues> {
  const or = [
    ...(contact.contactId ? [{ contactId: contact.contactId }] : []),
    ...(contact.phone ? [{ phone: { in: phoneVariants(contact.phone) } }] : []),
  ];
  const [conversation, fallback] = await Promise.all([
    or.length
      ? prisma.chatConversation.findFirst({ where: { closedAt: null, OR: or }, orderBy: { updatedAt: "desc" }, select: { assignee: { select: { name: true } } } }).catch(() => null)
      : null,
    attendantFallbackName(),
  ]);
  return attendantValues(conversation?.assignee?.name, fallback);
}
