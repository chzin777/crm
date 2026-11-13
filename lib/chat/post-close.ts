import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { phoneVariants } from "@/lib/chat/phone";
import { isCourtesyClosing } from "@/lib/ai/closing";
import { isPostCloseCourtesy } from "@/lib/ai/ai-close";

/**
 * "valeu"/"ok"/"👍" logo depois de a conversa ser encerrada: a mensagem fica na conversa encerrada (a equipe vê),
 * sem abrir outro atendimento nem disparar nova despedida. A pesquisa de satisfação pendente continua valendo.
 */
export async function absorbPostCloseCourtesy(reply: { externalId: string; phone: string; text: string; isText: boolean; receivedAt: Date }) {
  if (!reply.isText || !isCourtesyClosing(reply.text)) return false;
  const phones = phoneVariants(reply.phone);
  const [open, last] = await Promise.all([
    prisma.chatConversation.findFirst({ where: { phone: { in: phones }, closedAt: null }, select: { id: true } }),
    prisma.chatConversation.findFirst({ where: { phone: { in: phones }, closedAt: { not: null } }, orderBy: { closedAt: "desc" }, select: { id: true, closedAt: true } }),
  ]);
  if (!last || !isPostCloseCourtesy({ text: reply.text, isText: reply.isText, lastClosedAt: last.closedAt, receivedAt: reply.receivedAt, hasOpen: !!open })) return false;
  try {
    await prisma.chatMessage.create({ data: { conversationId: last.id, author: "customer", text: reply.text, externalId: reply.externalId, createdAt: reply.receivedAt } });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
  }
  console.log(`[chat] ${last.id}: cortesia depois do encerramento registrada sem reabrir`);
  return true;
}
