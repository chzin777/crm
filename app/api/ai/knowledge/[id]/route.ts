import { NextResponse } from "next/server";
import { requireModule } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { indexKnowledgeDocument } from "@/lib/ai/studio-db";

type Context = { params: Promise<{ id: string }> };
const select = { id: true, title: true, source: true, fileName: true, active: true, status: true, error: true, chunkCount: true, createdAt: true, updatedAt: true } as const;

/** Liga/desliga o documento, renomeia ou reindexa ({ reindex: true }). */
export async function PATCH(request: Request, { params }: Context) {
  const guard = await requireModule("ia", "configuracoes");
  if (guard.response) return guard.response;
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { active?: unknown; title?: unknown; reindex?: unknown } | null;
  const exists = await prisma.knowledgeDocument.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 160) : "";
  await prisma.knowledgeDocument.update({ where: { id }, data: { ...(typeof body?.active === "boolean" ? { active: body.active } : {}), ...(title ? { title } : {}) } });
  if (body?.reindex === true) await indexKnowledgeDocument(id, guard.user.id);
  return NextResponse.json({ document: await prisma.knowledgeDocument.findUnique({ where: { id }, select }) });
}

export async function DELETE(_request: Request, { params }: Context) {
  const guard = await requireModule("ia", "configuracoes");
  if (guard.response) return guard.response;
  const { id } = await params;
  await prisma.knowledgeDocument.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
