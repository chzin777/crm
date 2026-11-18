import { getUserAccess, requireApiSession } from "@/lib/api-auth";

/** Formatos aceitos para os vídeos de treinamento do /manual. */
export const VIDEO_TYPES: Record<string, string> = { mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", m4v: "video/mp4" };
/** Limite por vídeo: 2 GB. */
export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;
/** Tamanho de cada parte do envio (o proxy do app aceita até 25 MB por requisição). */
export const VIDEO_CHUNK_BYTES = 8 * 1024 * 1024;
export const VIDEO_PREFIX = "manual/videos/";
export const MAX_THUMBNAIL_BYTES = 1024 * 1024;

export type ManualVideoView = {
  id: string;
  title: string;
  description: string;
  category: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  duration: number | null;
  sizeBytes: number;
  mimeType: string;
  order: number;
  createdAt: string;
};

export const extensionOf = (fileName: string) => fileName.split(".").pop()?.toLowerCase() ?? "";

/** Chave do vídeo dentro do prefixo do manual, sem caminhos relativos. */
export const isVideoKey = (key: unknown): key is string =>
  typeof key === "string" && key.startsWith(VIDEO_PREFIX) && !key.includes("..") && key.length < 300;

export function toVideoView(video: {
  id: string; title: string; description: string | null; category: string | null; thumbnailKey: string | null;
  duration: number | null; sizeBytes: bigint; mimeType: string; order: number; createdAt: Date; updatedAt: Date;
}): ManualVideoView {
  return {
    id: video.id,
    title: video.title,
    description: video.description ?? "",
    category: video.category ?? "",
    videoUrl: `/api/manual/videos/${video.id}/stream`,
    thumbnailUrl: video.thumbnailKey ? `/api/manual/videos/${video.id}/thumbnail?v=${video.updatedAt.getTime()}` : null,
    duration: video.duration,
    sizeBytes: Number(video.sizeBytes),
    mimeType: video.mimeType,
    order: video.order,
    createdAt: video.createdAt.toISOString(),
  };
}

/** Só administradores enviam, editam e excluem vídeos. */
export async function requireVideoAdmin() {
  const user = await requireApiSession();
  if (!user) return { response: Response.json({ error: "Não autenticado." }, { status: 401 }) } as const;
  const access = await getUserAccess(user.id);
  if (!access?.isAdmin) return { response: Response.json({ error: "Apenas administradores podem gerenciar os vídeos." }, { status: 403 }) } as const;
  return { user } as const;
}

/** Texto curto e limpo vindo do formulário. */
export const cleanText = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");
