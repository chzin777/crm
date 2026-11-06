export const MAX_MEDIA_BYTES = 16 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type AttachmentKind = "image" | "video" | "audio" | "document" | "sticker";

export type ChatAttachment = {
  kind: AttachmentKind;
  name: string;
  mime: string;
  size: number;
  key: string;
};

/** Como a Meta aceita cada arquivo: fora das regras de imagem e vídeo, segue como documento. */
export function kindForUpload(mime: string, size: number): AttachmentKind {
  const type = mime.split(";")[0].trim().toLowerCase();
  if ((type === "image/jpeg" || type === "image/png") && size <= MAX_IMAGE_BYTES) return "image";
  if (type === "video/mp4" && size <= MAX_MEDIA_BYTES) return "video";
  if (type.startsWith("audio/")) return "audio";
  return "document";
}

const INLINE_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "video/mp4", "video/webm",
  "audio/ogg", "audio/mpeg", "audio/mp4", "audio/webm", "audio/aac", "audio/amr",
  "application/pdf",
]);

/** Tipo do arquivo é escolhido por quem enviou: só a lista fechada abre no navegador. */
export function safeDelivery(mime: string): { contentType: string; disposition: "inline" | "attachment" } {
  const type = mime.split(";")[0].trim().toLowerCase();
  return INLINE_TYPES.has(type) ? { contentType: type, disposition: "inline" } : { contentType: "application/octet-stream", disposition: "attachment" };
}

export function safeFileName(name: string) {
  const clean = name.replace(/[\u0000-\u001f\u007f"\\/:*?<>|;]+/g, "_").replace(/\s+/g, " ").trim();
  return clean.slice(0, 120) || "arquivo";
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "audio/ogg": "ogg",
  "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac", "audio/amr": "amr", "application/pdf": "pdf",
};

export const extensionFor = (mime: string) => EXTENSIONS[mime.split(";")[0].trim().toLowerCase()] ?? "bin";
