import "server-only";
import { prisma } from "@/lib/prisma";
import { readFile } from "@/lib/minio";
import { notifyChatChange } from "@/lib/chat/events";
import { aiConfigured, AiError, transcribeAudio } from "@/lib/ai/openai";
import { AI_ATTACHMENT_MAX_BYTES } from "@/lib/ai/attachments";
import type { ChatAttachment } from "@/lib/chat/media-rules";

export type TranscriptionResult = { text: string } | { failed: string; error?: AiError };

/** Outro container (Blue/Green) já transcrevendo: espera o resultado gravado em vez de pagar duas vezes. */
const WAIT_OTHER_MS = 60_000;
const POLL_MS = 1_500;
const running = new Map<string, Promise<TranscriptionResult>>();

async function waitForOther(messageId: string): Promise<TranscriptionResult> {
  const until = Date.now() + WAIT_OTHER_MS;
  while (Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    const row = await prisma.chatMessage.findUnique({ where: { id: messageId }, select: { transcription: true, transcriptionStatus: true } });
    if (row?.transcriptionStatus === "done") return { text: row.transcription ?? "" };
    if (row?.transcriptionStatus !== "pending") return { failed: "não foi possível transcrever o áudio" };
  }
  return { failed: "o áudio demorou demais para transcrever" };
}

async function run(messageId: string): Promise<TranscriptionResult> {
  const message = await prisma.chatMessage.findUnique({
    where: { id: messageId },
    select: { conversationId: true, author: true, attachment: true, transcription: true, transcriptionStatus: true },
  });
  const attachment = message?.attachment as ChatAttachment | null | undefined;
  if (!message || message.author !== "customer" || attachment?.kind !== "audio" || !attachment.key) return { failed: "mensagem sem áudio" };
  if (message.transcriptionStatus === "done") return { text: message.transcription ?? "" };
  if (message.transcriptionStatus === "failed") return { failed: "não foi possível transcrever o áudio" };
  if (!aiConfigured()) return { failed: "transcrição indisponível (IA não configurada)" };

  // Só um processo transcreve; os outros esperam o texto gravado.
  const claimed = await prisma.chatMessage.updateMany({ where: { id: messageId, transcriptionStatus: null }, data: { transcriptionStatus: "pending" } });
  if (!claimed.count) return waitForOther(messageId);
  notifyChatChange();

  let result: TranscriptionResult;
  try {
    if (attachment.size > AI_ATTACHMENT_MAX_BYTES) throw new AiError("áudio acima de 10 MB", 422);
    const data = await readFile(attachment.key);
    const text = await transcribeAudio({ name: attachment.name, mime: attachment.mime, data }, { feature: "transcription", conversationId: message.conversationId });
    result = { text };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "erro desconhecido";
    console.error(`[chat] transcrição do áudio ${messageId} falhou: ${reason}`);
    result = { failed: /demorou|tempo/i.test(reason) ? "o áudio demorou demais para transcrever" : reason.slice(0, 120), ...(error instanceof AiError ? { error } : {}) };
  }
  await prisma.chatMessage.update({
    where: { id: messageId },
    data: "text" in result ? { transcription: result.text, transcriptionStatus: "done" } : { transcriptionStatus: "failed" },
  }).catch((error) => console.error(`[chat] gravar transcrição ${messageId}:`, error));
  notifyChatChange();
  return result;
}

/**
 * Transcreve o áudio do cliente uma vez só e grava na mensagem (o chat mostra abaixo do player e a IA lê o texto).
 * Nunca lança: falha vira { failed } e a mensagem original fica intacta.
 */
export function transcribeMessageAudio(messageId: string): Promise<TranscriptionResult> {
  const current = running.get(messageId);
  if (current) return current;
  const task = run(messageId)
    .catch((error): TranscriptionResult => {
      console.error(`[chat] transcrição ${messageId}:`, error);
      return { failed: "não foi possível transcrever o áudio" };
    })
    .finally(() => running.delete(messageId));
  running.set(messageId, task);
  return task;
}
