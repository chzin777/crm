import "server-only";
import { createHash } from "node:crypto";
import { ensureBucket, putFile } from "@/lib/minio";
import type { AttachmentKind, ChatAttachment } from "@/lib/chat/media-rules";

/**
 * Mídia do cabeçalho de modelos enviados por campanha, envio em massa e automação, guardada uma vez no
 * armazenamento do chat (chave pelo conteúdo) para aparecer no balão do /chat junto do texto do modelo.
 */

/** Tipo da mídia do cabeçalho do modelo da Meta. */
export function headerMediaKind(mime: string): Extract<AttachmentKind, "image" | "video" | "document"> {
  const type = mime.split(";")[0].trim().toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  return "document";
}

const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "application/pdf": "pdf" };

/** Anexo do chat para a mídia (mesmo conteúdo = mesma chave: o lote inteiro aponta para um único arquivo). */
export function dispatchAttachmentFor(buffer: Buffer, mime: string, name?: string): ChatAttachment {
  const type = mime.split(";")[0].trim().toLowerCase() || "image/jpeg";
  const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 32);
  const ext = EXTENSIONS[type] ?? "bin";
  return { kind: headerMediaKind(type), name: name?.trim() || `modelo.${ext}`, mime: type, size: buffer.length, key: `chat/disparo/${hash}.${ext}` };
}

let bucketReady = false;
const stored = new Set<string>();

/** Guarda a mídia do cabeçalho e devolve o anexo para gravar nas mensagens do chat. Falha aqui não impede o envio. */
export async function storeDispatchMedia(buffer: Buffer, mime: string, name?: string): Promise<ChatAttachment | null> {
  const attachment = dispatchAttachmentFor(buffer, mime, name);
  if (stored.has(attachment.key)) return attachment;
  try {
    if (!bucketReady) {
      await ensureBucket();
      bucketReady = true;
    }
    await putFile(attachment.key, buffer, attachment.mime);
    stored.add(attachment.key);
    return attachment;
  } catch (error) {
    console.error("[chat] falha ao guardar a mídia do modelo para o histórico:", error);
    return null;
  }
}

/** Baixa uma mídia por URL (imagem do modelo na Meta ou anexo da campanha) com limite de tempo. */
export async function downloadMedia(url: string, timeoutMs = 20_000): Promise<{ buffer: Buffer; mime: string } | null> {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) }).catch(() => null);
  if (!response?.ok) return null;
  return { buffer: Buffer.from(await response.arrayBuffer()), mime: response.headers.get("content-type")?.split(";")[0] || "image/jpeg" };
}
