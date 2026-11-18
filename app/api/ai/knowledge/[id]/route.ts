import { NextResponse } from "next/server";
import { requireModule } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { indexKnowledgeDocument } from "@/lib/ai/studio-db";
import { invalidateAiSettingsCache } from "@/lib/ai/store";

type Context = { params: Promise<{ id: string }> };
const select = { id: true, title: true, source: true, fileName: true, active: true, status: true, error: true, chunkCount: true, systemKey: true, createdAt: true, updatedAt: true } as const;
const MAX_TEXT = 400_000;

/** Documento com o texto completo (edição do Markdown). */
export async function GET(_request: Request, { params }: Context) {
  const guard = await requireModule("ia", "configuracoes");
  if (guard.response) return guard.response;
  const { id } = await params;
  const document = await prisma.knowledgeDocument.findUnique({ where: { id }, select: { ...select, content: true } });
  if (!document) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  return NextResponse.json({ document });
}

/** Liga/desliga o documento, renomeia, edita o texto ({ content }) ou reindexa ({ reindex: true }). */
export async function PATCH(request: Request, { params }: Context) {
  const guard = await requireModule("ia", "configuracoes");
  if (guard.response) return guard.response;
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { active?: unknown; title?: unknown; content?: unknown; reindex?: unknown } | null;
  const exists = await prisma.knowledgeDocument.findUnique({ where: { id }, select: { id: true, systemKey: true } });
  if (!exists) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 160) : "";
  const content = typeof body?.content === "string" ? body.content.replace(/\r\n/g, "\n").trim().slice(0, MAX_TEXT) : null;
  if (content === "") return NextResponse.json({ error: "O documento está sem texto." }, { status: 400 });
  await prisma.knowledgeDocument.update({
    where: { id },
    data: { ...(typeof body?.active === "boolean" ? { active: body.active } : {}), ...(title ? { title } : {}), ...(content !== null ? { content } : {}) },
  });
  // Fonte automática entra inteira no prompt (sem trechos de RAG); os demais reindexam ao mudar o texto.
  if (exists.systemKey) invalidateAiSettingsCache();
  else if (body?.reindex === true || content !== null) await indexKnowledgeDocument(id, guard.user.id);
  return NextResponse.json({ document: await prisma.knowledgeDocument.findUnique({ where: { id }, select }) });
}

export async function DELETE(_request: Request, { params }: Context) {
  const guard = await requireModule("ia", "configuracoes");
  if (guard.response) return guard.response;
  const { id } = await params;
  const document = await prisma.knowledgeDocument.findUnique({ where: { id }, select: { systemKey: true } });
  if (document?.systemKey) return NextResponse.json({ error: "Fonte automática não pode ser excluída: desligue o documento para a IA deixar de usá-la." }, { status: 400 });
  await prisma.knowledgeDocument.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
