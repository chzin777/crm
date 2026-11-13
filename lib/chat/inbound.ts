import "server-only";
import { Prisma, type ChatMessage } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { downloadMedia } from "@/lib/meta-whatsapp";
import { ensureBucket, uploadFile } from "@/lib/minio";
import { attributeCampaignReply } from "@/lib/chat/campaign-origin";
import { AUTO_REPLY_AUTHOR, detectAutoReply } from "@/lib/chat/auto-reply";
import { openConversationFor } from "@/lib/chat/conversation";
import { recordSurveyReply } from "@/lib/chat/nps";
import { absorbPostCloseCourtesy } from "@/lib/chat/post-close";
import { extensionFor, MAX_MEDIA_BYTES, safeFileName, type AttachmentKind, type ChatAttachment } from "@/lib/chat/media-rules";
import { formatPhone, phoneVariants } from "@/lib/chat/phone";

import { isCustomerMessage, MEDIA_LABELS, mediaFailureReason, readContent, type MetaInboundMessage, type MetaMedia } from "@/lib/chat/inbound-content";

export { isCustomerMessage, type MetaInboundMessage };

async function findOrCreateContact(waId: string, profileName: string | undefined) {
  // O cadastro tem telefones repetidos: a conversa aberta diz com qual contato o cliente já fala.
  const variants = phoneVariants(waId);
  const open = await prisma.chatConversation.findFirst({
    where: { phone: { in: variants }, closedAt: null },
    orderBy: { updatedAt: "desc" },
    select: { contactId: true },
  });
  if (open) return { id: open.contactId };

  const contact = await prisma.contact.findFirst({
    where: { phone: { in: variants } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (contact) return contact;
  const sourceKey = `whatsapp:${waId}`;
  try {
    return await prisma.contact.upsert({
      where: { sourceKey },
      create: { sourceKey, name: profileName?.trim() || formatPhone(waId), phone: waId },
      update: {},
      select: { id: true },
    });
  } catch (error) {
    // Duas mensagens do mesmo número novo ao mesmo tempo: quem perdeu a corrida usa o contato criado.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    const existing = await prisma.contact.findUnique({ where: { sourceKey }, select: { id: true } });
    if (!existing) throw error;
    return existing;
  }
}

let bucketReady = false;

/** O arquivo nunca derruba a mensagem: se o download falhar, ela entra com o rótulo do tipo. */
async function storeMedia(media: MetaMedia & { kind: AttachmentKind }, onError?: (reason: string) => void): Promise<ChatAttachment | null> {
  try {
    if (!bucketReady) {
      await ensureBucket();
      bucketReady = true;
    }
    const { buffer, mime } = await downloadMedia(media.id!, MAX_MEDIA_BYTES);
    const type = media.mime_type ?? mime;
    const name = safeFileName(media.filename ?? `${media.kind}.${extensionFor(type)}`);
    const { key } = await uploadFile(buffer, name, type, "chat");
    return { kind: media.kind, name, mime: type, size: buffer.length, key };
  } catch (error) {
    // Log detalhado (status HTTP da Meta, token expirado, limite) e motivo curto para a IA avisar o cliente.
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[chat] falha ao guardar mídia recebida (${media.kind}, id ${media.id}, ${media.mime_type ?? "sem mime"}): ${detail}`, error);
    onError?.(mediaFailureReason(detail));
    return null;
  }
}

type SavedMetaMedia = Pick<MetaMedia, "id" | "mime_type" | "filename"> & { kind: AttachmentKind; error?: string };

/** Nova tentativa de download: a Meta mantém o arquivo por tempo limitado. */
export async function retryInboundMedia(message: Pick<ChatMessage, "id" | "text" | "metaMedia">) {
  const media = message.metaMedia as SavedMetaMedia | null;
  if (!media?.id) return null;
  const attachment = await storeMedia(media);
  if (!attachment) return null;
  return prisma.chatMessage.update({
    where: { id: message.id },
    data: {
      attachment: attachment as unknown as Prisma.InputJsonValue,
      text: message.text === MEDIA_LABELS[media.kind] ? "" : message.text,
    },
  });
}

async function findQuoted(externalId: string | undefined) {
  if (!externalId) return null;
  const original = await prisma.chatMessage.findUnique({ where: { externalId }, select: { id: true, author: true, text: true, authorName: true } });
  if (!original) return null;
  return { author: original.authorName ?? (original.author === "customer" ? "Cliente" : "Atendimento"), text: original.text.slice(0, 300), messageId: original.id };
}

export type RecordedInbound = {
  conversationId: string;
  messageId: string;
  text: string;
  /** Id da linha tocada numa lista ou botão; o texto mostra só o título. */
  choiceId: string | null;
  created: boolean;
  /** Preenchido quando a mensagem foi reconhecida como resposta automática do contato (não aciona o menu). */
  autoReply: "pattern" | "instant" | "post_dispatch_greeting" | null;
};

/**
 * Grava a mensagem no atendimento. Qualquer erro aqui sobe para o webhook responder 500
 * e a Meta reenviar; a idempotência fica no externalId.
 */
export async function recordInbound(message: MetaInboundMessage, profileName: string | undefined): Promise<RecordedInbound | null> {
  if (!message.id || !message.from || !isCustomerMessage(message.type)) return null;
  const repeated = await prisma.chatMessage.findUnique({ where: { externalId: message.id }, select: { id: true } });
  if (repeated) return null;

  const receivedAt = message.timestamp ? new Date(Number(message.timestamp) * 1000) : new Date();
  const content = readContent(message);
  // "valeu"/"👍" logo depois do encerramento: fica na conversa encerrada, sem abrir outro atendimento.
  if (await absorbPostCloseCourtesy({ externalId: message.id, phone: message.from, text: content.media ? "" : content.text, isText: message.type === "text", receivedAt })) return null;
  const answeredSurvey = await recordSurveyReply({
    externalId: message.id,
    phone: message.from,
    text: content.media ? "" : content.text,
    choiceId: message.interactive?.list_reply?.id ?? message.interactive?.button_reply?.id ?? null,
    isText: message.type === "text",
    receivedAt,
  });
  if (answeredSurvey) return null;

  const contact = await findOrCreateContact(message.from, profileName);
  const { conversation, created } = await openConversationFor(contact.id, message.from);
  let mediaError: string | undefined;
  const attachment = content.media ? await storeMedia(content.media, (reason) => { mediaError = reason; }) : null;
  const text = content.text || (content.media && !attachment ? MEDIA_LABELS[content.media.kind] : "");
  const replyTo = await findQuoted(message.context?.id);
  // error: motivo da falha no download (a IA avisa o cliente em vez de ignorar o arquivo).
  // selectedProductRef: modelo escolhido na lista interativa da vitrine (a IA abre a ficha + foto desse item).
  const metaMedia: SavedMetaMedia | { selectedProductRef: string } | null = content.media
    ? { id: content.media.id, mime_type: content.media.mime_type, filename: content.media.filename, kind: content.media.kind, ...(mediaError ? { error: mediaError } : {}) }
    : content.selectedProductRef ? { selectedProductRef: content.selectedProductRef } : null;
  const choiceId = message.interactive?.list_reply?.id ?? message.interactive?.button_reply?.id ?? null;
  // Ausência/saudação automática do WhatsApp Business do contato: fica no histórico, mas não abre menu nem conta como resposta.
  const autoReply = await detectAutoReply({
    phone: message.from,
    text,
    receivedAt,
    explicitInteraction: message.type === "button" || message.type === "interactive" || Boolean(choiceId),
  }).catch((error) => {
    console.error("[chat] falha ao avaliar resposta automática:", error);
    return null;
  });

  let saved;
  try {
    saved = await prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        author: "customer",
        ...(autoReply ? { authorName: AUTO_REPLY_AUTHOR } : {}),
        text,
        externalId: message.id,
        createdAt: receivedAt,
        ...(attachment ? { attachment: attachment as unknown as Prisma.InputJsonValue } : {}),
        ...(metaMedia ? { metaMedia: metaMedia as Prisma.InputJsonValue } : {}),
        ...(replyTo ? { replyTo: replyTo as Prisma.InputJsonValue } : {}),
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
    throw error;
  }

  await prisma.chatConversation.update({
    where: { id: conversation.id },
    data: { unreadCount: { increment: 1 } },
  });
  // A Meta pode reenviar mensagem antiga depois de uma nova: as datas da conversa nunca voltam no tempo.
  await prisma.chatConversation.updateMany({
    where: { id: conversation.id, OR: [{ lastInboundAt: null }, { lastInboundAt: { lt: receivedAt } }] },
    data: { lastInboundAt: receivedAt },
  });
  await prisma.chatConversation.updateMany({
    where: { id: conversation.id, OR: [{ lastMessageAt: null }, { lastMessageAt: { lt: receivedAt } }] },
    data: { lastMessageAt: receivedAt },
  });
  await prisma.chatConversation.updateMany({
    where: { id: conversation.id, waitingSince: null, status: { not: "bot" } },
    data: { waitingSince: receivedAt },
  });
  // A mensagem já está gravada: falha aqui não pode fazer a Meta reenviar o evento.
  if (autoReply) {
    console.log(`[chat] mensagem ${message.id} de ${message.from} parece automática (${autoReply.kind}: ${autoReply.detail})`);
  }
  // Toda resposta conta para a campanha; as automáticas são descartadas pela equipe em "Não é resposta da campanha".
  await attributeCampaignReply({ conversation, contactId: contact.id, phone: message.from, receivedAt, quotedId: message.context?.id })
    .catch((error) => console.error("[chat] falha ao identificar campanha da resposta:", error));

  return { conversationId: conversation.id, messageId: saved.id, text, choiceId, created, autoReply: autoReply?.kind ?? null };
}

/**
 * Eco do que a equipe enviou pelo app WhatsApp Business no mesmo número (coexistência).
 * Entra como mensagem da empresa, nunca dispara menu nem reabre conversa encerrada.
 */
export async function recordEcho(message: MetaInboundMessage & { to?: string }): Promise<string | null> {
  if (!message.id || !message.to || !isCustomerMessage(message.type)) return null;
  const repeated = await prisma.chatMessage.findUnique({ where: { externalId: message.id }, select: { id: true } });
  if (repeated) return null;

  const sentAt = message.timestamp ? new Date(Number(message.timestamp) * 1000) : new Date();
  const contact = await findOrCreateContact(message.to, undefined);
  const latest = await prisma.chatConversation.findFirst({
    where: { contactId: contact.id },
    orderBy: [{ closedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
  });
  const conversation = latest ?? (await openConversationFor(contact.id, message.to)).conversation;

  const content = readContent(message);
  const attachment = content.media ? await storeMedia(content.media) : null;
  const text = content.text || (content.media && !attachment ? MEDIA_LABELS[content.media.kind] : "");
  const replyTo = await findQuoted(message.context?.id);
  const metaMedia: SavedMetaMedia | null = content.media
    ? { id: content.media.id, mime_type: content.media.mime_type, filename: content.media.filename, kind: content.media.kind }
    : null;

  try {
    await prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        author: "agent",
        authorName: "WhatsApp do aparelho",
        text,
        externalId: message.id,
        delivery: "sent",
        createdAt: sentAt,
        ...(attachment ? { attachment: attachment as unknown as Prisma.InputJsonValue } : {}),
        ...(metaMedia ? { metaMedia: metaMedia as Prisma.InputJsonValue } : {}),
        ...(replyTo ? { replyTo: replyTo as Prisma.InputJsonValue } : {}),
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
    throw error;
  }

  // Quem respondeu pelo aparelho já leu a conversa.
  await prisma.chatConversation.update({ where: { id: conversation.id }, data: { unreadCount: 0 } });
  await prisma.chatConversation.updateMany({
    where: { id: conversation.id, OR: [{ lastMessageAt: null }, { lastMessageAt: { lt: sentAt } }] },
    data: { lastMessageAt: sentAt },
  });
  return conversation.id;
}
