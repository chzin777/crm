import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { chatError, requireChatActor, scopeWhere } from "@/lib/chat/access";
import { notifyChatChange } from "@/lib/chat/events";
import { eligibleForEveryone, PROVIDER_SUPPORTS_REVOKE, REVOKE_UNSUPPORTED_MESSAGE } from "@/lib/chat/message-delete";
import { serializeMessage } from "@/lib/chat/serialize";

type Context = { params: Promise<{ id: string }> };

/**
 * Apaga uma mensagem do /chat. scope=me: oculta no CRM (o conteúdo fica guardado para auditoria).
 * scope=everyone: revoga no WhatsApp do cliente; depende do provedor (a Meta Cloud API não oferece).
 */
export async function DELETE(request: Request, context: Context) {
  const guard = await requireChatActor("chat.assume");
  if (guard.response) return guard.response;
  const { actor } = guard;
  const { id } = await context.params;
  const scope = new URL(request.url).searchParams.get("scope");
  if (scope !== "me" && scope !== "everyone") return chatError("Informe scope=me ou scope=everyone.", 400);

  const message = await prisma.chatMessage.findFirst({ where: { id, conversation: scopeWhere(actor) } });
  if (!message) return chatError("Mensagem não encontrada.", 404);
  if (message.author === "system") return chatError("Avisos do sistema não podem ser apagados.", 400);
  if (message.deletedAt) return NextResponse.json(serializeMessage(message));

  if (scope === "everyone") {
    if (!eligibleForEveryone(message) || !message.externalId) {
      return chatError("Só mensagens enviadas pelo CRM nas últimas 48 horas podem ser apagadas para todos.", 400);
    }
    if (!PROVIDER_SUPPORTS_REVOKE) return chatError(REVOKE_UNSUPPORTED_MESSAGE, 422, { code: "revoke_unsupported" });
  }

  const updated = await prisma.chatMessage.update({
    where: { id },
    data: { deletedAt: new Date(), deletedScope: scope, deletedById: actor.id, deletedByName: actor.name },
  });
  notifyChatChange();
  return NextResponse.json(serializeMessage(updated));
}
