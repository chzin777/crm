import { NextResponse } from "next/server";
import { ensureBucket, uploadFile } from "@/lib/minio";
import { chatError, requireChatActor } from "@/lib/chat/access";
import { kindForUpload, MAX_MEDIA_BYTES, safeFileName } from "@/lib/chat/media-rules";

let bucketReady = false;

/** Primeira etapa do envio: guarda o arquivo e devolve os metadados para a mensagem. */
export async function POST(request: Request) {
  const guard = await requireChatActor("chat.assume");
  if (guard.response) return guard.response;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return chatError("Nenhum arquivo enviado.", 400);
  if (file.size > MAX_MEDIA_BYTES) return chatError("O arquivo passa do limite de 16 MB.", 413);

  try {
    if (!bucketReady) {
      await ensureBucket();
      bucketReady = true;
    }
    const mime = file.type || "application/octet-stream";
    const name = safeFileName(file.name);
    const { key } = await uploadFile(Buffer.from(await file.arrayBuffer()), name, mime, `chat/upload/${guard.actor.id}`);
    return NextResponse.json({ kind: kindForUpload(mime, file.size), name, mime, size: file.size, key }, { status: 201 });
  } catch (error) {
    console.error("[chat] falha ao guardar anexo:", error);
    return chatError("Não foi possível guardar o arquivo.", 500);
  }
}
