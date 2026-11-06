import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { chatError, conversationNotFound, findScopedConversation, requireChatActor } from "@/lib/chat/access";
import { addAudit } from "@/lib/chat/conversation";
import { startOfBrazilDay } from "@/lib/chat/format";

type Context = { params: Promise<{ id: string }> };

const NOTES_LIMIT = 50;
const noteFields = { id: true, text: true, authorName: true, createdAt: true } as const;
const noteBody = z.object({ text: z.string().trim().min(1).max(1000) });

const ORIGINS: Record<string, string> = {
  cpf: "Importação ERP",
  email: "Importação ERP",
  phone: "Importação ERP",
  whatsapp: "WhatsApp Cloud API",
  ecommerce: "E-commerce",
  manual: "Cadastro manual",
};

const originLabel = (sourceKey: string) => ORIGINS[sourceKey.split(":")[0]] ?? "Não identificada";

export async function GET(_request: Request, context: Context) {
  const guard = await requireChatActor();
  if (guard.response) return guard.response;
  const { id } = await context.params;
  const conversation = await findScopedConversation(guard.actor, id);
  if (!conversation) return conversationNotFound();

  const { contactId } = conversation;
  const [contact, messageCount, conversationCount, firstToday] = await Promise.all([
    prisma.contact.findUnique({
      where: { id: contactId },
      select: {
        cpf: true,
        avatarUrl: true,
        createdAt: true,
        sourceKey: true,
        notes: { orderBy: { createdAt: "desc" }, take: NOTES_LIMIT, select: noteFields },
      },
    }),
    prisma.chatMessage.count({ where: { internal: false, conversation: { contactId } } }),
    prisma.chatConversation.count({ where: { contactId } }),
    prisma.chatMessage.findFirst({
      where: { internal: false, createdAt: { gte: startOfBrazilDay() }, conversation: { contactId } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
  ]);
  if (!contact) return conversationNotFound();

  const { sourceKey, ...profile } = contact;
  return NextResponse.json({ ...profile, origin: originLabel(sourceKey), messageCount, conversationCount, firstMessageToday: firstToday?.createdAt ?? null });
}

export async function POST(request: Request, context: Context) {
  const guard = await requireChatActor("chat.assume");
  if (guard.response) return guard.response;
  const { id } = await context.params;
  const conversation = await findScopedConversation(guard.actor, id);
  if (!conversation) return conversationNotFound();

  const parsed = noteBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return chatError("Escreva a nota com até 1000 caracteres.", 400);

  const note = await prisma.contactNote.create({
    data: { contactId: conversation.contactId, authorId: guard.actor.id, authorName: guard.actor.name, text: parsed.data.text },
    select: noteFields,
  });
  await addAudit({ userId: guard.actor.id, action: "contact.note", targetId: conversation.contactId, after: { noteId: note.id } });
  return NextResponse.json(note, { status: 201 });
}
