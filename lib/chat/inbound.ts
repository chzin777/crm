import "server-only";
import { Prisma, type ChatMessage } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { downloadMedia } from "@/lib/meta-whatsapp";
import { ensureBucket, uploadFile } from "@/lib/minio";
import { attributeCampaignReply } from "@/lib/chat/campaign-origin";
import { openConversationFor } from "@/lib/chat/conversation";
import { recordSurveyReply } from "@/lib/chat/nps";
import { extensionFor, MAX_MEDIA_BYTES, safeFileName, type AttachmentKind, type ChatAttachment } from "@/lib/chat/media-rules";
import { formatPhone, phoneVariants } from "@/lib/chat/phone";

type MetaMedia = { id?: string; mime_type?: string; caption?: string; filename?: string };

export type MetaInboundMessage = {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  context?: { id?: string };
  text?: { body?: string };
  image?: MetaMedia;
  video?: MetaMedia;
  audio?: MetaMedia;
  document?: MetaMedia;
  sticker?: MetaMedia;
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
  contacts?: { name?: { formatted_name?: string }; phones?: { phone?: string }[] }[];
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
};

const MEDIA_LABELS: Record<AttachmentKind, string> = {
  image: "[Imagem]",
  video: "[Vídeo]",
  audio: "[Áudio]",
  document: "[Documento]",
  sticker: "[Figurinha]",
};

function describeLocation(location: NonNullable<MetaInboundMessage["location"]>) {
  const place = [location.name, location.address].filter(Boolean).join(" - ");
  const coordinates = location.latitude !== undefined && location.longitude !== undefined ? `https://maps.google.com/?q=${location.latitude},${location.longitude}` : "";
  return ["📍 Localização", place, coordinates].filter(Boolean).join("\n");
}

function describeContacts(contacts: NonNullable<MetaInboundMessage["contacts"]>) {
  return contacts.map((item) => `👤 ${item.name?.formatted_name ?? "Contato"} ${item.phones?.[0]?.phone ?? ""}`.trim()).join("\n");
}

/**
 * Só o que o cliente realmente enviou. "system" (troca de número, chave de segurança),
 * "reaction", "ephemeral" e "request_welcome" são avisos de protocolo da Meta.
 * "unsupported" fica: é mensagem do cliente que a API não sabe ler (ex.: visualização única).
 */
const CUSTOMER_TYPES = new Set(["text", "image", "video", "audio", "document", "sticker", "location", "contacts", "button", "interactive", "order", "unsupported"]);
export const isCustomerMessage = (type: string | undefined) => CUSTOMER_TYPES.has(type ?? "");

function readContent(message: MetaInboundMessage): { text: string; media: (MetaMedia & { kind: AttachmentKind }) | null } {
  switch (message.type) {
    case "text":
      return { text: message.text?.body ?? "", media: null };
    case "image":
    case "video":
    case "audio":
    case "document":
    case "sticker": {
      const media = message[message.type];
      return { text: media?.caption ?? "", media: media?.id ? { ...media, kind: message.type } : null };
    }
    case "location":
      return { text: message.location ? describeLocation(message.location) : "📍 Localização", media: null };
    case "contacts":
      return { text: message.contacts ? describeContacts(message.contacts) : "👤 Contato", media: null };
    case "button":
      return { text: message.button?.text ?? "[Botão]", media: null };
    case "interactive":
      return { text: message.interactive?.button_reply?.title ?? message.interactive?.list_reply?.title ?? "[Resposta interativa]", media: null };
    default:
      return { text: `[Mensagem do tipo ${message.type ?? "desconhecido"}]`, media: null };
  }
}

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
async function storeMedia(media: MetaMedia & { kind: AttachmentKind }): Promise<ChatAttachment | null> {
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
    console.error("[chat] falha ao guardar mídia recebida:", error);
    return null;
  }
}

type SavedMetaMedia = Pick<MetaMedia, "id" | "mime_type" | "filename"> & { kind: AttachmentKind };

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
  created: boolean;
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
  const answeredSurvey = await recordSurveyReply({
    externalId: message.id,
    phone: message.from,
    text: content.media ? "" : content.text,
    isText: message.type === "text",
    receivedAt,
  });
  if (answeredSurvey) return null;

  const contact = await findOrCreateContact(message.from, profileName);
  const { conversation, created } = await openConversationFor(contact.id, message.from);
  const attachment = content.media ? await storeMedia(content.media) : null;
  const text = content.text || (content.media && !attachment ? MEDIA_LABELS[content.media.kind] : "");
  const replyTo = await findQuoted(message.context?.id);
  const metaMedia: SavedMetaMedia | null = content.media
    ? { id: content.media.id, mime_type: content.media.mime_type, filename: content.media.filename, kind: content.media.kind }
    : null;

  let saved;
  try {
    saved = await prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        author: "customer",
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
  await attributeCampaignReply({ conversation, contactId: contact.id, phone: message.from, receivedAt, quotedId: message.context?.id })
    .catch((error) => console.error("[chat] falha ao identificar campanha da resposta:", error));

  return { conversationId: conversation.id, messageId: saved.id, text, created };
}
