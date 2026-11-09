import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { mergeChatSettings } from "@/lib/chat/settings";

export const WINDOW_MS = 24 * 60 * 60 * 1000;

export const isWindowOpen = (lastInboundAt: Date | null) => !!lastInboundAt && Date.now() - lastInboundAt.getTime() < WINDOW_MS;

export async function readChatSettings() {
  const row = await prisma.chatSettings.findUnique({ where: { id: "default" } });
  return mergeChatSettings(row?.menu);
}

export async function firstActiveQueue() {
  return prisma.chatQueue.findFirst({ where: { archivedAt: null }, orderBy: [{ order: "asc" }, { createdAt: "asc" }] });
}

export const isBlocked = async (phone: string) => !!(await prisma.chatBlockedNumber.findUnique({ where: { phone } }));

const isUniqueConflict = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/** Conversa aberta do contato, ou uma nova. openKey impede duas abertas sob concorrência. */
export async function openConversationFor(contactId: string, phone: string) {
  const existing = await prisma.chatConversation.findUnique({ where: { openKey: contactId } });
  if (existing) {
    if (existing.phone === phone) return { conversation: existing, created: false };
    return { conversation: await prisma.chatConversation.update({ where: { id: existing.id }, data: { phone } }), created: false };
  }

  const settings = await readChatSettings();
  const useMenu = settings.enabled && settings.options.length > 0;
  const queue = await firstActiveQueue();
  console.log(
    useMenu
      ? `[bot] nova conversa de ${phone} -> menu ativo, saudação será enviada`
      : `[bot] nova conversa de ${phone} -> direto para a fila (menu ${settings.enabled ? "ligado" : "desligado"}, ${settings.options.length} opções)`,
  );
  try {
    const conversation = await prisma.chatConversation.create({
      data: {
        contactId,
        phone,
        openKey: contactId,
        queueId: queue?.id ?? null,
        status: useMenu ? "bot" : "waiting",
        waitingSince: useMenu ? null : new Date(),
      },
    });
    return { conversation, created: true };
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
    const conversation = await prisma.chatConversation.findUnique({ where: { openKey: contactId } });
    if (!conversation) throw error;
    return { conversation, created: false };
  }
}

export async function addSystemMessage(conversationId: string, text: string, tx: Prisma.TransactionClient | typeof prisma = prisma) {
  return tx.chatMessage.create({ data: { conversationId, author: "system", text, internal: true } });
}

export async function addAudit(entry: { userId: string | null; action: string; targetId: string; before?: unknown; after?: unknown }, tx: Prisma.TransactionClient | typeof prisma = prisma) {
  return tx.chatAudit.create({
    data: {
      userId: entry.userId,
      action: entry.action,
      targetId: entry.targetId,
      before: entry.before === undefined ? Prisma.JsonNull : (entry.before as Prisma.InputJsonValue),
      after: entry.after === undefined ? Prisma.JsonNull : (entry.after as Prisma.InputJsonValue),
    },
  });
}

/** Grava o aviso uma só vez; devolve true apenas na primeira. */
export async function firstDispatch(key: string) {
  const inserted = await prisma.chatDispatch.createMany({ data: [{ key }], skipDuplicates: true });
  return inserted.count > 0;
}
