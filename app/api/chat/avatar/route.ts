import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteFile, ensureBucket, readFileStream, uploadFile } from "@/lib/minio";
import { chatError, conversationNotFound, findScopedConversation, requireChatActor } from "@/lib/chat/access";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const AVATAR_PREFIX = "chat/avatar/";
const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MIME_BY_EXTENSION = Object.fromEntries(Object.entries(EXTENSIONS).map(([mime, extension]) => [extension, mime]));

let bucketReady = false;

const avatarUrl = (key: string) => `/api/chat/avatar?key=${encodeURIComponent(key)}`;
const keyFromUrl = (url: string | null) => (url ? new URLSearchParams(url.split("?")[1]).get("key") : null);

export async function GET(request: Request) {
  const guard = await requireChatActor();
  if (guard.response) return guard.response;

  const key = new URL(request.url).searchParams.get("key") ?? "";
  const mime = MIME_BY_EXTENSION[key.split(".").pop() ?? ""];
  if (!key.startsWith(AVATAR_PREFIX) || key.includes("..") || !mime) return chatError("Foto não encontrada.", 404);

  try {
    const { stream } = await readFileStream(key);
    return new Response(stream, {
      headers: { "Content-Type": mime, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return chatError("Foto não encontrada.", 404);
  }
}

export async function POST(request: Request) {
  const guard = await requireChatActor("chat.assume");
  if (guard.response) return guard.response;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const conversationId = form?.get("conversationId");
  if (!(file instanceof File) || file.size === 0 || typeof conversationId !== "string") return chatError("Nenhuma foto enviada.", 400);
  const extension = EXTENSIONS[file.type];
  if (!extension) return chatError("Envie uma foto em JPG, PNG ou WebP.", 400);
  if (file.size > MAX_AVATAR_BYTES) return chatError("A foto passa do limite de 5 MB.", 413);

  const conversation = await findScopedConversation(guard.actor, conversationId);
  if (!conversation) return conversationNotFound();

  try {
    if (!bucketReady) {
      await ensureBucket();
      bucketReady = true;
    }
    const { contactId } = conversation;
    const previous = await prisma.contact.findUnique({ where: { id: contactId }, select: { avatarUrl: true } });
    const { key } = await uploadFile(Buffer.from(await file.arrayBuffer()), `avatar.${extension}`, file.type, `${AVATAR_PREFIX}${contactId}`);
    const url = avatarUrl(key);
    await prisma.contact.update({ where: { id: contactId }, data: { avatarUrl: url } });

    const previousKey = keyFromUrl(previous?.avatarUrl ?? null);
    if (previousKey) await deleteFile(previousKey).catch((error) => console.error("[chat] foto antiga não removida:", error));
    return NextResponse.json({ avatarUrl: url }, { status: 201 });
  } catch (error) {
    console.error("[chat] falha ao guardar foto do contato:", error);
    return chatError("Não foi possível guardar a foto.", 500);
  }
}
