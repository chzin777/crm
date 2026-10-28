import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/cache";
import { getMessagingInfo, listTemplates, MetaApiError, sendMedia, sendTemplate, sendText, uploadMedia } from "@/lib/meta-whatsapp";

export type DispatchRecipient = { id: string; nome: string; telefone: string; email: string; dataNascimento: string; segmento: string };

type CampaignTemplate = { name: string; language: string; params: string[]; hasImage?: boolean };
type CampaignRecord = {
  id: string;
  nome: string;
  status: string;
  disparos?: number;
  mensagem: string;
  anexos?: { name: string; size: number; type: string; url?: string }[];
  modelo?: CampaignTemplate | null;
  [key: string]: unknown;
};

export type PauseReason = { kind: "payment" | "rate_limit" | "auth" | "account" | "template" | "network" | "consecutive" | "manual" | "media"; code?: number; message: string };

export type DispatchJob = {
  campaignId: string;
  campaignName: string;
  status: "running" | "paused" | "completed" | "cancelled";
  total: number;
  cursor: number;
  sent: number;
  failed: number;
  baseDisparos: number;
  errors: string[];
  pause?: PauseReason;
  startedAt: string;
  finishedAt?: string;
};

const SEND_DELAY_MS = 300;
const RATE_LIMIT_WAITS_MS = [30_000, 60_000, 120_000];
const NETWORK_RETRY_MS = [5_000, 15_000, 30_000];
const MAX_CONSECUTIVE_API_FAILURES = 8;
const MAX_STORED_ERRORS = 20;

const RATE_LIMIT_CODES = new Set([130429, 80007, 4, 17, 32, 613]);
const FATAL_CODES: Record<number, PauseReason["kind"]> = {
  131042: "payment",
  190: "auth",
  102: "auth",
  131031: "account",
  368: "account",
  131048: "account",
  133010: "account",
  131005: "auth",
  132001: "template",
  132015: "template",
  132016: "template",
};

const metaKey = (campaignId: string) => `dispatch:${campaignId}`;
const recipientsKey = (campaignId: string) => `dispatch-recipients:${campaignId}`;

// Estado compartilhado entre rotas (hot reload cria módulos novos em desenvolvimento).
const globalState = globalThis as unknown as {
  __dispatchRunning?: Set<string>;
  __dispatchControl?: Map<string, "pause" | "cancel">;
  __dispatchQueue?: Promise<void>;
  __dispatchCampaignLock?: Promise<void>;
};
const running = (globalState.__dispatchRunning ??= new Set());
const control = (globalState.__dispatchControl ??= new Map());

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const asJson = (value: unknown) => value as Prisma.InputJsonValue;

async function readJob(campaignId: string): Promise<DispatchJob | null> {
  const row = await prisma.crmWorkspaceData.findUnique({ where: { key: metaKey(campaignId) }, select: { value: true } });
  return (row?.value as DispatchJob | undefined) ?? null;
}

async function writeJob(job: DispatchJob) {
  await prisma.crmWorkspaceData.upsert({
    where: { key: metaKey(job.campaignId) },
    create: { key: metaKey(job.campaignId), value: asJson(job) },
    update: { value: asJson(job) },
  });
}

async function readRecipients(campaignId: string): Promise<DispatchRecipient[]> {
  const row = await prisma.crmWorkspaceData.findUnique({ where: { key: recipientsKey(campaignId) }, select: { value: true } });
  return Array.isArray(row?.value) ? (row.value as unknown as DispatchRecipient[]) : [];
}

async function readCampaign(campaignId: string): Promise<CampaignRecord | null> {
  const row = await prisma.crmWorkspaceData.findUnique({ where: { key: "campaigns" }, select: { value: true } });
  const list = Array.isArray(row?.value) ? (row.value as unknown as CampaignRecord[]) : [];
  return list.find((item) => item.id === campaignId) ?? null;
}

// Serializa as gravações da lista de campanhas feitas pelo servidor.
async function patchCampaign(campaignId: string, patch: Partial<CampaignRecord>) {
  const previous = globalState.__dispatchCampaignLock ?? Promise.resolve();
  const task = previous.then(async () => {
    const row = await prisma.crmWorkspaceData.findUnique({ where: { key: "campaigns" }, select: { value: true } });
    if (!Array.isArray(row?.value)) return;
    const list = (row.value as unknown as CampaignRecord[]).map((item) => (item.id === campaignId ? { ...item, ...patch } : item));
    await prisma.crmWorkspaceData.update({ where: { key: "campaigns" }, data: { value: asJson(list) } });
    await invalidateCache("dashboard");
  });
  globalState.__dispatchCampaignLock = task.catch(() => undefined);
  await task;
}

function describePause(error: unknown): PauseReason | null {
  if (!(error instanceof MetaApiError)) return null;
  const code = error.code;
  if (code === undefined) return null;
  const detail = error.message.replace(/^Meta WhatsApp API:\s*/, "");
  if (RATE_LIMIT_CODES.has(code)) {
    return { kind: "rate_limit", code, message: `A Meta limitou a velocidade de envio (erro ${code}). Aguarde alguns minutos e retome o disparo.` };
  }
  const kind = FATAL_CODES[code];
  if (!kind) return null;
  const messages: Record<string, string> = {
    payment: "A conta do WhatsApp Business está sem forma de pagamento válida (erro 131042). Cadastre um cartão no Meta Business e retome o disparo.",
    auth: `O acesso à API do WhatsApp foi recusado (erro ${code}). Revise o token de acesso da integração e retome o disparo.`,
    account: `A conta do WhatsApp está impedida de enviar mensagens (erro ${code}): ${detail}`,
    template: `O modelo da campanha não está disponível para envio (erro ${code}): ${detail}`,
  };
  return { kind, code, message: messages[kind] ?? detail };
}

function campaignStatus(job: DispatchJob) {
  if (job.status === "running") return "Enviando";
  if (job.status === "paused") return "Envio pausado";
  if (job.failed === 0 && job.sent > 0) return "Enviada";
  if (job.sent > 0) return "Envio parcial";
  if (job.status === "cancelled" && job.failed === 0) return "Pronta para envio";
  return "Falha no envio";
}

function campaignNote(job: DispatchJob) {
  const done = job.cursor;
  if (job.status === "running") return `Disparo em andamento (${done} de ${job.total})`;
  if (job.status === "paused") return `Pausado: ${done} de ${job.total} processados · ${job.pause?.message ?? ""}`.trim();
  return `${new Date().toLocaleString("pt-BR")} · ${job.sent} enviados, ${job.failed} falhas`;
}

async function syncCampaign(job: DispatchJob) {
  await patchCampaign(job.campaignId, {
    status: campaignStatus(job),
    disparos: job.baseDisparos + job.sent,
    dataAtualizacao: campaignNote(job),
  });
}

async function resolveHeader(campaign: CampaignRecord) {
  const template = campaign.modelo;
  if (!template?.hasImage) return undefined;
  const attachment = (campaign.anexos ?? []).find((file) => ["image/jpeg", "image/png"].includes(file.type) && file.url);
  if (attachment?.url) {
    const mediaId = await uploadMedia({ mimetype: attachment.type, fileName: attachment.name, url: attachment.url });
    return { mimetype: attachment.type, fileName: attachment.name, mediaId };
  }
  const remote = (await listTemplates()).find((item) => item.name === template.name && item.language === template.language);
  if (!remote?.headerImageUrl) throw new MediaError("Este modelo exige uma imagem e a Meta não retornou a do modelo. Anexe uma imagem (JPG ou PNG) à campanha.");
  const downloaded = await fetch(remote.headerImageUrl);
  if (!downloaded.ok) throw new MediaError("Não foi possível carregar a imagem do modelo. Anexe uma imagem (JPG ou PNG) à campanha.");
  const mimetype = downloaded.headers.get("content-type")?.split(";")[0] || "image/jpeg";
  const base64 = Buffer.from(await downloaded.arrayBuffer()).toString("base64");
  const mediaId = await uploadMedia({ mimetype, fileName: "header", base64 });
  return { mimetype, fileName: "header", mediaId };
}

class MediaError extends Error {}

async function sendToRecipient(
  campaign: CampaignRecord,
  recipient: DispatchRecipient,
  header: Awaited<ReturnType<typeof resolveHeader>>,
) {
  const values: Record<string, string> = {
    nome: recipient.nome,
    email: recipient.email,
    telefone: recipient.telefone,
    segmento: recipient.segmento,
    data_nascimento: recipient.dataNascimento,
  };
  if (campaign.modelo) {
    const params = campaign.modelo.params.map((field) => values[field] || "-");
    await sendTemplate(recipient.telefone, campaign.modelo.name, campaign.modelo.language, params, header);
    return;
  }
  const text = campaign.mensagem.replace(/\{\{(nome|email|telefone|segmento|data_nascimento)\}\}/g, (_match, key: string) => values[key] ?? "");
  const media = (campaign.anexos ?? []).filter((file) => file.url);
  if (media.length === 0) {
    await sendText(recipient.telefone, text);
    return;
  }
  for (const [index, file] of media.entries()) {
    await sendMedia(recipient.telefone, { mimetype: file.type, fileName: file.name, url: file.url }, index === 0 ? text : undefined);
  }
}

function addError(job: DispatchJob, message: string) {
  if (job.errors.length < MAX_STORED_ERRORS) job.errors.push(message);
}

async function runJob(campaignId: string) {
  let job = await readJob(campaignId);
  if (!job || job.status !== "running") return;
  try {
    const campaign = await readCampaign(campaignId);
    if (!campaign) throw new Error("Campanha não encontrada.");
    const recipients = await readRecipients(campaignId);
    let header: Awaited<ReturnType<typeof resolveHeader>>;
    try {
      header = await resolveHeader(campaign);
    } catch (error) {
      const pause = describePause(error) ?? { kind: "media" as const, message: error instanceof Error ? error.message : "Não foi possível preparar a imagem do modelo." };
      job = { ...job, status: "paused", pause };
      await writeJob(job);
      await syncCampaign(job);
      return;
    }

    let consecutiveApiFailures = 0;
    while (job.cursor < job.total) {
      const requested = control.get(campaignId);
      if (requested) {
        control.delete(campaignId);
        job = requested === "pause"
          ? { ...job, status: "paused", pause: { kind: "manual", message: "Disparo pausado manualmente." } }
          : { ...job, status: "cancelled", finishedAt: new Date().toISOString() };
        await writeJob(job);
        await syncCampaign(job);
        return;
      }

      const recipient = recipients[job.cursor];
      let pause: PauseReason | null = null;
      if (!recipient?.telefone?.trim()) {
        job.failed += 1;
        addError(job, `${recipient?.nome ?? "Contato"}: telefone não cadastrado.`);
      } else {
        let attempt = 0;
        for (;;) {
          try {
            await sendToRecipient(campaign, recipient, header);
            job.sent += 1;
            consecutiveApiFailures = 0;
            break;
          } catch (error) {
            const fatal = describePause(error);
            if (fatal?.kind === "rate_limit" && attempt < RATE_LIMIT_WAITS_MS.length) {
              await sleep(RATE_LIMIT_WAITS_MS[attempt++]);
              continue;
            }
            if (fatal) {
              pause = fatal;
              break;
            }
            if (!(error instanceof MetaApiError) && attempt < NETWORK_RETRY_MS.length) {
              await sleep(NETWORK_RETRY_MS[attempt++]);
              continue;
            }
            if (!(error instanceof MetaApiError)) {
              pause = { kind: "network", message: "Não foi possível conectar à Meta. Verifique a conexão do servidor e retome o disparo." };
              break;
            }
            job.failed += 1;
            consecutiveApiFailures += 1;
            addError(job, `${recipient.nome}: ${error.message.replace(/^Meta WhatsApp API:\s*/, "")}`);
            if (consecutiveApiFailures >= MAX_CONSECUTIVE_API_FAILURES) {
              pause = { kind: "consecutive", code: error.code, message: `${MAX_CONSECUTIVE_API_FAILURES} envios seguidos falharam. Último erro: ${error.message.replace(/^Meta WhatsApp API:\s*/, "")}` };
            }
            break;
          }
        }
      }

      if (pause) {
        // O contato que causou a pausa não foi processado: será tentado de novo na retomada.
        if (pause.kind !== "consecutive") {
          job = { ...job, status: "paused", pause };
        } else {
          job = { ...job, cursor: job.cursor + 1, status: "paused", pause };
        }
        await writeJob(job);
        await syncCampaign(job);
        return;
      }

      job.cursor += 1;
      await writeJob(job);
      if (job.cursor < job.total) await sleep(SEND_DELAY_MS);
    }

    job = { ...job, status: "completed", finishedAt: new Date().toISOString(), pause: undefined };
    await writeJob(job);
    await syncCampaign(job);
  } catch (error) {
    console.error("[campaign-dispatch] falha inesperada:", error);
    const current = (await readJob(campaignId)) ?? job;
    const paused: DispatchJob = { ...current, status: "paused", pause: { kind: "network", message: error instanceof Error ? error.message : "Erro inesperado no disparo." } };
    await writeJob(paused).catch(() => undefined);
    await syncCampaign(paused).catch(() => undefined);
  }
}

function enqueue(campaignId: string) {
  if (running.has(campaignId)) return;
  running.add(campaignId);
  const queue = globalState.__dispatchQueue ?? Promise.resolve();
  globalState.__dispatchQueue = queue
    .then(() => runJob(campaignId))
    .catch((error) => console.error("[campaign-dispatch] fila:", error))
    .finally(() => running.delete(campaignId));
}

export async function startDispatch(campaignId: string, recipients: DispatchRecipient[]) {
  const existing = await readJob(campaignId);
  if (existing && (existing.status === "running" || existing.status === "paused")) {
    throw new DispatchError("Esta campanha já tem um disparo em andamento ou pausado.", 409);
  }
  const campaign = await readCampaign(campaignId);
  if (!campaign) throw new DispatchError("Campanha não encontrada.", 404);
  if (["Enviando", "Enviada", "Envio parcial", "Envio pausado"].includes(campaign.status)) {
    throw new DispatchError(`"${campaign.nome}" está em envio ou já teve mensagens enviadas. Não é possível dispará-la novamente para evitar duplicidades.`, 409);
  }
  if (recipients.length === 0) throw new DispatchError(`O público de "${campaign.nome}" não contém contatos para envio.`, 400);

  const messaging = await getMessagingInfo().catch(() => null);
  if (messaging?.canSendMessage === "BLOCKED") {
    const reason = messaging.blockers[0];
    throw new DispatchError(
      reason ? `O WhatsApp Business está bloqueado para envio: ${reason.description} ${reason.solution}`.trim() : "O WhatsApp Business está bloqueado para envio. Verifique a conta no Meta Business.",
      409,
    );
  }

  const job: DispatchJob = {
    campaignId,
    campaignName: campaign.nome,
    status: "running",
    total: recipients.length,
    cursor: 0,
    sent: 0,
    failed: 0,
    baseDisparos: campaign.disparos ?? 0,
    errors: [],
    startedAt: new Date().toISOString(),
  };
  await prisma.crmWorkspaceData.upsert({
    where: { key: recipientsKey(campaignId) },
    create: { key: recipientsKey(campaignId), value: asJson(recipients) },
    update: { value: asJson(recipients) },
  });
  await writeJob(job);
  await syncCampaign(job);
  enqueue(campaignId);
  return job;
}

export async function resumeDispatch(campaignId: string) {
  const job = await readJob(campaignId);
  if (!job || job.status !== "paused") throw new DispatchError("Não há disparo pausado para esta campanha.", 409);
  const next: DispatchJob = { ...job, status: "running", pause: undefined };
  await writeJob(next);
  await syncCampaign(next);
  enqueue(campaignId);
  return next;
}

export async function stopDispatch(campaignId: string, action: "pause" | "cancel") {
  const job = await readJob(campaignId);
  if (!job || (job.status !== "running" && job.status !== "paused")) throw new DispatchError("Não há disparo ativo para esta campanha.", 409);
  if (job.status === "paused") {
    if (action === "pause") return job;
    const cancelled: DispatchJob = { ...job, status: "cancelled", finishedAt: new Date().toISOString() };
    await writeJob(cancelled);
    await syncCampaign(cancelled);
    return cancelled;
  }
  control.set(campaignId, action);
  // Disparo órfão (servidor reiniciado): ninguém vai ler o sinal, então aplica na hora.
  if (!running.has(campaignId)) {
    control.delete(campaignId);
    const next: DispatchJob = action === "pause"
      ? { ...job, status: "paused", pause: { kind: "manual", message: "Disparo pausado manualmente." } }
      : { ...job, status: "cancelled", finishedAt: new Date().toISOString() };
    await writeJob(next);
    await syncCampaign(next);
    return next;
  }
  return job;
}

// Lista os disparos e retoma os que ficaram "em andamento" após reinício do servidor.
export async function listDispatchJobs(): Promise<DispatchJob[]> {
  const rows = await prisma.crmWorkspaceData.findMany({ where: { key: { startsWith: "dispatch:" } }, select: { value: true } });
  const jobs = rows.map((row) => row.value as unknown as DispatchJob);
  for (const job of jobs) {
    if (job.status === "running" && !running.has(job.campaignId)) enqueue(job.campaignId);
  }
  return jobs;
}

export class DispatchError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}
