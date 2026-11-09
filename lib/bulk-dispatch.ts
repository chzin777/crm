import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { listTemplates, MetaApiError, sendMedia, sendTemplate, sendText, uploadMedia } from "@/lib/meta-whatsapp";
import { readFile } from "@/lib/minio";

export type BulkParamSource = "primeiro_nome" | "nome" | "telefone" | "manual";
export type BulkTemplateParam = { source: BulkParamSource; value: string };
export type BulkItemStatus = "PENDING" | "SENDING" | "SENT" | "FAILED" | "CANCELLED";
export type BulkItem = { contactId: string; nome: string; telefone: string; status: BulkItemStatus; error?: string };
export type BulkAttachment = { key: string; fileName: string; mimetype: string };
export type BulkJobStatus = "running" | "paused" | "completed" | "cancelled";

export type BulkJob = {
  id: string;
  userId: string;
  userName?: string;
  stageName: string;
  status: BulkJobStatus;
  total: number;
  sent: number;
  failed: number;
  items: BulkItem[];
  text: string;
  template: { name: string; language: string; params: BulkTemplateParam[]; category?: string } | null;
  attachments: BulkAttachment[];
  retryOf?: string;
  createdAt: string;
  finishedAt?: string;
};

/** Id usado em CampaignMessage para os envios de um lote (o webhook da Meta atualiza o status por ele). */
export const bulkCampaignId = (jobId: string) => `bulk:${jobId}`;

/** Visão enviada ao navegador: sem texto completo, parâmetros nem anexos. */
export type BulkJobView = {
  id: string;
  userId: string;
  userName: string;
  stageName: string;
  templateName: string | null;
  templateCategory: string | null;
  status: BulkJobStatus;
  total: number;
  sent: number;
  failed: number;
  pending: number;
  retryOf?: string;
  createdAt: string;
  finishedAt?: string;
  items?: BulkItem[];
};

// Cadência entre envios: base configurável + variação aleatória para não formar um padrão fixo.
const MIN_DELAY_MS = Number(process.env.BULK_SEND_MIN_DELAY_MS) || 1_000;
const MAX_DELAY_MS = Math.max(MIN_DELAY_MS, Number(process.env.BULK_SEND_MAX_DELAY_MS) || 3_000);
// 130429 e afins: espera crescente (5s, 10s, 20s, 40s, 80s) antes de tentar de novo.
const RATE_LIMIT_CODES = new Set([130429, 131056, 80007, 4]);
const RATE_LIMIT_BASE_MS = 5_000;
const RATE_LIMIT_MAX_RETRIES = 5;
// O indicador flutuante só mostra lotes concluídos nas últimas 24h; o histórico completo fica em /disparos.
const RECENT_MS = 24 * 60 * 60 * 1000;

const jobKey = (id: string) => `bulk-job:${id}`;
const asJson = (value: unknown) => value as Prisma.InputJsonValue;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const jitterDelay = () => MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1));

// Estado compartilhado entre rotas (hot reload cria módulos novos em desenvolvimento).
const globalState = globalThis as unknown as {
  __bulkRunning?: Set<string>;
  __bulkQueue?: Promise<void>;
  __bulkControl?: Map<string, "pause" | "cancel">;
};
const running = (globalState.__bulkRunning ??= new Set());
const control = (globalState.__bulkControl ??= new Map());

export class BulkDispatchError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export function toView(job: BulkJob, withItems = false): BulkJobView {
  const pending = job.items.filter((item) => item.status === "PENDING" || item.status === "SENDING").length;
  return {
    id: job.id,
    userId: job.userId,
    userName: job.userName ?? "",
    stageName: job.stageName,
    templateName: job.template?.name ?? null,
    templateCategory: job.template?.category ?? null,
    status: job.status,
    total: job.total,
    sent: job.sent,
    failed: job.failed,
    pending,
    retryOf: job.retryOf,
    createdAt: job.createdAt,
    finishedAt: job.finishedAt,
    ...(withItems ? { items: job.items } : {}),
  };
}

async function readJob(id: string): Promise<BulkJob | null> {
  const row = await prisma.crmWorkspaceData.findUnique({ where: { key: jobKey(id) }, select: { value: true } });
  return (row?.value as BulkJob | undefined) ?? null;
}

async function writeJob(job: BulkJob) {
  await prisma.crmWorkspaceData.upsert({
    where: { key: jobKey(job.id) },
    create: { key: jobKey(job.id), value: asJson(job) },
    update: { value: asJson(job) },
  });
}

function resolveParam(param: BulkTemplateParam, item: BulkItem) {
  if (param.source === "primeiro_nome") return item.nome.trim().split(/\s+/)[0] || "-";
  if (param.source === "nome") return item.nome.trim() || "-";
  if (param.source === "telefone") return item.telefone;
  return param.value.trim() || "-";
}

/** Traduz o erro da Meta (ou de rede) num motivo claro para a lista de falhas. */
export function friendlyError(error: unknown) {
  if (error instanceof MetaApiError) {
    const code = error.code;
    if (code === 190) return "Token da Meta inválido ou expirado.";
    if (code === 131026 || code === 131030 || (code === 100 && /phone|recipient/i.test(error.message))) return "Telefone inválido ou sem WhatsApp.";
    if (code === 132000 || code === 132001 || code === 132005 || code === 132007 || code === 132012) return `Modelo incompatível: ${error.message.replace(/^Meta WhatsApp API: /, "")}`;
    if (code === 131047) return "Fora da janela de 24h: use um modelo aprovado.";
    if (code !== undefined && RATE_LIMIT_CODES.has(code)) return "Limite de envios da Meta atingido mesmo após novas tentativas.";
    if (code === 131058) return "O modelo hello_world só funciona com números de teste da Meta.";
    return error.message.replace(/^Meta WhatsApp API: /, "");
  }
  return error instanceof Error ? error.message : "Erro desconhecido";
}

async function resolveTemplateHeader(name: string, language: string) {
  const template = (await listTemplates()).find((item) => item.name === name && item.language === language);
  if (template?.headerFormat !== "IMAGE") return undefined;
  if (!template.headerImageUrl) throw new Error("Este modelo exige uma imagem e a Meta não retornou a do modelo.");
  const downloaded = await fetch(template.headerImageUrl);
  if (!downloaded.ok) throw new Error("Não foi possível carregar a imagem do modelo.");
  const mimetype = downloaded.headers.get("content-type")?.split(";")[0] || "image/jpeg";
  const base64 = Buffer.from(await downloaded.arrayBuffer()).toString("base64");
  // Sobe a imagem uma vez e reaproveita o id em todos os envios do lote.
  const mediaId = await uploadMedia({ mimetype, fileName: "header", base64 });
  return { mimetype, fileName: "header", mediaId };
}

type Prepared = {
  header?: Awaited<ReturnType<typeof resolveTemplateHeader>>;
  files: { mimetype: string; fileName: string; base64: string }[];
};

/** Envia e devolve o id da mensagem na Meta (o da primeira, quando há vários anexos). */
async function sendOne(job: BulkJob, item: BulkItem, prepared: Prepared): Promise<string | null> {
  if (job.template) {
    const params = job.template.params.map((param) => resolveParam(param, item));
    const sent = await sendTemplate(item.telefone, job.template.name, job.template.language, params, prepared.header);
    return sent.messages?.[0]?.id ?? null;
  }
  const text = job.text
    .replace(/\{\{nome\}\}/gi, item.nome)
    .replace(/\{\{etapa\}\}/gi, job.stageName)
    .replace(/\{\{telefone\}\}/gi, item.telefone)
    .trim();
  if (prepared.files.length === 0) {
    const sent = await sendText(item.telefone, text);
    return sent.messages?.[0]?.id ?? null;
  }
  let firstId: string | null = null;
  for (const [index, file] of prepared.files.entries()) {
    const sent = await sendMedia(item.telefone, file, index === 0 && text ? text : undefined);
    firstId ??= sent.messages?.[0]?.id ?? null;
  }
  return firstId;
}

/** Registra o envio para o funil (entregue, lida, respondeu) e a conversão em vendas. */
async function recordMessage(job: BulkJob, item: BulkItem, result: { messageId: string | null } | { failure: string }) {
  try {
    await prisma.campaignMessage.create({
      data: {
        campaignId: bulkCampaignId(job.id),
        contactId: item.contactId,
        phone: item.telefone,
        ...("failure" in result
          ? { status: "failed" as const, failedAt: new Date(), failureReason: result.failure.slice(0, 500) }
          : { status: "sent" as const, whatsappMsgId: result.messageId, sentAt: new Date() }),
      },
    });
  } catch (error) {
    console.error("[bulk-dispatch] registrar mensagem:", error);
  }
}

/** Envia com retry e espera crescente quando a Meta acusa limite de envio. */
async function sendWithBackoff(job: BulkJob, item: BulkItem, prepared: Prepared) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await sendOne(job, item, prepared);
    } catch (error) {
      const limited = error instanceof MetaApiError && error.code !== undefined && RATE_LIMIT_CODES.has(error.code);
      if (!limited || attempt >= RATE_LIMIT_MAX_RETRIES) throw error;
      const wait = RATE_LIMIT_BASE_MS * 2 ** attempt + Math.floor(Math.random() * 1_000);
      console.warn(`[bulk-dispatch] limite da Meta no lote ${job.id}, nova tentativa em ${Math.round(wait / 1000)}s (${attempt + 1}/${RATE_LIMIT_MAX_RETRIES})`);
      await sleep(wait);
    }
  }
}

/** Marca o que ainda não saiu como cancelado e encerra o lote. */
function applyCancel(job: BulkJob) {
  for (const item of job.items) {
    if (item.status === "PENDING") {
      item.status = "CANCELLED";
      item.error = "Cancelado antes do envio.";
    }
  }
  job.status = "cancelled";
  job.finishedAt = new Date().toISOString();
}

async function finish(job: BulkJob) {
  job.status = "completed";
  job.finishedAt = new Date().toISOString();
  await writeJob(job);
}

async function runJob(id: string) {
  const job = await readJob(id);
  if (!job || job.status !== "running") return;

  // Item que ficou "enviando" quando o servidor reiniciou: não se sabe se chegou, então não reenvia.
  for (const item of job.items) {
    if (item.status === "SENDING") {
      item.status = "FAILED";
      item.error = "Envio interrompido por reinício do servidor; confira no chat antes de reenviar.";
      job.failed += 1;
    }
  }

  const prepared: Prepared = { files: [] };
  try {
    if (job.template) {
      prepared.header = await resolveTemplateHeader(job.template.name, job.template.language);
    } else {
      prepared.files = await Promise.all(job.attachments.map(async (file) => ({
        mimetype: file.mimetype,
        fileName: file.fileName,
        base64: (await readFile(file.key)).toString("base64"),
      })));
    }
  } catch (error) {
    // Sem a imagem do modelo ou os anexos, nenhum envio daria certo: encerra o lote com o motivo.
    const reason = friendlyError(error);
    console.error(`[bulk-dispatch] falha ao preparar o lote ${id}:`, error);
    for (const item of job.items) {
      if (item.status === "PENDING") {
        item.status = "FAILED";
        item.error = reason;
        job.failed += 1;
      }
    }
    await finish(job);
    return;
  }

  let first = true;
  for (const item of job.items) {
    if (item.status !== "PENDING") continue;

    const requested = control.get(id);
    if (requested) {
      control.delete(id);
      if (requested === "pause") job.status = "paused";
      else applyCancel(job);
      await writeJob(job);
      return;
    }

    if (item.telefone.replace(/\D/g, "").length < 10) {
      item.status = "FAILED";
      item.error = "Telefone inválido";
      job.failed += 1;
      await writeJob(job);
      continue;
    }
    if (!first) await sleep(jitterDelay());
    first = false;

    item.status = "SENDING";
    await writeJob(job);
    try {
      const messageId = await sendWithBackoff(job, item, prepared);
      item.status = "SENT";
      job.sent += 1;
      await recordMessage(job, item, { messageId });
    } catch (error) {
      console.error(`[bulk-dispatch] falha para ${item.contactId} (${item.telefone}):`, error instanceof MetaApiError ? JSON.stringify(error.details) : error);
      item.status = "FAILED";
      item.error = friendlyError(error);
      job.failed += 1;
      await recordMessage(job, item, { failure: item.error });
    }
    await writeJob(job);
  }

  control.delete(id);
  await finish(job);
}

/** Um lote por vez, em sequência: nunca dispara lotes em paralelo. */
function enqueue(id: string) {
  if (running.has(id)) return;
  running.add(id);
  const previous = globalState.__bulkQueue ?? Promise.resolve();
  globalState.__bulkQueue = previous
    .then(() => runJob(id))
    .catch((error) => console.error(`[bulk-dispatch] lote ${id} interrompido:`, error))
    .finally(() => running.delete(id));
}

async function userName(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
  return user?.name || user?.email || "";
}

export async function startBulkJob(input: {
  userId: string;
  stageName: string;
  contacts: { id: string; name: string; phone: string | null }[];
  text: string;
  template: BulkJob["template"];
  attachments: BulkAttachment[];
  retryOf?: string;
}) {
  const job: BulkJob = {
    id: randomUUID(),
    userId: input.userId,
    userName: await userName(input.userId),
    stageName: input.stageName,
    status: "running",
    total: input.contacts.length,
    sent: 0,
    failed: 0,
    items: input.contacts.map((contact) => ({ contactId: contact.id, nome: contact.name, telefone: contact.phone ?? "", status: "PENDING" })),
    text: input.text,
    template: input.template,
    attachments: input.attachments,
    retryOf: input.retryOf,
    createdAt: new Date().toISOString(),
  };
  await writeJob(job);
  enqueue(job.id);
  return job;
}

/** Lote visível para o usuário: o próprio, ou qualquer um quando administrador. */
export async function getBulkJob(id: string, userId: string, isAdmin = false) {
  const job = await readJob(id);
  return job && (isAdmin || job.userId === userId) ? job : null;
}

/**
 * Lotes do usuário (ou de todos, para administradores). `recent` limita aos ativos e
 * aos concluídos nas últimas 24h. Também retoma lotes que pararam com o servidor.
 */
export async function listBulkJobs(options: { userId: string; all?: boolean; filterUserId?: string; recent?: boolean }): Promise<BulkJob[]> {
  const rows = await prisma.crmWorkspaceData.findMany({ where: { key: { startsWith: "bulk-job:" } }, select: { value: true } });
  const now = Date.now();
  const jobs: BulkJob[] = [];
  for (const row of rows) {
    const job = row.value as unknown as BulkJob;
    if (job.status === "running" && !running.has(job.id)) enqueue(job.id);
    const owner = options.all ? (options.filterUserId ? job.userId === options.filterUserId : true) : job.userId === options.userId;
    if (!owner) continue;
    if (options.recent && job.finishedAt && now - Date.parse(job.finishedAt) > RECENT_MS) continue;
    jobs.push(job);
  }
  return jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function controlBulkJob(job: BulkJob, action: "pause" | "resume" | "cancel") {
  if (action === "resume") {
    if (job.status !== "paused") throw new BulkDispatchError("Só é possível retomar um lote pausado.", 409);
    job.status = "running";
    await writeJob(job);
    enqueue(job.id);
    return job;
  }
  if (job.status === "paused") {
    if (action === "pause") return job;
    applyCancel(job);
    await writeJob(job);
    return job;
  }
  if (job.status !== "running") throw new BulkDispatchError("Este lote já terminou.", 409);
  // Lote na fila de execução: o laço aplica o pedido antes do próximo contato.
  if (running.has(job.id)) {
    control.set(job.id, action);
    return job;
  }
  // Lote órfão (servidor reiniciado e ainda não retomado): aplica na hora.
  if (action === "pause") job.status = "paused";
  else applyCancel(job);
  await writeJob(job);
  return job;
}

/** Novo lote só com os contatos que falharam, mesma mensagem ou modelo. */
export async function retryFailures(job: BulkJob, userId: string) {
  if (job.status === "running" || job.status === "paused") throw new BulkDispatchError("Aguarde o lote terminar para reenviar as falhas.", 409);
  const failed = job.items.filter((item) => item.status === "FAILED");
  if (failed.length === 0) throw new BulkDispatchError("Este lote não tem falhas para reenviar.", 400);
  return startBulkJob({
    userId,
    stageName: job.stageName,
    contacts: failed.map((item) => ({ id: item.contactId, name: item.nome, phone: item.telefone })),
    text: job.text,
    template: job.template,
    attachments: job.attachments,
    retryOf: job.id,
  });
}
