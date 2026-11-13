/**
 * Anexos que a IA entende (teste da página /ia e atendimento autônomo): imagem vai como visão,
 * PDF como arquivo nativo, áudio (e a faixa de áudio do vídeo) é transcrito antes, documentos e planilhas viram
 * texto no contexto. Este arquivo não importa nada do servidor: as mesmas regras validam o arquivo na tela.
 */
export const AI_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
/** Limite do texto extraído de documentos e planilhas (o resto é cortado com aviso). */
export const AI_DOCUMENT_TEXT_LIMIT = 12_000;
/** Anexos lidos por lote de mensagens (custo e tempo de resposta). */
export const AI_ATTACHMENTS_PER_BATCH = 4;
/** Preço do whisper-1 por minuto de áudio (US$). */
export const TRANSCRIPTION_USD_PER_MINUTE = 0.006;
export const TRANSCRIPTION_MODEL = "whisper-1";

export type AiAttachmentKind = "image" | "audio" | "pdf" | "text" | "docx" | "sheet" | "video";

export const IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const AUDIO_TYPES = ["audio/ogg", "audio/opus", "audio/mpeg", "audio/mp3", "audio/mp4", "audio/m4a", "audio/x-m4a", "audio/aac", "audio/wav", "audio/x-wav", "audio/wave", "audio/webm", "video/webm"];
const VIDEO_TYPES = ["video/mp4", "video/3gpp", "video/3gp", "video/quicktime"];
const TEXT_TYPES = ["text/plain", "text/csv", "application/csv"];
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const SHEET_TYPES = ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel"];
const EXTENSIONS: Record<string, AiAttachmentKind> = {
  jpg: "image", jpeg: "image", png: "image", webp: "image",
  ogg: "audio", oga: "audio", opus: "audio", mp3: "audio", m4a: "audio", aac: "audio", wav: "audio", webm: "audio",
  mp4: "video", "3gp": "video", mov: "video",
  pdf: "pdf", txt: "text", csv: "text", docx: "docx", xlsx: "sheet", xls: "sheet",
};
/** Vídeo cujo áudio a transcrição aceita (3GP/MOV não). */
export const TRANSCRIBABLE_VIDEO = ["mp4", "webm"];

/** Valor do atributo accept do campo de arquivo. */
export const AI_ATTACHMENT_ACCEPT = [
  "image/jpeg", "image/png", "image/webp",
  "audio/ogg", "audio/mpeg", "audio/mp4", "audio/wav", "audio/webm", "video/mp4",
  "application/pdf", "text/plain", "text/csv", DOCX_TYPE, ...SHEET_TYPES,
  ".jpg", ".jpeg", ".png", ".webp", ".ogg", ".opus", ".mp3", ".m4a", ".wav", ".webm", ".mp4", ".pdf", ".txt", ".csv", ".docx", ".xlsx", ".xls",
].join(",");

export const AI_ATTACHMENT_LABELS: Record<AiAttachmentKind, string> = { image: "imagem", audio: "áudio", pdf: "PDF", text: "documento de texto", docx: "documento Word", sheet: "planilha", video: "vídeo" };

export const baseType = (mime: string) => mime.split(";")[0].trim().toLowerCase();
export const extensionOf = (name: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");

/** Tipo do anexo pelo MIME; quando o navegador manda um MIME genérico (ex.: CSV no Windows), vale a extensão. */
export function aiAttachmentKind(mime: string, name: string): AiAttachmentKind | null {
  const type = baseType(mime);
  if (IMAGE_TYPES.includes(type)) return "image";
  if (AUDIO_TYPES.includes(type)) return "audio";
  if (VIDEO_TYPES.includes(type)) return "video";
  if (type === "application/pdf") return "pdf";
  if (TEXT_TYPES.includes(type)) return "text";
  if (type === DOCX_TYPE) return "docx";
  // O Windows manda CSV como "application/vnd.ms-excel": a extensão decide.
  if (SHEET_TYPES.includes(type)) return extensionOf(name) === "csv" ? "text" : "sheet";
  return EXTENSIONS[extensionOf(name)] ?? null;
}

/** Motivo amigável para um formato que a IA não lê (ex.: Word .doc antigo), usado no aviso ao cliente. */
export function unsupportedReason(mime: string, name: string) {
  const ext = extensionOf(name);
  if (ext === "doc" || baseType(mime) === "application/msword") return "arquivo Word .doc antigo (formato não suportado)";
  if (ext === "ppt" || ext === "pptx") return "apresentação PowerPoint (formato não suportado)";
  if (["zip", "rar", "7z"].includes(ext)) return "arquivo compactado (formato não suportado)";
  if (["heic", "heif"].includes(ext)) return "foto HEIC (formato não suportado)";
  return `formato não suportado${ext ? ` (.${ext})` : ""}`;
}

export type AttachmentCheck = { ok: true; kind: AiAttachmentKind } | { ok: false; error: string };

export function validateAiAttachment(file: { name: string; type: string; size: number }): AttachmentCheck {
  const kind = aiAttachmentKind(file.type, file.name);
  if (!kind) return { ok: false, error: `Formato não suportado (${file.name}). Use imagem (JPG, PNG, WEBP), áudio (OGG, MP3, M4A, WAV, WEBM), vídeo (MP4) ou documento (PDF, TXT, CSV, DOCX, XLSX, XLS).` };
  if (!file.size) return { ok: false, error: "O arquivo está vazio." };
  if (file.size > AI_ATTACHMENT_MAX_BYTES) return { ok: false, error: `Arquivo acima de 10 MB (${(file.size / 1024 / 1024).toFixed(1)} MB).` };
  return { ok: true, kind };
}

/** Custo da transcrição pela duração do áudio (o whisper cobra por segundo). */
export const transcriptionCostUsd = (seconds: number) => (Number.isFinite(seconds) && seconds > 0 ? (seconds / 60) * TRANSCRIPTION_USD_PER_MINUTE : 0);
/** Estimativa de tokens de um texto (≈ 4 caracteres por token), usada no registro da transcrição. */
export const estimateTokens = (text: string) => Math.ceil(text.trim().length / 4);
