import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { readFileStream } from "@/lib/minio";

type Context = { params: Promise<{ id: string }> };

function parseRange(header: string, size: number) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : Math.max(size - Number(match[2]), 0);
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  return start > end || start >= size ? null : { start, end };
}

/** Reprodução do vídeo com suporte a Range (avançar/voltar no player sem baixar tudo). */
export async function GET(request: Request, context: Context) {
  if (!(await requireApiSession())) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await context.params;
  const video = await prisma.manualVideo.findUnique({ where: { id }, select: { storageKey: true, mimeType: true, sizeBytes: true } });
  if (!video) return Response.json({ error: "Vídeo não encontrado." }, { status: 404 });

  const size = Number(video.sizeBytes);
  const headers = new Headers({
    "Content-Type": video.mimeType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  });
  const rangeHeader = request.headers.get("range");
  const range = rangeHeader ? parseRange(rangeHeader, size) : null;
  if (rangeHeader && !range) {
    headers.set("Content-Range", `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }
  try {
    if (range) {
      const { stream } = await readFileStream(video.storageKey, `bytes=${range.start}-${range.end}`);
      headers.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
      headers.set("Content-Length", String(range.end - range.start + 1));
      return new Response(stream, { status: 206, headers });
    }
    const { stream } = await readFileStream(video.storageKey);
    headers.set("Content-Length", String(size));
    return new Response(stream, { headers });
  } catch (error) {
    console.error("[manual/videos] falha ao ler vídeo:", error);
    return Response.json({ error: "Vídeo indisponível." }, { status: 404 });
  }
}
