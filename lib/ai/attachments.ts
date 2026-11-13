/**
 * Anexos que a IA entende (teste da página /ia e atendimento autônomo): imagem vai como visão,
 * PDF como arquivo nativo, áudio é transcrito antes e documentos de texto viram texto no contexto.
 * Este arquivo não importa nada do servidor: as mesmas regras validam o arquivo na tela.
 */
export const AI_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
/** Limite do texto extraído de documentos (o resto é cortado com aviso). */
export const AI_DOCUMENT_TEXT_LIMIT = 12_000;
/** Preço do whisper-1 por minuto de áudio (US$). */
export const TRANSCRIPTION_USD_PER_MINUTE = 0.006;
export const TRANSCRIPTION_MODEL = "whisper-1";

export type AiAttachmentKind = "image" | "audio" | "pdf" | "text" | "docx";

export const IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const AUDIO_TYPES = ["audio/ogg", "audio/opus", "audio/mpeg", "audio/mp3", "audio/mp4", "audio/m4a", "audio/x-m4a", "audio/aac", "audio/wav", "audio/x-wav", "audio/wave", "audio/webm", "video/webm"];
const TEXT_TYPES = ["text/plain", "text/csv", "application/csv"];
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const EXTENSIONS: Record<string, AiAttachmentKind> = {
  jpg: "image", jpeg: "image", png: "image", webp: "image",
  ogg: "audio", oga: "audio", opus: "audio", mp3: "audio", m4a: "audio", mp4: "audio", aac: "audio", wav: "audio", webm: "audio",
  pdf: "pdf", txt: "text", csv: "text", docx: "docx",
};

/** Valor do atributo accept do campo de arquivo. */
export const AI_ATTACHMENT_ACCEPT = [
  "image/jpeg", "image/png", "image/webp",
  "audio/ogg", "audio/mpeg", "audio/mp4", "audio/wav", "audio/webm",
  "application/pdf", "text/plain", "text/csv", DOCX_TYPE,
  ".jpg", ".jpeg", ".png", ".webp", ".ogg", ".opus", ".mp3", ".m4a", ".wav", ".webm", ".pdf", ".txt", ".csv", ".docx",
].join(",");

export const AI_ATTACHMENT_LABELS: Record<AiAttachmentKind, string> = { image: "imagem", audio: "áudio", pdf: "PDF", text: "documento de texto", docx: "documento Word" };

export const baseType = (mime: string) => mime.split(";")[0].trim().toLowerCase();
export const extensionOf = (name: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");

/** Tipo do anexo pelo MIME; quando o navegador manda um MIME genérico (ex.: CSV no Windows), vale a extensão. */
export function aiAttachmentKind(mime: string, name: string): AiAttachmentKind | null {
  const type = baseType(mime);
  if (IMAGE_TYPES.includes(type)) return "image";
  if (AUDIO_TYPES.includes(type)) return "audio";
  if (type === "application/pdf") return "pdf";
  if (TEXT_TYPES.includes(type)) return "text";
  if (type === DOCX_TYPE) return "docx";
  return EXTENSIONS[extensionOf(name)] ?? null;
}

export type AttachmentCheck = { ok: true; kind: AiAttachmentKind } | { ok: false; error: string };

export function validateAiAttachment(file: { name: string; type: string; size: number }): AttachmentCheck {
  const kind = aiAttachmentKind(file.type, file.name);
  if (!kind) return { ok: false, error: `Formato não suportado (${file.name}). Use imagem (JPG, PNG, WEBP), áudio (OGG, MP3, M4A, WAV, WEBM) ou documento (PDF, TXT, CSV, DOCX).` };
  if (!file.size) return { ok: false, error: "O arquivo está vazio." };
  if (file.size > AI_ATTACHMENT_MAX_BYTES) return { ok: false, error: `Arquivo acima de 10 MB (${(file.size / 1024 / 1024).toFixed(1)} MB).` };
  return { ok: true, kind };
}

/** Custo da transcrição pela duração do áudio (o whisper cobra por segundo). */
export const transcriptionCostUsd = (seconds: number) => (Number.isFinite(seconds) && seconds > 0 ? (seconds / 60) * TRANSCRIPTION_USD_PER_MINUTE : 0);
/** Estimativa de tokens de um texto (≈ 4 caracteres por token), usada no registro da transcrição. */
export const estimateTokens = (text: string) => Math.ceil(text.trim().length / 4);
