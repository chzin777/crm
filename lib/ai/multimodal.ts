import * as XLSX from "xlsx";
import { AI_ATTACHMENT_LABELS, AI_DOCUMENT_TEXT_LIMIT, baseType, extensionOf, IMAGE_TYPES, type AiAttachmentKind } from "@/lib/ai/attachments";

/** Conteúdo dos anexos enviado à IA (regras de tipo e tamanho em lib/ai/attachments). */
/** MIME que a OpenAI aceita para a imagem (jpg vira jpeg). */
export const imageMime = (mime: string, name: string) => {
  const type = baseType(mime);
  if (IMAGE_TYPES.includes(type)) return type === "image/jpg" ? "image/jpeg" : type;
  const ext = extensionOf(name);
  return ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
};

/** Nome com a extensão que a transcrição reconhece (ela decide o formato pelo nome). */
export function audioFileName(mime: string, name: string) {
  const ext = extensionOf(name);
  if (["ogg", "oga", "mp3", "m4a", "mp4", "wav", "webm", "mpeg", "mpga", "flac"].includes(ext)) return name;
  const type = baseType(mime);
  const fixed = type.includes("ogg") || type.includes("opus") ? "ogg" : type.includes("mpeg") || type.includes("mp3") ? "mp3" : type.includes("mp4") || type.includes("m4a") || type.includes("aac") ? "m4a" : type.includes("wav") ? "wav" : "webm";
  return `${name.replace(/\.[^.]*$/, "") || "audio"}.${fixed}`;
}

/** Texto de .txt/.csv: UTF-8 (sem BOM); se não for UTF-8 válido, Latin-1 (arquivos salvos pelo Excel). */
export function decodeTextFile(data: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(data).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("latin1").decode(data);
  }
}

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** Texto do .docx (zip com word/document.xml): parágrafos viram linhas. */
export function extractDocxText(data: Uint8Array) {
  const zip = XLSX.CFB.read(data, { type: "array" });
  const entry = XLSX.CFB.find(zip, "word/document.xml") ?? XLSX.CFB.find(zip, "/word/document.xml");
  if (!entry?.content) throw new Error("Documento Word sem conteúdo legível.");
  const xml = new TextDecoder("utf-8").decode(entry.content as Uint8Array);
  return xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br[^>]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, entity: string) => XML_ENTITIES[entity])
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function limitDocumentText(text: string) {
  const clean = text.trim();
  return clean.length > AI_DOCUMENT_TEXT_LIMIT ? `${clean.slice(0, AI_DOCUMENT_TEXT_LIMIT)}\n[... documento cortado: só o início foi enviado à IA]` : clean;
}

export type AiContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } }
  | { type: "file"; file: { filename: string; file_data: string } };

export type AiMediaInput = { name: string; mime: string; data: Uint8Array };
export type PreparedMedia = { kind: AiAttachmentKind; name: string; parts: AiContentPart[]; transcript?: string; summary: string };

const toBase64 = (data: Uint8Array) => Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("base64");
const ONE_LINE = (value: string) => value.replace(/\s+/g, " ").trim();

/**
 * Monta o conteúdo do anexo para a mensagem do cliente. O áudio chega aqui já transcrito
 * (a transcrição é uma chamada à parte, registrada no consumo).
 */
export function mediaParts(kind: AiAttachmentKind, media: AiMediaInput, transcript?: string): PreparedMedia {
  const name = media.name || AI_ATTACHMENT_LABELS[kind];
  switch (kind) {
    case "image":
      return {
        kind, name,
        summary: `[Cliente enviou uma imagem: ${name}]`,
        parts: [
          { type: "text", text: `O cliente enviou a imagem "${name}" (pode ser receita oftalmológica, armação, documento ou outra foto). Analise a imagem para responder.` },
          { type: "image_url", image_url: { url: `data:${imageMime(media.mime, name)};base64,${toBase64(media.data)}`, detail: "high" } },
        ],
      };
    case "pdf":
      return {
        kind, name,
        summary: `[Cliente enviou o PDF: ${name}]`,
        parts: [
          { type: "text", text: `O cliente enviou o PDF "${name}" (pode ser receita, orçamento ou documento). Leia o conteúdo para responder.` },
          { type: "file", file: { filename: name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`, file_data: `data:application/pdf;base64,${toBase64(media.data)}` } },
        ],
      };
    case "text":
    case "docx": {
      const text = limitDocumentText(kind === "docx" ? extractDocxText(media.data) : decodeTextFile(media.data));
      return {
        kind, name,
        summary: `[Cliente enviou o documento: ${name}]`,
        parts: [{ type: "text", text: text ? `O cliente enviou o documento "${name}". Conteúdo:\n"""\n${text}\n"""` : `O cliente enviou o documento "${name}", mas ele não tem texto legível.` }],
      };
    }
    case "audio": {
      const said = transcript?.trim() ?? "";
      return {
        kind, name, transcript: said,
        summary: said ? `[Áudio do cliente, transcrição: ${ONE_LINE(said)}]` : "[Cliente enviou um áudio sem fala reconhecível]",
        parts: [{ type: "text", text: said ? `O cliente enviou um áudio. Transcrição automática:\n"""\n${said}\n"""` : "O cliente enviou um áudio, mas não foi possível reconhecer a fala. Peça gentilmente para ele escrever." }],
      };
    }
  }
}

/** Orientação extra do sistema quando há anexo na conversa. */
export const MEDIA_RULES =
  "Anexos do cliente: use o conteúdo de PDFs, documentos e transcrições de áudio para responder, sem repetir ou resumir para o cliente o que ele mesmo enviou. Receitas, laudos e orçamentos de outra ótica exigem conferência humana: transfira (action handoff). Imagens seguem a REGRA CRÍTICA SOBRE IMAGENS.";

type TurnMessage = { from: "customer" | "ai"; text: string };

/** Junta o resumo do anexo à última mensagem do cliente (texto opcional + anexo). */
export function attachSummary<T extends TurnMessage>(messages: T[], summary: string): TurnMessage[] {
  const index = messages.map((message) => message.from).lastIndexOf("customer");
  if (index < 0) return [...messages, { from: "customer", text: summary }];
  return messages.map((message, i) => (i === index ? { ...message, text: [message.text, summary].filter(Boolean).join("\n") } : message));
}
