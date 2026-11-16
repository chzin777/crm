import "server-only";
import { prisma } from "@/lib/prisma";
import type { DocumentExtraction } from "@/lib/ai/document-extract";
import { hasPrescriptionData, prescriptionFromExtraction } from "@/lib/prescriptions";

/** Endereço do arquivo original da mensagem (foto ou PDF) para o atendente conferir. */
export const messageMediaUrl = (messageId: string) => `/api/chat/media/${messageId}`;

/**
 * Receita lida pela IA → cadastro do cliente (origem "ia_extracao", a conferir). Uma por mensagem: a mesma
 * mensagem reprocessada não cria outra. Sem nenhum grau nem médico legível, nada é gravado.
 */
export async function savePrescriptionFromAi(input: { contactId: string; conversationId: string; messageId: string; attachmentUrl?: string | null; extraction: DocumentExtraction | undefined }) {
  const fields = prescriptionFromExtraction(input.extraction);
  if (!hasPrescriptionData(fields)) return { saved: false as const, reason: "sem dados legíveis" };
  const existing = await prisma.customerPrescription.findUnique({ where: { messageId: input.messageId }, select: { id: true } });
  if (existing) return { saved: false as const, reason: "duplicada", id: existing.id };
  try {
    const row = await prisma.customerPrescription.create({
      data: { ...fields, contactId: input.contactId, conversationId: input.conversationId, messageId: input.messageId, attachmentUrl: input.attachmentUrl ?? messageMediaUrl(input.messageId), origem: "ia_extracao", conferidoPorHumano: false },
      select: { id: true },
    });
    return { saved: true as const, id: row.id };
  } catch (error) {
    // Duas leituras simultâneas da mesma mensagem: a outra já gravou.
    if ((error as { code?: string }).code === "P2002") return { saved: false as const, reason: "duplicada" };
    throw error;
  }
}
