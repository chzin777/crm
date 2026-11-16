import { NextResponse } from "next/server";
import { z } from "zod";
import { chatError, conversationNotFound, findScopedConversation, requireChatActor } from "@/lib/chat/access";
import { loadOperationalContext, quickQuery } from "@/lib/chat/quick-query-db";
import { maskCpf } from "@/lib/ai/installments";

/** Copiloto VMSet: contexto da conversa (CPF, nome, produto, intenção) e sugestões de consulta em 1 clique. */
export async function GET(request: Request) {
  const guard = await requireChatActor();
  if (guard.response) return guard.response;
  const conversationId = new URL(request.url).searchParams.get("conversationId") ?? "";
  const conversation = conversationId ? await findScopedConversation(guard.actor, conversationId) : null;
  if (!conversation) return conversationNotFound();
  const { context, suggestions } = await loadOperationalContext(conversation);
  return NextResponse.json({ context: { ...context, cpfMasked: context.cpf ? maskCpf(context.cpf) : null }, suggestions });
}

const body = z.object({
  conversationId: z.string().min(1),
  kind: z.enum(["faturas", "estoque", "compras", "receitas"]),
  params: z.object({ cpf: z.string().max(20).nullish(), name: z.string().max(200).nullish(), term: z.string().max(120).nullish() }).default({}),
});

/** Consulta rápida (só leitura) ao VMSet / espelho / receituário, para o atendente. */
export async function POST(request: Request) {
  const guard = await requireChatActor();
  if (guard.response) return guard.response;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return chatError("Consulta inválida.", 400);
  const conversation = await findScopedConversation(guard.actor, parsed.data.conversationId);
  if (!conversation) return conversationNotFound();
  const started = Date.now();
  try {
    const result = await quickQuery({ kind: parsed.data.kind, params: parsed.data.params, contactId: conversation.contactId });
    const cpf = parsed.data.params.cpf?.replace(/\D/g, "");
    console.log(`[copiloto][consulta] ${parsed.data.kind}${cpf ? ` cpf ${maskCpf(cpf)}` : ""}: ${result.ok ? "ok" : "sem resultado"} em ${Date.now() - started} ms`);
    return NextResponse.json(result);
  } catch {
    console.error(`[copiloto][consulta] ${parsed.data.kind} falhou`);
    return chatError("Não foi possível consultar agora. Tente de novo.", 503);
  }
}
