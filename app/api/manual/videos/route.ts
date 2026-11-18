import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { abortMultipartUpload, completeMultipartUpload, deleteFile, ensureBucket, putFile, startMultipartUpload } from "@/lib/minio";
import {
  cleanText,
  extensionOf,
  isVideoKey,
  MAX_THUMBNAIL_BYTES,
  MAX_VIDEO_BYTES,
  requireVideoAdmin,
  toVideoView,
  VIDEO_PREFIX,
  VIDEO_TYPES,
} from "@/lib/manual-videos";

let bucketReady = false;

/** Lista os vídeos de treinamento (qualquer usuário logado). */
export async function GET() {
  if (!(await requireApiSession())) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const videos = await prisma.manualVideo.findMany({ orderBy: [{ order: "asc" }, { createdAt: "asc" }] });
  return NextResponse.json({ data: videos.map(toVideoView) });
}

type Body = {
  action?: string;
  fileName?: unknown;
  size?: unknown;
  key?: unknown;
  uploadId?: unknown;
  parts?: unknown;
  title?: unknown;
  description?: unknown;
  category?: unknown;
  duration?: unknown;
  thumbnail?: unknown;
};

const isParts = (value: unknown): value is { partNumber: number; etag: string }[] =>
  Array.isArray(value) && value.length > 0 && value.length <= 10_000 &&
  value.every((part) => typeof part === "object" && part !== null && Number.isInteger((part as { partNumber: unknown }).partNumber) && typeof (part as { etag: unknown }).etag === "string");

/**
 * Envio do vídeo em 3 etapas (somente administradores):
 * "init" abre o envio em partes, as partes vão por PUT em /upload e "complete" junta o arquivo e cadastra o vídeo.
 * "abort" descarta um envio interrompido.
 */
export async function POST(request: Request) {
  const guard = await requireVideoAdmin();
  if (guard.response) return guard.response;
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });

  try {
    if (!bucketReady) {
      await ensureBucket();
      bucketReady = true;
    }

    if (body.action === "init") {
      const fileName = typeof body.fileName === "string" ? body.fileName : "";
      const extension = extensionOf(fileName);
      const mime = VIDEO_TYPES[extension];
      if (!mime) return NextResponse.json({ error: "Formato não suportado. Envie um vídeo .mp4, .webm ou .mov." }, { status: 400 });
      const size = Number(body.size);
      if (!Number.isFinite(size) || size <= 0) return NextResponse.json({ error: "Arquivo vazio." }, { status: 400 });
      if (size > MAX_VIDEO_BYTES) return NextResponse.json({ error: "O vídeo passa do limite de 2 GB." }, { status: 413 });
      const key = `${VIDEO_PREFIX}${randomUUID()}/video.${extension}`;
      const uploadId = await startMultipartUpload(key, mime);
      return NextResponse.json({ key, uploadId, mime });
    }

    if (body.action === "abort") {
      if (isVideoKey(body.key) && typeof body.uploadId === "string") await abortMultipartUpload(body.key, body.uploadId).catch(() => undefined);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "complete") {
      if (!isVideoKey(body.key) || typeof body.uploadId !== "string" || !isParts(body.parts)) {
        return NextResponse.json({ error: "Envio inválido." }, { status: 400 });
      }
      const title = cleanText(body.title, 150);
      if (!title) return NextResponse.json({ error: "Informe o título do vídeo." }, { status: 400 });
      const mime = VIDEO_TYPES[extensionOf(body.key)];
      const size = Number(body.size);
      if (!mime || !Number.isFinite(size) || size <= 0 || size > MAX_VIDEO_BYTES) return NextResponse.json({ error: "Envio inválido." }, { status: 400 });
      await completeMultipartUpload(body.key, body.uploadId, body.parts);

      // Miniatura: quadro do vídeo capturado no navegador (JPEG em data URL), opcional.
      let thumbnailKey: string | null = null;
      if (typeof body.thumbnail === "string") {
        const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(body.thumbnail);
        const buffer = match ? Buffer.from(match[1], "base64") : null;
        if (buffer && buffer.length > 0 && buffer.length <= MAX_THUMBNAIL_BYTES) {
          thumbnailKey = body.key.replace(/video\.[a-z0-9]+$/, "thumbnail.jpg");
          await putFile(thumbnailKey, buffer, "image/jpeg").catch(() => { thumbnailKey = null; });
        }
      }
      const duration = Number(body.duration);
      const last = await prisma.manualVideo.aggregate({ _max: { order: true } });
      const description = typeof body.description === "string" ? body.description.trim().slice(0, 2000) : "";
      const video = await prisma.manualVideo.create({
        data: {
          title,
          description: description || null,
          category: cleanText(body.category, 60) || null,
          storageKey: body.key,
          mimeType: mime,
          sizeBytes: BigInt(Math.round(size)),
          duration: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null,
          thumbnailKey,
          order: (last._max.order ?? 0) + 1,
          createdById: guard.user.id,
        },
      });
      return NextResponse.json({ data: toVideoView(video) }, { status: 201 });
    }

    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    console.error("[manual/videos] falha no envio:", error);
    if (body.action === "complete" && isVideoKey(body.key)) await deleteFile(body.key).catch(() => undefined);
    return NextResponse.json({ error: "Não foi possível guardar o vídeo." }, { status: 500 });
  }
}
