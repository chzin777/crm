import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { chatError, conversationNotFound, findScopedConversation, requireChatActor } from "@/lib/chat/access";
import { ChatRuleError, sendAgentMessage } from "@/lib/chat/outbound";
import { serializeMessage } from "@/lib/chat/serialize";

type Context = { params: Promise<{ id: string }> };

const PAGE_SIZE = 50;

const messageBody = z.object({
  text: z.string().max(4096).default(""),
  internal: z.boolean().default(false),
  replyToId: z.string().optional(),
  attachment: z.object({
    kind: z.enum(["image", "video", "audio", "document"]),
    name: z.string().min(1).max(200),
    mime: z.string().min(1).max(120),
    size: z.number().int().positive(),
    key: z.string().min(1),
  }).optional(),
  template: z.object({ name: z.string().min(1), language: z.string().min(1), params: z.array(z.string()).default([]) }).optional(),
});

export async function POST(request: Request, context: Context) {
  const guard = await requireChatActor("chat.assume");
  if (guard.response) return guard.response;
  const { actor } = guard;
  const { id } = await context.params;
  const conversation = await findScopedConversation(actor, id);
  if (!conversation) return conversationNotFound();

  const parsed = messageBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return chatError("Mensagem inválida.", 400);
  const input = parsed.data;
  if (!input.text.trim() && !input.attachment && !input.template) return chatError("Mensagem vazia.", 400);
  if (input.internal && (input.attachment || input.template)) return chatError("Nota interna aceita apenas texto.", 400);
  // O arquivo precisa ter sido enviado por esta pessoa em /api/chat/media.
  if (input.attachment && !input.attachment.key.startsWith(`chat/upload/${actor.id}/`)) return chatError("Anexo inválido.", 400);

  try {
    const message = await sendAgentMessage(actor, conversation, { ...input, text: input.text.trim() });
    return NextResponse.json(serializeMessage(message), { status: 201 });
  } catch (error) {
    if (error instanceof ChatRuleError) return chatError(error.message, error.status, { code: error.code });
    console.error("[chat] falha ao gravar mensagem:", error);
    return chatError("Não foi possível enviar a mensagem.", 500);
  }
}

export async function GET(request: Request, context: Context) {
  const guard = await requireChatActor();
  if (guard.response) return guard.response;
  const { id } = await context.params;
  const conversation = await findScopedConversation(guard.actor, id);
  if (!conversation) return conversationNotFound();

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const after = url.searchParams.get("after");

  const rows = await prisma.chatMessage.findMany({
    where: { conversationId: id, ...(after ? { createdAt: { gte: new Date(after) } } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const page = rows.slice(0, PAGE_SIZE);
  return NextResponse.json({
    items: page.reverse().map(serializeMessage),
    nextCursor: rows.length > PAGE_SIZE ? page[0].id : null,
  });
}
