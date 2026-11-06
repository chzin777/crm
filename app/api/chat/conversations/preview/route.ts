import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/meta-whatsapp";
import { chatError, requireChatActor, scopeWhere } from "@/lib/chat/access";
import { isBlocked, isWindowOpen } from "@/lib/chat/conversation";

/** O que a tela de nova conversa precisa saber antes de escolher como falar com o contato. */
export async function GET(request: Request) {
  const guard = await requireChatActor("chat.assume");
  if (guard.response) return guard.response;

  const contactId = new URL(request.url).searchParams.get("contactId") ?? "";
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { id: true, name: true, phone: true, email: true, cpf: true, store: true, lastPurchaseDate: true },
  });
  if (!contact) return chatError("Contato não encontrado.", 404);

  const [open, last] = await Promise.all([
    prisma.chatConversation.findUnique({
      where: { openKey: contact.id },
      select: { id: true, lastInboundAt: true, assignee: { select: { name: true } }, queue: { select: { name: true } } },
    }),
    prisma.chatConversation.aggregate({ where: { contactId: contact.id }, _max: { lastInboundAt: true } }),
  ]);
  const visible = open ? await prisma.chatConversation.findFirst({ where: { AND: [{ id: open.id }, scopeWhere(guard.actor)] }, select: { id: true } }) : null;

  let blocked = false;
  let phoneValid = Boolean(contact.phone);
  try {
    if (contact.phone) blocked = await isBlocked(normalizePhone(contact.phone));
  } catch {
    phoneValid = false;
  }

  return NextResponse.json({
    contact: {
      id: contact.id,
      nome: contact.name,
      telefone: contact.phone ?? "",
      email: contact.email ?? "",
      cpf: contact.cpf ?? "",
      loja: contact.store ?? "",
      ultimaCompra: contact.lastPurchaseDate ?? "",
    },
    windowOpen: isWindowOpen(open ? open.lastInboundAt : last._max.lastInboundAt),
    phoneValid,
    blocked,
    open: open ? { id: open.id, visible: Boolean(visible), assignee: open.assignee?.name ?? null, queue: open.queue?.name ?? null } : null,
  });
}
