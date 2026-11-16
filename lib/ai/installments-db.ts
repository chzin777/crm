import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { phoneVariants } from "@/lib/chat/phone";
import { addAudit, addSystemMessage } from "@/lib/chat/conversation";
import { draftInstallmentsMessage, maskCpf, nameMatches, summarizeInstallments, type InstallmentItem, type InstallmentLookup, type InstallmentsSummary } from "@/lib/ai/installments";

const API_URL = () => process.env.VMSET_STOCK_URL?.trim() || "http://host.docker.internal:9005";
const API_TOKEN = () => process.env.VMSET_STOCK_TOKEN?.trim() ?? "";
const TIMEOUT_MS = 8000;

/** Parcelas do crediário no VMSet (API do host, só leitura). Falha de rede/Oracle vira "unavailable", nunca exceção. */
export async function lookupInstallments(cpf: string, doFetch: typeof fetch = fetch): Promise<InstallmentLookup> {
  try {
    const response = await doFetch(`${API_URL()}/installments?cpf=${encodeURIComponent(cpf.replace(/\D/g, ""))}`, { headers: { "x-api-key": API_TOKEN() }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    if (!response.ok) return { status: "unavailable" };
    const data = (await response.json()) as { found?: boolean; name?: string | null; items?: InstallmentItem[] };
    return { status: "ok", found: !!data.found, name: data.name ?? null, items: Array.isArray(data.items) ? data.items : [] };
  } catch {
    console.warn("[ai][parcelas] consulta ao VMSet falhou");
    return { status: "unavailable" };
  }
}

/**
 * CPF do cadastro vinculado ao telefone do WhatsApp: só quando o telefone leva a UM único CPF vindo do ERP
 * (cadastro "cpf:..." do VMSet). Mais de um CPF no mesmo número (família) → a IA pede o CPF ao cliente.
 */
export async function linkedCpfForPhone(phone: string) {
  const contacts = await prisma.contact.findMany({ where: { phone: { in: phoneVariants(phone) } }, select: { sourceKey: true, cpf: true } });
  const cpfs = new Set(contacts.filter((item) => item.sourceKey.startsWith("cpf:")).map((item) => (item.cpf ?? item.sourceKey.slice(4)).replace(/\D/g, "")).filter((cpf) => cpf.length === 11));
  return cpfs.size === 1 ? [...cpfs][0] : null;
}

export type FinancialApprovalDraft = {
  customerNameVmset: string | null;
  customerCpfMasked: string;
  cpf: string;
  installmentsSummary: InstallmentsSummary;
  draftMessage: string;
  transcribedText: string;
  heardName: string | null;
  nameMatches: boolean;
};

/** Monta o card de aprovação a partir da consulta (sem gravar). */
export function buildApprovalDraft(input: { cpf: string; lookup: Extract<InstallmentLookup, { status: "ok" }>; transcribedText: string; heardName: string | null }): FinancialApprovalDraft {
  const summary = summarizeInstallments(input.lookup.items);
  return {
    customerNameVmset: input.lookup.name,
    customerCpfMasked: maskCpf(input.cpf),
    cpf: input.cpf,
    installmentsSummary: summary,
    draftMessage: draftInstallmentsMessage(input.lookup.name, summary),
    transcribedText: input.transcribedText.slice(0, 2000),
    heardName: input.heardName,
    nameMatches: nameMatches(input.heardName, input.lookup.name),
  };
}

/** Grava a aprovação pendente (a anterior da conversa vira "superseded") e registra no histórico interno. */
export async function createFinancialApproval(conversationId: string, draft: FinancialApprovalDraft) {
  return prisma.$transaction(async (tx) => {
    await tx.aiPendingAction.updateMany({ where: { conversationId, status: "pending" }, data: { status: "superseded" } });
    const action = await tx.aiPendingAction.create({
      data: { conversationId, type: "financial_installments", status: "pending", ...draft, installmentsSummary: draft.installmentsSummary as unknown as Prisma.InputJsonValue },
    });
    await addSystemMessage(conversationId, `⏳ Aprovação Financeira: a IA consultou as parcelas de ${draft.customerNameVmset ?? "cliente"} (CPF ${draft.customerCpfMasked}) e aguarda um operador conferir antes de enviar.`, tx);
    await tx.chatConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
    return action;
  });
}

export const pendingApproval = (conversationId: string) => prisma.aiPendingAction.findFirst({ where: { conversationId, status: "pending" }, orderBy: { createdAt: "desc" } });

export function serializeApproval(action: NonNullable<Awaited<ReturnType<typeof pendingApproval>>>) {
  return {
    id: action.id,
    type: action.type,
    status: action.status,
    customerNameVmset: action.customerNameVmset,
    customerCpfMasked: action.customerCpfMasked,
    installmentsSummary: action.installmentsSummary as unknown as InstallmentsSummary | null,
    draftMessage: action.draftMessage,
    transcribedText: action.transcribedText,
    heardName: action.heardName,
    nameMatches: action.nameMatches,
    createdAt: action.createdAt.toISOString(),
  };
}
export type ApprovalView = ReturnType<typeof serializeApproval>;

type Actor = { id: string; name: string };
type Sender = (text: string) => Promise<{ id: string } | null>;

/** Operador confirma (texto possivelmente editado): envia ao cliente, marca aprovado e audita. */
export async function approveFinancial(input: { actionId: string; conversationId: string; actor: Actor; message: string; send: Sender }) {
  const claimed = await prisma.aiPendingAction.updateMany({ where: { id: input.actionId, conversationId: input.conversationId, status: "pending" }, data: { status: "approving" } });
  if (!claimed.count) return { ok: false as const, error: "Esta aprovação já foi tratada por outro operador." };
  try {
    const sent = await input.send(input.message);
    const action = await prisma.aiPendingAction.update({ where: { id: input.actionId }, data: { status: "approved", draftMessage: input.message, decidedById: input.actor.id, decidedByName: input.actor.name, decidedAt: new Date(), sentMessageId: sent?.id ?? null } });
    await addSystemMessage(input.conversationId, `✅ Parcelas conferidas e enviadas ao cliente por ${input.actor.name}.`);
    await addAudit({ userId: input.actor.id, action: "ai.financial.approve", targetId: input.conversationId, before: { actionId: input.actionId, status: "pending" }, after: { status: "approved", messageId: sent?.id ?? null, cpf: action.customerCpfMasked } });
    return { ok: true as const, action, messageId: sent?.id ?? null };
  } catch (error) {
    // Envio falhou: a aprovação volta a pendente para tentar de novo.
    await prisma.aiPendingAction.update({ where: { id: input.actionId }, data: { status: "pending" } });
    throw error;
  }
}

/** Operador corrige o CPF e reconsulta o VMSet: o card passa a mostrar o novo cadastro/parcelas. */
export async function reconsultFinancial(input: { actionId: string; conversationId: string; actor: Actor; cpf: string; heardName?: string | null; lookup: (cpf: string) => Promise<InstallmentLookup> }) {
  const action = await prisma.aiPendingAction.findFirst({ where: { id: input.actionId, conversationId: input.conversationId, status: "pending" } });
  if (!action) return { ok: false as const, status: 404, error: "Aprovação não encontrada ou já tratada." };
  const result = await input.lookup(input.cpf);
  if (result.status !== "ok") return { ok: false as const, status: 503, error: "VMSet indisponível agora. Tente de novo em instantes." };
  if (!result.found) return { ok: false as const, status: 404, error: "Nenhum cadastro com esse CPF no VMSet." };
  const draft = buildApprovalDraft({ cpf: input.cpf.replace(/\D/g, ""), lookup: result, transcribedText: action.transcribedText ?? "", heardName: input.heardName ?? action.heardName });
  const updated = await prisma.aiPendingAction.update({ where: { id: action.id }, data: { ...draft, installmentsSummary: draft.installmentsSummary as unknown as Prisma.InputJsonValue } });
  await addAudit({ userId: input.actor.id, action: "ai.financial.reconsult", targetId: input.conversationId, before: { cpf: action.customerCpfMasked }, after: { cpf: draft.customerCpfMasked } });
  return { ok: true as const, action: updated };
}

/** Operador descarta o rascunho e assume o atendimento manualmente. */
export async function rejectFinancial(input: { actionId: string; conversationId: string; actor: Actor; assume: () => Promise<void> }) {
  const pending = await prisma.aiPendingAction.findFirst({ where: { id: input.actionId, conversationId: input.conversationId, status: "pending" }, select: { id: true } });
  if (!pending) return { ok: false as const, error: "Esta aprovação já foi tratada por outro operador." };
  // Assume antes de descartar: se outra pessoa já assumiu, o rascunho continua pendente para ela.
  await input.assume();
  const updated = await prisma.aiPendingAction.updateMany({ where: { id: input.actionId, conversationId: input.conversationId, status: "pending" }, data: { status: "rejected", decidedById: input.actor.id, decidedByName: input.actor.name, decidedAt: new Date() } });
  if (!updated.count) return { ok: false as const, error: "Esta aprovação já foi tratada por outro operador." };
  await addSystemMessage(input.conversationId, `❌ Rascunho financeiro da IA descartado por ${input.actor.name}, que assumiu o atendimento.`);
  await addAudit({ userId: input.actor.id, action: "ai.financial.reject", targetId: input.conversationId, before: { actionId: input.actionId, status: "pending" }, after: { status: "rejected" } });
  return { ok: true as const };
}
