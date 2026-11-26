import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { sendText } from "@/lib/meta-whatsapp";
import { firstDispatch, isBlocked } from "@/lib/chat/conversation";
import { alternateBrazilianPhone, phoneVariants } from "@/lib/chat/phone";
import { PHONE_FALLBACK_CODES, sendWithRetry } from "@/lib/chat/meta-failure";

type PhoneFallback = { from: string; to: string; code: number; at: string; failed?: boolean; confirmed?: boolean };
type Meta = Record<string, unknown> & { template?: unknown; phoneFallback?: PhoneFallback };

const metaOf = (value: Prisma.JsonValue | null): Meta => (value && typeof value === "object" && !Array.isArray(value) ? (value as Meta) : {});

/**
 * Webhook "failed" com 131026/131047: reenvia o mesmo texto ao celular com/sem o 9º dígito.
 * Uma única tentativa por mensagem (marca na mensagem + trava no banco, segura entre Blue/Green); modelos e mídias ficam de fora.
 */
export async function tryPhoneFallback(externalId: string, code: number | undefined) {
  if (!code || !PHONE_FALLBACK_CODES.has(code)) return null;
  const message = await prisma.chatMessage.findUnique({ where: { externalId }, include: { conversation: { select: { phone: true } } } });
  if (!message || message.internal || (message.author !== "bot" && message.author !== "agent")) return null;
  if (message.attachment || !message.text.trim()) return null;
  const meta = metaOf(message.metaMedia);
  if (meta.template || meta.phoneFallback) return null;
  const from = message.conversation.phone.replace(/\D/g, "");
  const to = alternateBrazilianPhone(from);
  if (!to || (await isBlocked(to))) return null;
  if (!(await firstDispatch(`phone-fallback:${message.id}`))) return null;

  const fallback: PhoneFallback = { from, to, code, at: new Date().toISOString() };
  try {
    const result = await sendWithRetry(() => sendText(to, message.text));
    console.log(`[chat] ${message.id}: erro ${code} em ${from}, reenviada para ${to}`);
    return await prisma.chatMessage.update({
      where: { id: message.id },
      data: { delivery: "sent", failureReason: null, externalId: result.messages?.[0]?.id ?? null, metaMedia: { ...meta, phoneFallback: fallback } as unknown as Prisma.InputJsonValue },
    });
  } catch (error) {
    console.error(`[chat] ${message.id}: reenvio para ${to} também falhou:`, error);
    await prisma.chatMessage.update({ where: { id: message.id }, data: { metaMedia: { ...meta, phoneFallback: { ...fallback, failed: true } } as unknown as Prisma.InputJsonValue } });
    return null;
  }
}

/**
 * Reenvio pela variante chegou (sent/delivered): a conversa e o cadastro passam a usar esse número,
 * para as próximas mensagens da IA e da equipe já saírem no formato aceito pela Meta.
 */
export async function confirmPhoneFallback(externalId: string) {
  const message = await prisma.chatMessage.findUnique({
    where: { externalId },
    select: { id: true, metaMedia: true, conversation: { select: { id: true, phone: true, contact: { select: { id: true, phone: true } } } } },
  });
  const meta = metaOf(message?.metaMedia ?? null);
  const fallback = meta.phoneFallback;
  if (!message || !fallback?.to || fallback.failed || fallback.confirmed) return false;

  await prisma.chatMessage.update({ where: { id: message.id }, data: { metaMedia: { ...meta, phoneFallback: { ...fallback, confirmed: true } } as unknown as Prisma.InputJsonValue } });
  const { conversation } = message;
  if (conversation.phone.replace(/\D/g, "") === fallback.from) await prisma.chatConversation.update({ where: { id: conversation.id }, data: { phone: fallback.to } });
  if (conversation.contact.phone && phoneVariants(conversation.contact.phone).includes(fallback.from)) {
    await prisma.contact.update({ where: { id: conversation.contact.id }, data: { phone: fallback.to } });
  }
  console.log(`[chat] conversa ${conversation.id}: número passa a ser ${fallback.to} (entregue após erro ${fallback.code})`);
  return true;
}
