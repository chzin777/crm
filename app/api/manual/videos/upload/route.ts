import { NextResponse } from "next/server";
import { uploadMultipartPart } from "@/lib/minio";
import { isVideoKey, requireVideoAdmin, VIDEO_CHUNK_BYTES } from "@/lib/manual-videos";

/** Recebe uma parte do vídeo (corpo binário) e devolve o ETag para concluir o envio. */
export async function PUT(request: Request) {
  const guard = await requireVideoAdmin();
  if (guard.response) return guard.response;
  const params = new URL(request.url).searchParams;
  const key = params.get("key");
  const uploadId = params.get("uploadId");
  const partNumber = Number(params.get("part"));
  if (!isVideoKey(key) || !uploadId || !Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10_000) {
    return NextResponse.json({ error: "Parte inválida." }, { status: 400 });
  }
  const body = Buffer.from(await request.arrayBuffer());
  if (body.length === 0 || body.length > VIDEO_CHUNK_BYTES) return NextResponse.json({ error: "Parte com tamanho inválido." }, { status: 400 });
  try {
    const etag = await uploadMultipartPart(key, uploadId, partNumber, body);
    return NextResponse.json({ partNumber, etag });
  } catch (error) {
    console.error("[manual/videos] falha ao gravar parte:", error);
    return NextResponse.json({ error: "Não foi possível gravar esta parte do vídeo." }, { status: 500 });
  }
}
