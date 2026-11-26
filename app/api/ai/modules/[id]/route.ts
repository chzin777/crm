import { NextResponse } from "next/server";
import { requireModule } from "@/lib/api-auth";
import { deletePromptModule, updatePromptModule } from "@/lib/ai/prompt-modules-db";
import type { PromptModule } from "@/lib/ai/prompt-modules";

type Context = { params: Promise<{ id: string }> };

/** Salva o módulo (campos enviados por cima dos atuais); o texto anterior vira revisão. */
export async function PATCH(request: Request, { params }: Context) {
  const guard = await requireModule("ia", "configuracoes");
  if (guard.response) return guard.response;
  const { id } = await params;
  const result = await updatePromptModule(id, ((await request.json().catch(() => null)) ?? {}) as Partial<PromptModule>, guard.user.id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.error.includes("não encontrado") ? 404 : 400 });
  return NextResponse.json({ module: result });
}

export async function DELETE(_request: Request, { params }: Context) {
  const guard = await requireModule("ia", "configuracoes");
  if (guard.response) return guard.response;
  const { id } = await params;
  await deletePromptModule(id);
  return NextResponse.json({ ok: true });
}
