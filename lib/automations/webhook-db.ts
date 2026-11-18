import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { formatPhone, phoneVariants } from "@/lib/chat/phone";
import { triggerAutomations } from "@/lib/automations/engine-db";
import { sanitizeGraph, triggerNodes } from "@/lib/automations/nodes";
import { extractLead, flattenPayload, payloadVars, type Lead } from "@/lib/automations/webhook-lead";

/** Última amostra recebida pela URL do fluxo (tela "Escutar evento de teste"). */
const sampleKey = (flowId: string) => `webhook-sample:${flowId}`;
export type WebhookSample = { receivedAt: string; fields: Record<string, string> };

export async function readWebhookSample(flowId: string): Promise<WebhookSample | null> {
  const row = await prisma.chatSettings.findUnique({ where: { id: sampleKey(flowId) } });
  const value = row?.menu as WebhookSample | null | undefined;
  return value && typeof value === "object" && value.fields ? value : null;
}

export async function clearWebhookSample(flowId: string) {
  await prisma.chatSettings.deleteMany({ where: { id: sampleKey(flowId) } });
}

async function storeSample(flowId: string, fields: Record<string, string>) {
  const menu = { receivedAt: new Date().toISOString(), fields } as unknown as Prisma.InputJsonValue;
  await prisma.chatSettings.upsert({ where: { id: sampleKey(flowId) }, create: { id: sampleKey(flowId), menu }, update: { menu } });
}

/** Cria (se pedido) ou atualiza o contato do lead: nome e e-mail só preenchem o que está vazio. */
async function upsertLeadContact(lead: Lead, create: boolean): Promise<{ id: string; created: boolean } | null> {
  const existing = await prisma.contact.findFirst({ where: { phone: { in: phoneVariants(lead.phone) } }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true, phone: true } });
  if (existing) {
    const placeholder = !existing.name.trim() || existing.name.replace(/\D/g, "").length >= 10;
    const data = { ...(lead.name && placeholder ? { name: lead.name } : {}), ...(lead.email && !existing.email ? { email: lead.email } : {}) };
    if (Object.keys(data).length) await prisma.contact.update({ where: { id: existing.id }, data });
    return { id: existing.id, created: false };
  }
  if (!create) return null;
  const sourceKey = `webhook:${lead.phone}`;
  try {
    const contact = await prisma.contact.upsert({
      where: { sourceKey },
      create: { sourceKey, name: lead.name || formatPhone(lead.phone), phone: lead.phone, email: lead.email || null, segment: lead.source || null, category: "lead" },
      update: {},
      select: { id: true },
    });
    return { id: contact.id, created: true };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    const contact = await prisma.contact.findUnique({ where: { sourceKey }, select: { id: true } });
    return contact ? { id: contact.id, created: false } : null;
  }
}

export type WebhookResult = { status: number; body: Record<string, unknown> };

/**
 * Lead recebido na URL do fluxo: guarda a amostra; com o fluxo ativo, cria/atualiza o contato e dispara o
 * gatilho "Webhook recebido" com todos os campos como variáveis. Rascunho/pausado só captura a amostra (teste).
 */
export async function receiveWebhookLead(flow: { id: string; status: string; nodes: unknown; edges: unknown }, payload: unknown): Promise<WebhookResult> {
  const fields = flattenPayload(payload);
  if (!Object.keys(fields).length) return { status: 400, body: { error: "Corpo vazio: envie JSON ou formulário." } };
  await storeSample(flow.id, fields);
  const trigger = triggerNodes(sanitizeGraph({ nodes: flow.nodes, edges: flow.edges })).find((node) => node.type === "trigger_webhook");
  if (!trigger) return { status: 202, body: { ok: true, captured: true, running: false, detail: "Amostra capturada; o fluxo não tem o gatilho Webhook recebido." } };
  if (flow.status !== "active") return { status: 202, body: { ok: true, captured: true, running: false, detail: "Amostra capturada; ative a automação para processar os leads." } };
  const config = trigger.data.config;
  const lead = extractLead(fields, { phone: String(config.phoneField ?? ""), name: String(config.nameField ?? ""), email: String(config.emailField ?? ""), source: String(config.sourceField ?? "") });
  const contactId = typeof (payload as { contactId?: unknown })?.contactId === "string" ? String((payload as { contactId: string }).contactId) : null;
  const contact = contactId
    ? await prisma.contact.findUnique({ where: { id: contactId }, select: { id: true } }).then((row) => (row ? { id: row.id, created: false } : null))
    : lead.phone ? await upsertLeadContact(lead, config.createContact !== false) : null;
  if (!contact) return { status: lead.phone ? 404 : 422, body: { error: lead.phone ? "Contato não encontrado e a criação automática está desligada." : "Telefone não encontrado no corpo: mapeie o campo do telefone no gatilho." } };
  const vars = { ...payloadVars(fields), ...(lead.name ? { nome_lead: lead.name } : {}), ...(lead.email ? { email: lead.email } : {}), ...(lead.source ? { origem: lead.source } : {}), telefone_lead: lead.phone };
  const started = await triggerAutomations({ type: "trigger_webhook" }, { contactId: contact.id, vars }, { onlyFlowId: flow.id });
  return { status: 200, body: { ok: true, contactId: contact.id, contactCreated: contact.created, executions: started.length } };
}
