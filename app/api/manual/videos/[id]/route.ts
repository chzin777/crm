import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteFile } from "@/lib/minio";
import { cleanText, requireVideoAdmin, toVideoView } from "@/lib/manual-videos";

type Context = { params: Promise<{ id: string }> };

/** Edita título, descrição, categoria ou posição do vídeo (somente administradores). */
export async function PATCH(request: Request, context: Context) {
  const guard = await requireVideoAdmin();
  if (guard.response) return guard.response;
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { title?: unknown; description?: unknown; category?: unknown; order?: unknown } | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });

  const data: { title?: string; description?: string | null; category?: string | null; order?: number } = {};
  if (body.title !== undefined) {
    const title = cleanText(body.title, 150);
    if (!title) return NextResponse.json({ error: "Informe o título do vídeo." }, { status: 400 });
    data.title = title;
  }
  if (body.description !== undefined) data.description = (typeof body.description === "string" ? body.description.trim().slice(0, 2000) : "") || null;
  if (body.category !== undefined) data.category = cleanText(body.category, 60) || null;
  if (body.order !== undefined) {
    if (!Number.isInteger(body.order)) return NextResponse.json({ error: "Posição inválida." }, { status: 400 });
    data.order = body.order as number;
  }

  const exists = await prisma.manualVideo.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "Vídeo não encontrado." }, { status: 404 });
  const video = await prisma.manualVideo.update({ where: { id }, data });
  return NextResponse.json({ data: toVideoView(video) });
}

/** Exclui o vídeo e os arquivos guardados (somente administradores). */
export async function DELETE(_request: Request, context: Context) {
  const guard = await requireVideoAdmin();
  if (guard.response) return guard.response;
  const { id } = await context.params;
  const video = await prisma.manualVideo.findUnique({ where: { id } });
  if (!video) return NextResponse.json({ error: "Vídeo não encontrado." }, { status: 404 });
  await prisma.manualVideo.delete({ where: { id } });
  await Promise.all([
    deleteFile(video.storageKey).catch((error) => console.error("[manual/videos] arquivo não removido:", error)),
    video.thumbnailKey ? deleteFile(video.thumbnailKey).catch(() => undefined) : Promise.resolve(),
  ]);
  return NextResponse.json({ ok: true });
}
