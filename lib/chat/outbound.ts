import "server-only";
import type { ChatConversation, ChatMessage } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { listTemplates, sendMedia, sendTemplate, sendText } from "@/lib/meta-whatsapp";
import { readFile, uploadFile } from "@/lib/minio";
import type { ChatActor } from "@/lib/chat/access";
import { addAudit, addSystemMessage, isBlocked, isWindowOpen } from "@/lib/chat/conversation";
import { convertToOggOpus } from "@/lib/chat/audio";
import type { ChatAttachment } from "@/lib/chat/media-rules";
import { withoutDashes } from "@/lib/chat/text";

export class ChatRuleError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

export type OutgoingTemplate = { name: string; language: string; params: string[]; headerParams?: string[]; headerMedia?: ChatAttachment };

export type OutgoingMessage = {
  text: string;
  internal: boolean;
  replyToId?: string;
  attachment?: ChatAttachment;
  template?: OutgoingTemplate;
};

const failureText = (error: unknown) => (error instanceof Error ? error.message : "Falha ao enviar.").replace(/^Meta WhatsApp API:\s*/, "").slice(0, 500);

/** Grava a tentativa e o resultado; a linha nunca é apagada, nem em caso de falha. */
async function deliver(messageId: string, send: () => Promise<{ messages?: { id: string }[] }>) {
  try {
    const result = await send();
    return await prisma.chatMessage.update({ where: { id: messageId }, data: { delivery: "sent", externalId: result.messages?.[0]?.id ?? null } });
  } catch (error) {
    console.error("[chat] falha no envio:", error);
    return prisma.chatMessage.update({ where: { id: messageId }, data: { delivery: "failed", failureReason: failureText(error) } });
  }
}

/** Assume para quem responde, só se ninguém assumiu antes. */
export async function assumeFor(actor: ChatActor, conversation: Pick<ChatConversation, "id" | "assigneeId">) {
  if (conversation.assigneeId === actor.id) return;
  const agent = await prisma.chatAgent.findUnique({ where: { userId: actor.id } });
  if (agent && agent.capacity > 0) {
    const open = await prisma.chatConversation.count({ where: { assigneeId: actor.id, closedAt: null } });
    if (open >= agent.capacity) throw new ChatRuleError("Você atingiu seu limite de conversas simultâneas.", 409, "at_capacity");
  }
  const updated = await prisma.chatConversation.updateMany({
    where: { id: conversation.id, assigneeId: null, closedAt: null },
    data: { assigneeId: actor.id, status: "in_progress", waitingSince: null, unreadCount: 0 },
  });
  if (updated.count === 0) {
    const current = await prisma.chatConversation.findUnique({ where: { id: conversation.id }, select: { assignee: { select: { name: true } } } });
    throw new ChatRuleError(`${current?.assignee?.name ?? "Outra pessoa"} já assumiu esta conversa.`, 409, "already_assigned");
  }
  await addSystemMessage(conversation.id, `${actor.name} assumiu a conversa`);
  await addAudit({ userId: actor.id, action: "conversation.assume", targetId: conversation.id, before: { assigneeId: null }, after: { assigneeId: actor.id } });
}

async function templateText(template: OutgoingTemplate) {
  const found = (await listTemplates()).find((item) => item.name === template.name && item.language === template.language);
  const fill = (text: string, values: string[]) => text.replace(/\{\{(\d+)\}\}/g, (_, index: string) => values[Number(index) - 1] ?? "");
  const body = fill(found?.body ?? template.name, template.params);
  const header = found?.headerFormat === "TEXT" ? fill(found.headerText, template.headerParams ?? []) : "";
  return { found, text: header ? `${header}\n\n${body}` : body };
}

const HEADER_KINDS: Record<string, "image" | "video" | "document"> = { IMAGE: "image", VIDEO: "video", DOCUMENT: "document" };

async function templateHeader(found: Awaited<ReturnType<typeof templateText>>["found"], media?: ChatAttachment) {
  const kind = HEADER_KINDS[found?.headerFormat ?? ""];
  if (!found || !kind) return undefined;
  if (media) return { kind, mimetype: media.mime.split(";")[0], fileName: media.name, base64: (await readFile(media.key)).toString("base64") };
  if (kind !== "image") throw new Error("Este modelo exige um arquivo no cabeçalho.");
  if (!found.headerImageUrl) throw new Error("Este modelo exige uma imagem e a Meta não retornou a do modelo.");
  const downloaded = await fetch(found.headerImageUrl);
  if (!downloaded.ok) throw new Error("Não foi possível carregar a imagem do modelo.");
  return {
    mimetype: downloaded.headers.get("content-type")?.split(";")[0] || "image/jpeg",
    fileName: "header",
    base64: Buffer.from(await downloaded.arrayBuffer()).toString("base64"),
  };
}

async function sendAttachment(conversation: ChatConversation, messageId: string, attachment: ChatAttachment, caption: string, replyToId?: string) {
  let bytes = await readFile(attachment.key);
  let file = attachment;

  // Todo áudio passa pela conversão: o ogg do Firefox pode vir em estéreo e a Meta só aceita mono.
  if (attachment.kind === "audio") {
    const received = bytes.length;
    bytes = await convertToOggOpus(bytes);
    console.log(`[chat] áudio convertido: mime=${attachment.mime} entrada=${received} bytes saída=${bytes.length} bytes`);
    const name = attachment.name.replace(/\.[^.]+$/, "") + ".ogg";
    const { key } = await uploadFile(bytes, name, "audio/ogg", attachment.key.split("/").slice(0, -2).join("/"));
    file = { ...attachment, key, name, mime: "audio/ogg", size: bytes.length };
    await prisma.chatMessage.update({ where: { id: messageId }, data: { attachment: file as unknown as Prisma.InputJsonValue } });
  }

  return sendMedia(
    conversation.phone,
    { mimetype: file.mime.split(";")[0], fileName: file.name, base64: bytes.toString("base64") },
    caption || undefined,
    { asDocument: file.kind === "document", replyToId },
  );
}

async function loadQuote(conversationId: string, replyToId?: string) {
  if (!replyToId) return null;
  const original = await prisma.chatMessage.findFirst({
    where: { id: replyToId, conversationId, internal: false },
    select: { id: true, author: true, authorName: true, text: true, externalId: true },
  });
  if (!original) return null;
  return {
    externalId: original.externalId ?? undefined,
    replyTo: { author: original.authorName ?? (original.author === "customer" ? "Cliente" : "Atendimento"), text: original.text.slice(0, 300), messageId: original.id },
  };
}

/** Envio do atendente: valida, grava como "enviando" e só então fala com a Meta. */
export async function sendAgentMessage(actor: ChatActor, conversation: ChatConversation, input: OutgoingMessage): Promise<ChatMessage> {
  if (input.internal) {
    const note = await prisma.chatMessage.create({
      data: { conversationId: conversation.id, author: "agent", authorUserId: actor.id, authorName: actor.name, text: input.text, internal: true },
    });
    await prisma.chatConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
    return note;
  }

  if (conversation.closedAt) throw new ChatRuleError("Conversa encerrada. Reabra para responder.", 409, "closed");
  if (await isBlocked(conversation.phone)) throw new ChatRuleError("Este número está bloqueado e não recebe mensagens.", 422, "blocked");
  if (!input.template && !isWindowOpen(conversation.lastInboundAt)) {
    throw new ChatRuleError("Faz mais de 24h desde a última mensagem do cliente. Envie um modelo aprovado.", 422, "window_closed");
  }

  await assumeFor(actor, conversation);

  const now = new Date();
  const text = withoutDashes(input.text);
  const template = input.template ? await templateText(input.template) : null;
  const quote = await loadQuote(conversation.id, input.replyToId);
  const isAudio = input.attachment?.kind === "audio";
  const attachment = input.attachment ?? input.template?.headerMedia;

  const message = await prisma.chatMessage.create({
    data: {
      conversationId: conversation.id,
      author: "agent",
      authorUserId: actor.id,
      authorName: actor.name,
      text: template?.text ?? (isAudio ? "" : text),
      delivery: "sending",
      createdAt: now,
      ...(attachment ? { attachment: attachment as unknown as Prisma.InputJsonValue } : {}),
      ...(quote ? { replyTo: quote.replyTo } : {}),
    },
  });

  await prisma.chatConversation.update({
    where: { id: conversation.id },
    data: { status: "in_progress", waitingSince: null, unreadCount: 0, lastMessageAt: now },
  });

  const sent = await deliver(message.id, async () => {
    if (input.template) {
      return sendTemplate(conversation.phone, input.template.name, input.template.language, input.template.params, await templateHeader(template?.found, input.template.headerMedia), input.template.headerParams);
    }
    if (input.attachment) return sendAttachment(conversation, message.id, input.attachment, isAudio ? "" : text, quote?.externalId);
    return sendText(conversation.phone, text, quote?.externalId);
  });

  if (isAudio && text) {
    await sendAgentMessage(actor, { ...conversation, assigneeId: actor.id }, { text, internal: false });
  }
  return sent;
}

/** Mensagem automática: gravada antes de sair, para quem assumir ver o que já foi dito. */
export async function sendAutomaticMessage(conversation: Pick<ChatConversation, "id" | "phone">, rawText: string, send?: () => Promise<{ messages?: { id: string }[] }>) {
  if (await isBlocked(conversation.phone)) return null;
  const text = withoutDashes(rawText);
  const now = new Date();
  const message = await prisma.chatMessage.create({
    data: { conversationId: conversation.id, author: "bot", authorName: "Atendimento automático", text, delivery: "sending", createdAt: now },
  });
  await prisma.chatConversation.update({ where: { id: conversation.id }, data: { lastMessageAt: now } });
  return deliver(message.id, send ?? (() => sendText(conversation.phone, text)));
}
