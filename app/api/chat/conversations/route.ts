import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/meta-whatsapp";
import { chatError, requireChatActor, scopeWhere, type ChatActor } from "@/lib/chat/access";
import { firstActiveQueue, isWindowOpen } from "@/lib/chat/conversation";
import { ChatRuleError, sendAgentMessage } from "@/lib/chat/outbound";
import { conversationInclude, serializeConversation } from "@/lib/chat/serialize";

const PAGE_SIZE = 40;
const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
const OPEN: Prisma.ChatConversationWhereInput = { closedAt: null };

function tabWhere(tab: string, actor: ChatActor): Prisma.ChatConversationWhereInput {
  if (tab === "queue") return { status: "waiting", closedAt: null };
  if (tab === "mine") return { assigneeId: actor.id, ...OPEN };
  if (tab === "closed") return { status: "closed" };
  return OPEN;
}

function searchWhere(search: string): Prisma.ChatConversationWhereInput[] {
  return search.split(/\s+/).filter(Boolean).map((token) => {
    const digits = token.replace(/\D/g, "").replace(/^55(?=\d{10})/, "");
    return {
      OR: [
        { contact: { name: { contains: token, mode: "insensitive" } } },
        { subject: { contains: token, mode: "insensitive" } },
        { tags: { has: token } },
        { messages: { some: { internal: false, text: { contains: token, mode: "insensitive" } } } },
        ...(digits ? [{ phone: { contains: digits } }] : []),
      ],
    };
  });
}

const newConversationBody = z.object({
  contactId: z.string().min(1),
  text: z.string().max(4096).default(""),
  template: z.object({
    name: z.string().min(1),
    language: z.string().min(1),
    params: z.array(z.string()).default([]),
    headerParams: z.array(z.string()).default([]),
    headerMedia: z.object({
      kind: z.enum(["image", "video", "document"]),
      name: z.string().min(1).max(200),
      mime: z.string().min(1).max(120),
      size: z.number().int().positive(),
      key: z.string().min(1),
    }).optional(),
  }).optional(),
});

/** Inicia conversa pelo atendente; se o contato já tiver uma aberta, a primeira mensagem sai nela. */
export async function POST(request: Request) {
  const guard = await requireChatActor("chat.assume");
  if (guard.response) return guard.response;
  const { actor } = guard;

  const parsed = newConversationBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return chatError("Dados inválidos.", 400);
  const { contactId, template } = parsed.data;
  const text = parsed.data.text.trim();
  // O arquivo precisa ter sido enviado por esta pessoa em /api/chat/media.
  if (template?.headerMedia && !template.headerMedia.key.startsWith(`chat/upload/${actor.id}/`)) return chatError("Anexo inválido.", 400);

  const open = await prisma.chatConversation.findUnique({ where: { openKey: contactId } });
  if (open) {
    const visible = await prisma.chatConversation.findFirst({ where: { AND: [{ id: open.id }, scopeWhere(actor)] }, select: { id: true } });
    if (!visible) return chatError("Este contato já está em atendimento em outra fila.", 409);
    if (!template && !text) return NextResponse.json({ id: open.id, existing: true });
    try {
      await sendAgentMessage(actor, open, { text, internal: false, template });
      return NextResponse.json({ id: open.id, existing: true });
    } catch (error) {
      if (error instanceof ChatRuleError) return chatError(error.message, error.status, { code: error.code });
      console.error("[chat] falha ao enviar na conversa aberta:", error);
      return chatError("Não foi possível enviar a mensagem.", 500);
    }
  }

  const contact = await prisma.contact.findUnique({ where: { id: contactId }, select: { phone: true } });
  if (!contact?.phone) return chatError("Contato sem telefone.", 422);

  const last = await prisma.chatConversation.aggregate({ where: { contactId }, _max: { lastInboundAt: true } });
  const lastInboundAt = last._max.lastInboundAt;
  if (!template && !isWindowOpen(lastInboundAt)) {
    return chatError("Sem janela de 24h aberta: escolha um modelo aprovado.", 422, { code: "window_closed" });
  }

  let phone: string;
  try {
    phone = normalizePhone(contact.phone);
  } catch {
    return chatError("Telefone do contato inválido.", 422);
  }

  try {
    const queue = await firstActiveQueue();
    const conversation = await prisma.chatConversation.create({
      data: { contactId, phone, openKey: contactId, queueId: actor.queueIds[0] ?? queue?.id ?? null, assigneeId: actor.id, status: "in_progress", lastInboundAt },
    });
    if (template || text) await sendAgentMessage(actor, conversation, { text, internal: false, template });
    return NextResponse.json({ id: conversation.id, existing: false }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return chatError("Este contato acabou de abrir uma conversa. Atualize a lista.", 409);
    }
    if (error instanceof ChatRuleError) return chatError(error.message, error.status, { code: error.code });
    console.error("[chat] falha ao criar conversa:", error);
    return chatError("Não foi possível iniciar a conversa.", 500);
  }
}

export async function GET(request: Request) {
  const guard = await requireChatActor();
  if (guard.response) return guard.response;
  const { actor } = guard;

  const url = new URL(request.url);
  const tab = url.searchParams.get("tab") ?? "queue";
  const queueId = url.searchParams.get("queueId");
  const priority = PRIORITIES.find((item) => item === url.searchParams.get("priority"));
  const search = (url.searchParams.get("search") ?? "").trim();
  const offset = Math.max(0, Number(url.searchParams.get("cursor")) || 0);

  const filters: Prisma.ChatConversationWhereInput[] = [
    scopeWhere(actor),
    ...(queueId ? [{ queueId }] : []),
    ...(priority ? [{ priority }] : []),
    ...searchWhere(search),
  ];

  const orderBy: Prisma.ChatConversationOrderByWithRelationInput[] = tab === "closed"
    ? [{ closedAt: "desc" }]
    : [{ waitingSince: { sort: "asc", nulls: "last" } }, { lastMessageAt: { sort: "desc", nulls: "last" } }];

  const [rows, queue, mine, all, closed] = await Promise.all([
    prisma.chatConversation.findMany({
      where: { AND: [tabWhere(tab, actor), ...filters] },
      include: conversationInclude,
      orderBy: [...orderBy, { id: "asc" }],
      skip: offset,
      take: PAGE_SIZE + 1,
    }),
    prisma.chatConversation.count({ where: { AND: [tabWhere("queue", actor), ...filters] } }),
    prisma.chatConversation.count({ where: { AND: [tabWhere("mine", actor), ...filters] } }),
    prisma.chatConversation.count({ where: { AND: [tabWhere("all", actor), ...filters] } }),
    prisma.chatConversation.count({ where: { AND: [tabWhere("closed", actor), ...filters] } }),
  ]);

  return NextResponse.json({
    items: rows.slice(0, PAGE_SIZE).map(serializeConversation),
    nextCursor: rows.length > PAGE_SIZE ? offset + PAGE_SIZE : null,
    counts: { queue, mine, all, closed },
  });
}
