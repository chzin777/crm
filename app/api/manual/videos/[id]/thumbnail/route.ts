import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { readFileStream } from "@/lib/minio";

type Context = { params: Promise<{ id: string }> };

/** Miniatura do vídeo (quadro capturado no envio). */
export async function GET(_request: Request, context: Context) {
  if (!(await requireApiSession())) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await context.params;
  const video = await prisma.manualVideo.findUnique({ where: { id }, select: { thumbnailKey: true } });
  if (!video?.thumbnailKey) return Response.json({ error: "Miniatura não encontrada." }, { status: 404 });
  try {
    const { stream } = await readFileStream(video.thumbnailKey);
    return new Response(stream, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return Response.json({ error: "Miniatura não encontrada." }, { status: 404 });
  }
}
