import { prisma } from "@/lib/prisma";
import { readFileStream } from "@/lib/minio";
import { requireChatActor, scopeWhere } from "@/lib/chat/access";
import { safeDelivery, safeFileName, type ChatAttachment } from "@/lib/chat/media-rules";

type Context = { params: Promise<{ messageId: string }> };

const notFound = () => Response.json({ error: "Arquivo não encontrado." }, { status: 404 });

function parseRange(header: string, size: number) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : Math.max(size - Number(match[2]), 0);
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  return start > end || start >= size ? null : { start, end };
}

/** Exige sessão e escopo sobre a conversa; a Meta recebe os bytes, então esta rota não é pública. */
export async function GET(request: Request, context: Context) {
  const guard = await requireChatActor();
  if (guard.response) return guard.response;
  const { messageId } = await context.params;

  const message = await prisma.chatMessage.findFirst({
    where: { id: messageId, conversation: scopeWhere(guard.actor) },
    select: { attachment: true },
  });
  const attachment = message?.attachment as ChatAttachment | null | undefined;
  if (!attachment) return notFound();

  const { contentType, disposition } = safeDelivery(attachment.mime);
  const headers = new Headers({
    "Content-Type": contentType,
    "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(safeFileName(attachment.name))}`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  });

  const rangeHeader = request.headers.get("range");
  const range = rangeHeader ? parseRange(rangeHeader, attachment.size) : null;
  if (rangeHeader && !range) {
    headers.set("Content-Range", `bytes */${attachment.size}`);
    return new Response(null, { status: 416, headers });
  }

  try {
    if (range) {
      const { stream } = await readFileStream(attachment.key, `bytes=${range.start}-${range.end}`);
      headers.set("Content-Range", `bytes ${range.start}-${range.end}/${attachment.size}`);
      headers.set("Content-Length", String(range.end - range.start + 1));
      return new Response(stream, { status: 206, headers });
    }
    const { stream } = await readFileStream(attachment.key);
    headers.set("Content-Length", String(attachment.size));
    return new Response(stream, { status: 200, headers });
  } catch (error) {
    console.error("[chat] falha ao ler anexo:", error);
    return notFound();
  }
}
