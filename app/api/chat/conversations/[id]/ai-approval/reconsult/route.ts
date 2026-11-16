import { NextResponse } from "next/server";
import { chatError, conversationNotFound, findScopedConversation, requireChatActor } from "@/lib/chat/access";
import { isValidCpf } from "@/lib/ai/installments";
import { lookupInstallments, reconsultFinancial, serializeApproval } from "@/lib/ai/installments-db";

type Context = { params: Promise<{ id: string }> };

/** Operador corrige o CPF (e o nome) e reconsulta o VMSet sem sair do chat. */
export async function POST(request: Request, context: Context) {
  const guard = await requireChatActor("chat.assume");
  if (guard.response) return guard.response;
  const { id } = await context.params;
  const conversation = await findScopedConversation(guard.actor, id);
  if (!conversation) return conversationNotFound();
  const body = (await request.json().catch(() => null)) as { actionId?: unknown; cpf?: unknown; name?: unknown } | null;
  const cpf = typeof body?.cpf === "string" ? body.cpf.replace(/\D/g, "") : "";
  if (typeof body?.actionId !== "string") return chatError("Aprovação inválida.", 400);
  if (!isValidCpf(cpf)) return chatError("CPF inválido. Confira os 11 números.", 400);
  const result = await reconsultFinancial({
    actionId: body.actionId,
    conversationId: conversation.id,
    actor: guard.actor,
    cpf,
    heardName: typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 120) : undefined,
    lookup: lookupInstallments,
  });
  if (!result.ok) return chatError(result.error, result.status);
  return NextResponse.json({ approval: serializeApproval(result.action) });
}
