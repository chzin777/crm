import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/cache";
import { findTemplate, getMessagingInfo, InvalidPhoneError, listTemplates, MetaApiError, MetaNetworkError, sendMedia, sendTemplate, sendText, uploadMedia } from "@/lib/meta-whatsapp";
import { phoneVariants } from "@/lib/chat/phone";
import { assignedAttendantValues } from "@/lib/attendant-db";
import { hasAttendantToken, isAttendantField } from "@/lib/attendant-variables";
import { brDay, formatBr } from "@/lib/br-time";
import { firstDispatch } from "@/lib/chat/conversation";
import { AUTO_REPLY_AUTHOR } from "@/lib/chat/auto-reply";
import { coldContactIds, INVALID_NUMBER_CODES, markInvalidWhatsApp } from "@/lib/engagement";
import { chatPhone, recordDispatchInChat, renderTemplateText } from "@/lib/chat/dispatch-history";
import { downloadMedia, storeDispatchMedia } from "@/lib/chat/dispatch-media";
import { withoutOptedOut } from "@/lib/marketing-opt-out";
import { dedupeRecipients } from "@/lib/campaign-audience";
import { loadOptOutKeys } from "@/lib/marketing-opt-out-db";
import { reportError } from "@/lib/monitoring/error-reporter";
import { firstName, resolveParam, summarizeAudience } from "@/lib/campaign-wizard";
import { cadenceWaitMs, insideWindow, nextWindowStart, normalizeCadence, normalizeFollowUp, normalizeWindow } from "@/lib/campaign-schedule";

/** `origens`: segmentos da campanha em que o contato aparece (métrica; o envio continua sendo um só). */
export type DispatchRecipient = { id: string; nome: string; telefone: string; email: string; dataNascimento: string; segmento: string; origens?: string[] };

type CampaignTemplate = { name: string; language: string; params: string[]; hasImage?: boolean; buttons?: { type: string; text: string }[] };
type CampaignRecord = {
  id: string;
  nome: string;
  status: string;
  disparos?: number;
  mensagem: string;
  anexos?: { name: string; size: number; type: string; url?: string }[];
  modelo?: CampaignTemplate | null;
  metaTemplateDraft?: { buttons?: { type: string; text: string }[] };
  metaTemplateId?: string;
  metaApprovalStatus?: string;
  metaApprovalReason?: string;
  [key: string]: unknown;
};

/** `schedule`: fora da janela de horário da campanha; o relógio retoma sozinho em `resumeAt`. */
export type PauseReason = { kind: "payment" | "rate_limit" | "auth" | "account" | "template" | "network" | "consecutive" | "manual" | "media" | "schedule" | "restart"; code?: number; message: string; resumeAt?: string; /** Resposta técnica real (HTTP, código e mensagem da Meta ou erro de rede). */ detail?: string };

export type DispatchJob = {
  campaignId: string;
  campaignName: string;
  status: "running" | "paused" | "completed" | "cancelled";
  total: number;
  cursor: number;
  sent: number;
  failed: number;
  skipped: number;
  baseDisparos: number;
  /** Envia mesmo para quem recebeu campanha dentro da janela de descanso. */
  ignoreCooldown?: boolean;
  /** Repetidos (mesmo contato ou mesmo celular em mais de um segmento) retirados da fila antes do envio. */
  duplicatesRemoved?: number;
  /** Leads frios (sem leitura nas últimas X campanhas) retirados antes do envio. */
  coldRemoved?: number;
  errors: string[];
  pause?: PauseReason;
  /** Posições de contatos que não saíram por falha de conexão/instabilidade da Meta: nova tentativa no fim do disparo. */
  retryQueue?: number[];
  /** Interrompido pelo desligamento do servidor (deploy/reinício): a próxima instância retoma sozinha. */
  autoResumeOnBoot?: boolean;
  /** Última retomada automática depois de atualização/reinício do servidor (histórico na tela da campanha). */
  autoResumedAt?: string;
  /** Disparo agendado: fica pausado (kind "schedule") até esta hora e o relógio do chat inicia sozinho. */
  scheduledAt?: string;
  startedAt: string;
  finishedAt?: string;
};

/**
 * Ritmo e novas tentativas do disparo (os testes zeram as esperas). Rede caída e instabilidade da Meta (5xx, 131000,
 * código 2): 4 novas tentativas em 2 s, 5 s, 15 s e 30 s. Limite de velocidade (429, 130429, 80007): espera mais longa.
 * Ainda falhando, o contato vai para o fim da fila e o disparo segue; só pausa com 10 falhas de infraestrutura seguidas.
 */
export const DISPATCH_TIMING = {
  sendDelayMs: 300,
  transientRetryMs: [2_000, 5_000, 15_000, 30_000],
  rateLimitWaitsMs: [30_000, 60_000, 120_000],
};
export const MAX_CONSECUTIVE_INFRA_FAILURES = 10;
const MAX_CONSECUTIVE_API_FAILURES = 10;
const TRANSIENT_HTTP = new Set([500, 502, 503, 504]);
const TRANSIENT_CODES = new Set([131000, 2]);
const NETWORK_ERROR = /ECONNRESET|ETIMEDOUT|TIMEOUT|UND_ERR|fetch failed|socket hang up|EPIPE|EAI_AGAIN|ENOTFOUND|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH/i;
const MAX_STORED_ERRORS = 20;
// Descanso entre campanhas por contato. CAMPAIGN_COOLDOWN_DAYS=0 desliga a trava para todos os disparos.
const parsedCooldownDays = Number(process.env.CAMPAIGN_COOLDOWN_DAYS);
export const CONTACT_COOLDOWN_DAYS = Number.isFinite(parsedCooldownDays) && parsedCooldownDays >= 0 ? parsedCooldownDays : 7;
const CONTACT_COOLDOWN_MS = CONTACT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

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
  __dispatchShutdown?: boolean;
};
const running = (globalState.__dispatchRunning ??= new Set());
const control = (globalState.__dispatchControl ??= new Map());

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
/** SIGTERM do deploy recebido: nenhum contato novo é puxado e nenhum disparo é retomado por esta instância. */
const shuttingDown = () => globalState.__dispatchShutdown === true;
export const RESTART_PAUSE_MESSAGE = "Disparo interrompido pela atualização do servidor. Retoma sozinho em instantes, de onde parou.";
export const AUTO_RESUME_NOTE = "Disparo retomado automaticamente após atualização do servidor";
const pausedForRestart = (job: DispatchJob): DispatchJob => ({ ...job, status: "paused", pause: { kind: "restart", message: RESTART_PAUSE_MESSAGE }, autoResumeOnBoot: true });
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
    auth: `O acesso à API do WhatsApp foi recusado (erro ${code}): ${detail}. Revise o token de acesso da integração e retome o disparo.`,
    account: `A conta do WhatsApp está impedida de enviar mensagens (erro ${code}): ${detail}`,
    template: `O modelo da campanha não está disponível para envio (erro ${code}): ${detail}`,
  };
  return { kind, code, message: messages[kind] ?? detail, detail: technicalDetail(error) };
}

/** O erro como ele veio (HTTP, código/subcódigo e mensagem da Meta, ou o código do erro de rede), para o operador. */
export function technicalDetail(error: unknown): string {
  if (error instanceof MetaApiError) {
    const sub = (error.details as { error_subcode?: number } | undefined)?.error_subcode;
    return `HTTP ${error.httpStatus ?? "?"} · código Meta ${error.code ?? "?"}${sub ? `/${sub}` : ""}: ${error.message.replace(/^Meta WhatsApp API:\s*/, "")}`;
  }
  if (error instanceof MetaNetworkError) return `rede (${error.cause}): ${error.message}`;
  if (error instanceof Error) {
    const cause = (error.cause as { code?: string } | undefined)?.code;
    return `${error.name}${cause ? ` (${cause})` : ""}: ${error.message}`;
  }
  return String(error);
}

export type SendFailure =
  | { type: "fatal"; pause: PauseReason }
  | { type: "rate_limit" | "transient"; code?: number; detail: string }
  /** Só deste contato (número inválido, recusa da Meta para ele): conta como falha e o disparo segue. */
  | { type: "recipient"; code?: number; detail: string; api: boolean };

/** Decide o que fazer com a falha de um envio: pausar (token, pagamento, conta), esperar e repetir, ou seguir. */
export function classifySendError(error: unknown): SendFailure {
  const detail = technicalDetail(error);
  if (error instanceof MetaApiError) {
    const code = error.code;
    if ((code !== undefined && RATE_LIMIT_CODES.has(code)) || error.httpStatus === 429) return { type: "rate_limit", code, detail };
    const fatal = describePause(error);
    if (fatal) return { type: "fatal", pause: fatal };
    if ((error.httpStatus !== undefined && TRANSIENT_HTTP.has(error.httpStatus)) || (code !== undefined && TRANSIENT_CODES.has(code))) return { type: "transient", code, detail };
    return { type: "recipient", code, detail, api: true };
  }
  if (error instanceof MetaNetworkError) return { type: "transient", detail };
  if (error instanceof InvalidPhoneError) return { type: "recipient", detail: error.message, api: false };
  if (error instanceof Error && NETWORK_ERROR.test(`${error.name} ${error.message} ${(error.cause as { code?: string } | undefined)?.code ?? ""}`)) return { type: "transient", detail };
  return { type: "recipient", detail, api: false };
}

/** Agendada e ainda esperando a hora (nenhum contato processado). */
export const isScheduledWait = (job: Pick<DispatchJob, "status" | "pause" | "scheduledAt" | "cursor">) =>
  job.status === "paused" && job.pause?.kind === "schedule" && Boolean(job.scheduledAt) && job.cursor === 0;

function campaignStatus(job: DispatchJob) {
  if (job.status === "running") return "Enviando";
  if (isScheduledWait(job)) return "Agendada";
  if (job.status === "paused") return "Envio pausado";
  if (job.failed === 0 && job.sent > 0) return "Enviada";
  if (job.sent > 0) return "Envio parcial";
  if ((job.status === "cancelled" || job.skipped > 0) && job.failed === 0) return "Pronta para envio";
  return "Falha no envio";
}

function campaignNote(job: DispatchJob) {
  const done = job.cursor;
  if (job.status === "running") return `Disparo em andamento (${done} de ${job.total})`;
  if (isScheduledWait(job)) return `Agendada para ${formatBr(job.scheduledAt)} · ${job.total} contatos`;
  if (job.status === "paused") return `Pausado: ${done} de ${job.total} processados · ${job.pause?.message ?? ""}`.trim();
  const skipped = job.skipped > 0 ? `, ${job.skipped} pulados (campanha nos últimos ${CONTACT_COOLDOWN_DAYS} dias)` : "";
  return `${formatBr(new Date(), { dateStyle: "short", timeStyle: "medium" })} · ${job.sent} enviados, ${job.failed} falhas${skipped}`;
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
    const downloaded = await downloadMedia(attachment.url);
    if (!downloaded) throw new MediaError(`Não foi possível baixar a imagem anexada à campanha (${attachment.name}). Confira se o arquivo ainda existe ou anexe de novo.`);
    // Sobe a imagem uma vez para a Meta e reaproveita o id em todos os envios; a mesma imagem vai para o /chat.
    const mediaId = await uploadMedia({ mimetype: attachment.type, fileName: attachment.name, base64: downloaded.buffer.toString("base64") });
    const chatAttachment = await storeDispatchMedia(downloaded.buffer, attachment.type, attachment.name);
    return { mimetype: attachment.type, fileName: attachment.name, mediaId, chatAttachment };
  }
  const remote = (await listTemplates()).find((item) => item.name === template.name && item.language === template.language);
  if (!remote?.headerImageUrl) throw new MediaError("Este modelo exige uma imagem e a Meta não retornou a do modelo. Anexe uma imagem (JPG ou PNG) à campanha.");
  const downloaded = await downloadMedia(remote.headerImageUrl);
  if (!downloaded) throw new MediaError("Não foi possível carregar a imagem do modelo. Anexe uma imagem (JPG ou PNG) à campanha.");
  const mediaId = await uploadMedia({ mimetype: downloaded.mime, fileName: "header", base64: downloaded.buffer.toString("base64") });
  const chatAttachment = await storeDispatchMedia(downloaded.buffer, downloaded.mime);
  return { mimetype: downloaded.mime, fileName: "header", mediaId, chatAttachment };
}

class MediaError extends Error {}

async function sendToRecipient(
  campaign: CampaignRecord,
  recipient: DispatchRecipient,
  header: Awaited<ReturnType<typeof resolveHeader>>,
  templateInfo?: Awaited<ReturnType<typeof listTemplates>>[number],
): Promise<{ messageId: string | null; text: string }> {
  const values: Record<string, string> = {
    nome: recipient.nome,
    email: recipient.email,
    telefone: recipient.telefone,
    segmento: recipient.segmento,
    data_nascimento: recipient.dataNascimento,
    primeiro_nome: firstName(recipient.nome),
  };
  // Atendente do contato (conversa aberta com operador) ou o nome da equipe: só consulta quando a campanha usa.
  if (campaign.modelo ? campaign.modelo.params.some(isAttendantField) : hasAttendantToken(campaign.mensagem)) {
    Object.assign(values, await assignedAttendantValues({ contactId: recipient.id, phone: recipient.telefone }));
  }
  if (campaign.modelo) {
    const params = campaign.modelo.params.map((field) => resolveParam(field, values));
    const quickReplyPayloads = (campaign.metaTemplateDraft?.buttons ?? campaign.modelo.buttons ?? [])
      .flatMap((button, index) => button.type === "QUICK_REPLY" && button.text.trim() ? [{ index, payload: button.text }] : []);
    const sent = await sendTemplate(recipient.telefone, campaign.modelo.name, campaign.modelo.language, params, header, [], quickReplyPayloads);
    return { messageId: sent.messages?.[0]?.id ?? null, text: renderTemplateText(templateInfo, campaign.modelo.name, params) };
  }
  const text = campaign.mensagem.replace(/\{\{(primeiro_nome|nome|email|telefone|segmento|data_nascimento|nome_atendente|primeiro_nome_atendente)\}\}/g, (_match, key: string) => values[key] ?? "");
  const media = (campaign.anexos ?? []).filter((file) => file.url);
  if (media.length === 0) {
    const sent = await sendText(recipient.telefone, text);
    return { messageId: sent.messages?.[0]?.id ?? null, text };
  }
  let firstMessageId: string | null = null;
  for (const [index, file] of media.entries()) {
    const sent = await sendMedia(recipient.telefone, { mimetype: file.type, fileName: file.name, url: file.url }, index === 0 ? text : undefined);
    if (index === 0) firstMessageId = sent.messages?.[0]?.id ?? null;
  }
  const names = media.map((file) => `📎 ${file.name}`).join("\n");
  return { messageId: firstMessageId, text: text ? `${names}\n\n${text}` : names };
}

// O registro de entrega nunca pode interromper o disparo.
async function recordMessage(campaignId: string, recipient: DispatchRecipient, result: { messageId: string | null } | { failure: string }) {
  try {
    await prisma.campaignMessage.create({
      data: {
        campaignId,
        contactId: recipient.id,
        phone: recipient.telefone,
        ...("failure" in result
          ? { status: "failed" as const, failedAt: new Date(), failureReason: result.failure.slice(0, 500) }
          : { status: "sent" as const, whatsappMsgId: result.messageId, sentAt: new Date() }),
      },
    });
  } catch (error) {
    console.error("[campaign-dispatch] registrar mensagem:", error);
  }
}

// Quem já recebeu ESTA campanha (sempre, para retomar sem repetir) e, com a trava ativa, quem recebeu qualquer
// campanha na janela de descanso. Por contato e por telefone (o cadastro tem números repetidos).
async function loadRecentlyReached(campaignId: string, withCooldown: boolean) {
  const sameCampaign = { campaignId, sentAt: { not: null } };
  const rows = await prisma.campaignMessage.findMany({
    // Envios em massa do pipeline (bulk:*) não contam no descanso entre campanhas.
    where: withCooldown
      ? { OR: [sameCampaign, { sentAt: { gte: new Date(Date.now() - CONTACT_COOLDOWN_MS) }, NOT: { campaignId: { startsWith: "bulk:" } } }] }
      : sameCampaign,
    select: { contactId: true, phone: true },
  });
  const reached = new Set<string>();
  for (const row of rows) {
    if (row.contactId) reached.add(row.contactId);
    for (const phone of phoneVariants(row.phone)) reached.add(phone);
  }
  return reached;
}

const recipientKeys = (recipient: DispatchRecipient) => [recipient.id, ...phoneVariants(recipient.telefone)];

/**
 * Pausa entre lotes: em trechos de até 1 min, gravando o progresso (sem isso, após 3 min parado a outra cor do
 * blue/green acharia o disparo órfão e retomaria em paralelo). Pausa/cancelamento pedidos interrompem a espera.
 */
async function waitWithHeartbeat(campaignId: string, job: DispatchJob, ms: number) {
  // Passos de 1 s: pausa, cancelamento e o desligamento do deploy interrompem a espera na hora.
  let left = ms;
  let sinceWrite = 0;
  while (left > 0) {
    const step = Math.min(left, 1_000);
    await sleep(step);
    left -= step;
    sinceWrite += step;
    if (control.has(campaignId) || shuttingDown()) return;
    if (left > 0 && sinceWrite >= 60_000) {
      sinceWrite = 0;
      await writeJob(job);
    }
  }
}

function addError(job: DispatchJob, message: string) {
  if (job.errors.length < MAX_STORED_ERRORS) job.errors.push(message);
}

/** Resultado de um envio depois das novas tentativas. */
type Delivery =
  | { kind: "sent" }
  | { kind: "failed"; detail: string; code?: number; api: boolean }
  | { kind: "infra"; detail: string; code?: number }
  | { kind: "pause"; pause: PauseReason }
  /** Pausa pedida ou desligamento durante a espera: o contato não foi processado e volta primeiro. */
  | { kind: "interrupted" };

async function runJob(campaignId: string) {
  const initial = await readJob(campaignId);
  if (!initial || initial.status !== "running") return;
  let job: DispatchJob = initial;
  // Desligando: o disparo da fila nem começa; fica marcado para a próxima instância.
  if (shuttingDown()) {
    job = pausedForRestart(job);
    await writeJob(job);
    await syncCampaign(job).catch(() => undefined);
    return;
  }
  try {
    const campaign = await readCampaign(campaignId);
    if (!campaign) throw new Error("Campanha não encontrada.");
    const recipients = await readRecipients(campaignId);
    const modelo = campaign.modelo;
    const templateInfo = modelo ? (await listTemplates().catch(() => [])).find((item) => item.name === modelo.name && item.language === modelo.language) : undefined;
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

    // A fila roda um disparo por vez: aqui já contam os envios da campanha anterior.
    // Com a trava ignorada no lote (ou desligada por ambiente), ninguém é pulado.
    // Ao retomar, quem já recebeu este disparo nunca recebe de novo, mesmo com a trava de descanso ignorada.
    const reached = await loadRecentlyReached(campaignId, !job.ignoreCooldown && CONTACT_COOLDOWN_MS > 0);
    // Opt-out (SAIR/PARAR): relido a cada execução, inclusive na retomada; quem saiu durante o disparo é pulado.
    const optedOut = await loadOptOutKeys();
    let consecutiveApiFailures = 0;
    let consecutiveInfraFailures = 0;
    // Ritmo e janela de horário configurados na campanha (opcionais).
    const cadence = normalizeCadence(campaign.cadence);
    const sendWindow = normalizeWindow(campaign.sendWindow);

    /** Pausa/cancelamento pedidos ou janela de horário fechada: grava e encerra esta execução. */
    const stopRequested = async () => {
      const requested = control.get(campaignId);
      if (requested) {
        control.delete(campaignId);
        job = requested === "pause"
          ? { ...job, status: "paused", pause: { kind: "manual", message: "Disparo pausado manualmente." } }
          : { ...job, status: "cancelled", finishedAt: new Date().toISOString() };
        await writeJob(job);
        await syncCampaign(job);
        return true;
      }
      // Deploy/reinício: para antes do próximo contato e deixa marcado para retomar sozinho.
      if (shuttingDown()) {
        job = pausedForRestart(job);
        await writeJob(job);
        await syncCampaign(job);
        return true;
      }
      // Fora da janela: pausa e o relógio do chat retoma sozinho no próximo início de janela.
      if (sendWindow && !insideWindow(sendWindow)) {
        const resumeAt = nextWindowStart(sendWindow);
        job = {
          ...job,
          status: "paused",
          pause: { kind: "schedule", message: `Fora do horário permitido (${sendWindow.start} às ${sendWindow.end}). Retoma sozinho em ${formatBr(resumeAt)}.`, resumeAt: resumeAt.toISOString() },
        };
        await writeJob(job);
        await syncCampaign(job);
        return true;
      }
      return false;
    };

    /** Espera antes de nova tentativa gravando o progresso (outra instância do blue/green não assume o disparo). */
    const backoff = async (ms: number) => {
      await writeJob(job);
      await waitWithHeartbeat(campaignId, job, ms);
    };

    /** Um envio com as novas tentativas: rede/instabilidade em 2, 5, 15 e 30 s; limite de velocidade com espera longa. */
    const deliver = async (recipient: DispatchRecipient): Promise<Delivery> => {
      let transient = 0;
      let limited = 0;
      for (;;) {
        let sent: Awaited<ReturnType<typeof sendToRecipient>>;
        try {
          sent = await sendToRecipient(campaign, recipient, header, templateInfo);
        } catch (error) {
          const failure = classifySendError(error);
          if (failure.type === "fatal") return { kind: "pause", pause: failure.pause };
          if (failure.type === "recipient") return { kind: "failed", detail: failure.detail, code: failure.code, api: failure.api };
          const waits = failure.type === "rate_limit" ? DISPATCH_TIMING.rateLimitWaitsMs : DISPATCH_TIMING.transientRetryMs;
          const attempt = failure.type === "rate_limit" ? limited++ : transient++;
          if (attempt < waits.length) {
            console.warn(`[campaign-dispatch] ${campaign.nome}: ${failure.detail} — nova tentativa ${attempt + 1} de ${waits.length}`);
            await backoff(waits[attempt]);
            if (control.has(campaignId) || shuttingDown()) return { kind: "interrupted" };
            continue;
          }
          return { kind: "infra", detail: failure.detail, code: failure.code };
        }
        await recordMessage(campaignId, recipient, { messageId: sent.messageId });
        // Fica no /chat do contato: quando ele responder, o atendente vê a campanha que originou o contato.
        // A mensagem já saiu: falha ao registrar no chat nunca reenvia nem para o disparo.
        await recordDispatchInChat({
          contactId: recipient.id,
          phone: chatPhone(recipient.telefone),
          text: sent.text,
          externalId: sent.messageId,
          authorName: `Campanha · ${campaign.nome}`,
          campaignId,
          campaignName: campaign.nome,
          attachment: campaign.modelo ? header?.chatAttachment ?? null : null,
          template: campaign.modelo ? { name: campaign.modelo.name, language: campaign.modelo.language } : null,
        }).catch((error) => console.error("[campaign-dispatch] registrar no chat:", error));
        for (const key of recipientKeys(recipient)) reached.add(key);
        return { kind: "sent" };
      }
    };

    const markFailed = async (recipient: DispatchRecipient, detail: string, code?: number) => {
      job.failed += 1;
      addError(job, `${recipient.nome}: ${detail}`);
      await recordMessage(campaignId, recipient, { failure: detail });
      if (code && INVALID_NUMBER_CODES.has(code)) await markInvalidWhatsApp(recipient.telefone, `${code}: ${detail}`).catch(() => undefined);
    };

    /** Resultado de um contato; devolve a pausa quando o disparo deve parar. `final`: já é a nova tentativa do fim. */
    const settle = async (index: number, recipient: DispatchRecipient, result: Exclude<Delivery, { kind: "interrupted" }>, final: boolean): Promise<PauseReason | null> => {
      if (result.kind === "pause") return result.pause;
      if (result.kind === "sent") {
        job.sent += 1;
        consecutiveApiFailures = 0;
        consecutiveInfraFailures = 0;
        return null;
      }
      if (result.kind === "failed") {
        await markFailed(recipient, result.detail, result.code);
        if (!result.api) return null;
        consecutiveApiFailures += 1;
        return consecutiveApiFailures >= MAX_CONSECUTIVE_API_FAILURES
          ? { kind: "consecutive", code: result.code, message: `${MAX_CONSECUTIVE_API_FAILURES} envios seguidos recusados pela Meta. Último erro: ${result.detail}`, detail: result.detail }
          : null;
      }
      // Sem conexão/instável mesmo após as novas tentativas: o contato volta no fim do disparo (ou falha de vez).
      if (final) await markFailed(recipient, result.detail, result.code);
      else job.retryQueue = [...new Set([...(job.retryQueue ?? []), index])];
      consecutiveInfraFailures += 1;
      return consecutiveInfraFailures >= MAX_CONSECUTIVE_INFRA_FAILURES
        ? { kind: "network", code: result.code, message: `${MAX_CONSECUTIVE_INFRA_FAILURES} envios seguidos sem conseguir falar com a Meta, mesmo com novas tentativas. Último erro: ${result.detail}`, detail: result.detail }
        : null;
    };

    const pauseWith = async (pause: PauseReason) => {
      job = { ...job, status: "paused", pause };
      await writeJob(job);
      await syncCampaign(job);
    };

    while (job.cursor < job.total) {
      if (await stopRequested()) return;
      const sentBefore = job.sent;
      const index = job.cursor;
      const recipient = recipients[index];
      if (recipient?.telefone?.trim() && recipientKeys(recipient).some((key) => reached.has(key) || optedOut.has(key))) {
        job.skipped += 1;
        job.cursor += 1;
        await writeJob(job);
        continue;
      }
      let pause: PauseReason | null = null;
      if (!recipient?.telefone?.trim()) {
        job.failed += 1;
        addError(job, `${recipient?.nome ?? "Contato"}: telefone não cadastrado.`);
      } else {
        const result = await deliver(recipient);
        if (result.kind === "interrupted") {
          if (await stopRequested()) return;
          continue;
        }
        pause = await settle(index, recipient, result, false);
        // Token, pagamento ou conta: o contato não foi processado e volta primeiro na retomada.
        if (pause && result.kind === "pause") {
          await pauseWith(pause);
          return;
        }
      }
      job.cursor += 1;
      if (pause) {
        await pauseWith(pause);
        return;
      }
      await writeJob(job);
      if (job.cursor < job.total) {
        const wait = job.sent > sentBefore ? cadenceWaitMs(cadence, job.sent, DISPATCH_TIMING.sendDelayMs) : DISPATCH_TIMING.sendDelayMs;
        await waitWithHeartbeat(campaignId, job, wait);
      }
    }

    // Nova tentativa de quem não saiu por falha de conexão/instabilidade (inclusive depois de retomar).
    while (job.retryQueue?.length) {
      if (await stopRequested()) return;
      const index = job.retryQueue[0];
      const recipient = recipients[index];
      const keys = recipient ? recipientKeys(recipient) : [];
      let pause: PauseReason | null = null;
      if (recipient?.telefone?.trim() && !keys.some((key) => reached.has(key) || optedOut.has(key))) {
        const result = await deliver(recipient);
        if (result.kind === "interrupted") {
          if (await stopRequested()) return;
          continue;
        }
        if (result.kind === "pause") {
          await pauseWith(result.pause);
          return;
        }
        pause = await settle(index, recipient, result, true);
      }
      job.retryQueue = job.retryQueue.slice(1);
      if (pause) {
        await pauseWith(pause);
        return;
      }
      await writeJob(job);
      if (job.retryQueue.length) await waitWithHeartbeat(campaignId, job, DISPATCH_TIMING.sendDelayMs);
    }

    job = { ...job, status: "completed", finishedAt: new Date().toISOString(), pause: undefined, retryQueue: undefined };
    await writeJob(job);
    await syncCampaign(job);
  } catch (error) {
    console.error("[campaign-dispatch] falha inesperada:", error);
    void reportError("campaign.dispatch", error, { campaignId });
    const current = (await readJob(campaignId)) ?? job;
    const paused: DispatchJob = { ...current, status: "paused", pause: { kind: "network", message: `Erro inesperado no disparo: ${error instanceof Error ? error.message : String(error)}`, detail: technicalDetail(error) } };
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

async function assertCampaignTemplateReady(campaign: CampaignRecord) {
  if (campaign.metaApprovalStatus && campaign.metaApprovalStatus !== "APPROVED") {
    const reason = campaign.metaApprovalReason ? ` Motivo: ${campaign.metaApprovalReason}` : "";
    throw new DispatchError(`A campanha "${campaign.nome}" só pode ser disparada após a aprovação do template pela Meta.${reason}`, 409);
  }
  if (!campaign.modelo) {
    if (campaign.metaApprovalStatus === "APPROVED") {
      throw new DispatchError(`O template aprovado da campanha "${campaign.nome}" não está vinculado.`, 409);
    }
    return;
  }
  const template = campaign.metaTemplateId
    ? await findTemplate(campaign.metaTemplateId, campaign.modelo.name)
    : (await listTemplates()).find((item) => item.name === campaign.modelo?.name && item.language === campaign.modelo?.language);
  if (!template || template.status !== "APPROVED") {
    throw new DispatchError(`O template "${campaign.modelo.name}" não está aprovado pela Meta e a campanha não pode ser disparada.`, 409);
  }
}

/** Prévia do público no assistente: total, repetidos, descadastrados (SAIR/PARAR), sem celular válido e válidos. */
export async function previewAudience(recipients: DispatchRecipient[]) {
  return summarizeAudience(recipients, await loadOptOutKeys());
}

export async function startDispatch(campaignId: string, requested: DispatchRecipient[], options: { ignoreCooldown?: boolean; scheduledAt?: string } = {}) {
  const scheduledAt = options.scheduledAt ? new Date(options.scheduledAt) : null;
  if (scheduledAt && (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now() + 60_000 || scheduledAt.getTime() > Date.now() + 61 * 86_400_000)) {
    throw new DispatchError("Horário de agendamento inválido: escolha a partir de 5 minutos e até 60 dias à frente.", 400);
  }
  // Quem pediu para sair (marketingOptOut) nunca entra na fila de uma campanha.
  // Cada pessoa recebe no máximo uma vez, mesmo estando em vários segmentos (por contato e por celular).
  const { unique, removed: duplicatesRemoved } = dedupeRecipients(requested);
  const reachable = withoutOptedOut(unique, await loadOptOutKeys());
  const existing = await readJob(campaignId);
  if (existing && (existing.status === "running" || existing.status === "paused")) {
    throw new DispatchError("Esta campanha já tem um disparo em andamento ou pausado.", 409);
  }
  const campaign = await readCampaign(campaignId);
  if (!campaign) throw new DispatchError("Campanha não encontrada.", 404);
  if (["Enviando", "Enviada", "Envio parcial", "Envio pausado"].includes(campaign.status)) {
    throw new DispatchError(`"${campaign.nome}" está em envio ou já teve mensagens enviadas. Não é possível dispará-la novamente para evitar duplicidades.`, 409);
  }
  // "Excluir leads frios": quem não leu nem respondeu nenhuma das últimas X campanhas fica fora (economia na Meta).
  const coldLimit = Number(campaign.excludeColdLeads);
  const cold = Number.isInteger(coldLimit) && coldLimit >= 1 ? await coldContactIds(reachable.map((recipient) => recipient.id), Math.min(coldLimit, 20)) : new Set<string>();
  const recipients = cold.size > 0 ? reachable.filter((recipient) => !cold.has(recipient.id)) : reachable;
  await assertCampaignTemplateReady(campaign);
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
    skipped: 0,
    baseDisparos: campaign.disparos ?? 0,
    ignoreCooldown: options.ignoreCooldown === true,
    duplicatesRemoved,
    coldRemoved: cold.size,
    errors: [],
    startedAt: new Date().toISOString(),
    // Agendado: espera pausado até a hora; o relógio do chat retoma (uma instância só, gravação condicional).
    ...(scheduledAt ? {
      status: "paused" as const,
      scheduledAt: scheduledAt.toISOString(),
      pause: { kind: "schedule" as const, message: `Agendada para ${formatBr(scheduledAt)}.`, resumeAt: scheduledAt.toISOString() },
    } : {}),
  };
  await prisma.crmWorkspaceData.upsert({
    where: { key: recipientsKey(campaignId) },
    create: { key: recipientsKey(campaignId), value: asJson(recipients) },
    update: { value: asJson(recipients) },
  });
  await writeJob(job);
  await syncCampaign(job);
  if (!scheduledAt) enqueue(campaignId);
  return job;
}

export async function resumeDispatch(campaignId: string) {
  const job = await readJob(campaignId);
  if (!job || job.status !== "paused") throw new DispatchError("Não há disparo pausado para esta campanha.", 409);
  const campaign = await readCampaign(campaignId);
  if (!campaign) throw new DispatchError("Campanha não encontrada.", 404);
  await assertCampaignTemplateReady(campaign);
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

/** Maior pausa sem gravar o progresso é a espera de limite da Meta (2 min): 3 min sem gravar = ninguém está enviando. */
export const RESUME_IDLE_MS = 3 * 60 * 1000;
export const recentlyActive = (updatedAt: Date, now = Date.now()) => now - updatedAt.getTime() < RESUME_IDLE_MS;

// Lista os disparos e retoma os que ficaram "em andamento" após reinício do servidor.
export async function listDispatchJobs(): Promise<DispatchJob[]> {
  const rows = await prisma.crmWorkspaceData.findMany({ where: { key: { startsWith: "dispatch:" } }, select: { key: true, value: true, updatedAt: true } });
  const jobs = rows.map((row) => row.value as unknown as DispatchJob);
  for (const [index, row] of rows.entries()) {
    const job = jobs[index];
    // Esta instância está desligando (deploy): quem retoma é a nova.
    if (shuttingDown()) break;
    // Interrompido pelo deploy (desligamento gracioso) ou órfão de queda (em andamento sem progresso há 3 min):
    // volta sozinho. A gravação condicional (mesmo updatedAt) é a trava: só uma instância retoma cada disparo.
    const interrupted = job.status === "paused" && job.pause?.kind !== "manual" && (job.pause?.kind === "restart" || job.autoResumeOnBoot === true);
    const orphan = job.status === "running" && !recentlyActive(row.updatedAt);
    if ((interrupted || orphan) && !running.has(job.campaignId)) {
      const resumed: DispatchJob = { ...job, status: "running", pause: undefined, autoResumeOnBoot: undefined, autoResumedAt: new Date().toISOString() };
      const claimed = await prisma.crmWorkspaceData.updateMany({ where: { key: row.key, updatedAt: row.updatedAt }, data: { value: asJson(resumed) } }).catch(() => ({ count: 0 }));
      if (claimed.count === 1) {
        console.info(`[campaign-dispatch] ${job.campaignName}: ${AUTO_RESUME_NOTE} (${job.cursor} de ${job.total}).`);
        jobs[index] = resumed;
        await syncCampaign(resumed).catch(() => undefined);
        enqueue(job.campaignId);
      }
      continue;
    }
    // Pausado por horário: volta sozinho ao chegar a hora. A gravação condicional (mesmo updatedAt) garante que
    // só uma instância retoma, mesmo com os relógios das duas cores rodando juntos.
    if (job.status === "paused" && job.pause?.kind === "schedule" && job.pause.resumeAt && new Date(job.pause.resumeAt).getTime() <= Date.now()) {
      const resumed: DispatchJob = { ...job, status: "running", pause: undefined };
      const claimed = await prisma.crmWorkspaceData.updateMany({ where: { key: row.key, updatedAt: row.updatedAt }, data: { value: asJson(resumed) } }).catch(() => ({ count: 0 }));
      if (claimed.count === 1) {
        jobs[index] = resumed;
        await syncCampaign(resumed).catch(() => undefined);
        enqueue(job.campaignId);
      }
    }
  }
  return jobs;
}

/**
 * Desligamento gracioso (SIGTERM/SIGINT do deploy): para de puxar contatos, espera o envio em andamento terminar
 * (até timeoutMs) e deixa cada disparo desta instância como "interrompido pela atualização", para a próxima
 * instância retomar sozinha. Pausa manual, erro fatal e disparos de outra instância nunca são tocados.
 */
export async function shutdownDispatches(timeoutMs = 20_000): Promise<string[]> {
  globalState.__dispatchShutdown = true;
  const mine = [...running];
  const deadline = Date.now() + timeoutMs;
  while (running.size > 0 && Date.now() < deadline) await sleep(50);
  // Envio preso além do limite: marca mesmo assim (o processo vai sair em seguida).
  for (const campaignId of running) {
    const job = await readJob(campaignId).catch(() => null);
    if (job?.status === "running") {
      const paused = pausedForRestart(job);
      await writeJob(paused).catch(() => undefined);
      await syncCampaign(paused).catch(() => undefined);
    }
  }
  return mine;
}

/** Desfaz o desligamento (desligamento cancelado; usado também pelos testes). */
export function cancelDispatchShutdown() {
  globalState.__dispatchShutdown = false;
}

/** Envios do follow-up ficam num disparo próprio (não somam no funil do principal); a resposta conta para a campanha. */
export const FOLLOW_UP_PREFIX = "followup:";
export const followUpCampaignId = (campaignId: string) => `${FOLLOW_UP_PREFIX}${campaignId}`;
/** Id da campanha de origem de um envio (o follow-up responde pela campanha principal). */
export const baseCampaignId = (campaignId: string) => campaignId.startsWith(FOLLOW_UP_PREFIX) ? campaignId.slice(FOLLOW_UP_PREFIX.length) : campaignId;

/** Follow-up por minuto do relógio (com o espaçamento normal entre envios). */
const FOLLOW_UP_PER_TICK = 40;
/** Só quem recebeu o principal nas últimas (prazo + 48 h): ligar o follow-up numa campanha antiga não dispara para todos. */
const FOLLOW_UP_GRACE_MS = 48 * 60 * 60 * 1000;
const followUpKey = (messageId: string) => `campaign-followup:${messageId}`;

/** O contato engajou depois do envio: escreveu no chat (mensagem de pessoa) ou tem venda no VMSet. */
async function engagedSince(contactId: string | null, phone: string, sentAt: Date) {
  const variants = phoneVariants(phone);
  const contactFilter = contactId ? [{ contactId }, { phone: { in: variants } }] : [{ phone: { in: variants } }];
  const replied = await prisma.chatMessage.findFirst({
    where: {
      author: "customer",
      createdAt: { gt: sentAt },
      OR: [{ authorName: null }, { authorName: { not: AUTO_REPLY_AUTHOR } }],
      conversation: { OR: contactFilter },
    },
    select: { id: true },
  });
  if (replied) return "resposta";
  const contacts = await prisma.contact.findMany({ where: { OR: [...(contactId ? [{ id: contactId }] : []), { phone: { in: variants } }] }, select: { sourceKey: true } });
  if (contacts.length === 0) return null;
  const sale = await prisma.$queryRaw<{ found: number }[]>`
    SELECT 1 AS found FROM "VmsetSale"
    WHERE "sourceKey" = ANY(${contacts.map((contact) => contact.sourceKey)}::text[]) AND "type" = 'Venda' AND "orderDate" >= ${brDay(sentAt)}::date
    LIMIT 1
  `;
  return sale.length > 0 ? "venda" : null;
}

/**
 * Follow-up em cascata (relógio do chat, a cada minuto): quem recebeu o disparo principal (entrega confirmada) e,
 * depois de `afterHours`, não respondeu nem comprou recebe o 2º template. Resposta no chat ou venda no VMSet
 * cancela o follow-up do contato. Respeita a janela de horário, o descadastro e nunca envia duas vezes (trava no banco).
 */
export async function runCampaignFollowUps(now: Date = new Date()) {
  const summary = { sent: 0, cancelled: 0, failed: 0 };
  const row = await prisma.crmWorkspaceData.findUnique({ where: { key: "campaigns" }, select: { value: true } });
  const campaigns = Array.isArray(row?.value) ? (row.value as unknown as CampaignRecord[]) : [];
  let budget = FOLLOW_UP_PER_TICK;
  let optedOut: Set<string> | null = null;
  for (const campaign of campaigns) {
    if (budget <= 0) break;
    const followUp = normalizeFollowUp(campaign.followUp);
    if (!followUp?.modelo || !insideWindow(normalizeWindow(campaign.sendWindow), now)) continue;
    const dueBefore = new Date(now.getTime() - followUp.afterHours * 60 * 60 * 1000);
    const candidates = await prisma.campaignMessage.findMany({
      where: { campaignId: campaign.id, status: { in: ["delivered", "read"] }, repliedAt: null, sentAt: { lte: dueBefore, gte: new Date(dueBefore.getTime() - FOLLOW_UP_GRACE_MS) } },
      orderBy: { sentAt: "asc" },
      select: { id: true, contactId: true, phone: true, sentAt: true },
      take: 1000,
    });
    if (candidates.length === 0) continue;
    const done = new Set((await prisma.chatDispatch.findMany({ where: { key: { in: candidates.map((item) => followUpKey(item.id)) } }, select: { key: true } })).map((item) => item.key));
    const pending = candidates.filter((item) => !done.has(followUpKey(item.id)));
    if (pending.length === 0) continue;

    optedOut ??= await loadOptOutKeys();
    const followCampaign: CampaignRecord = { ...campaign, modelo: followUp.modelo, metaTemplateDraft: undefined, anexos: [] };
    const templateInfo = (await listTemplates().catch(() => [])).find((item) => item.name === followUp.modelo?.name && item.language === followUp.modelo?.language);
    if (templateInfo && templateInfo.status !== "APPROVED") continue;
    let header: Awaited<ReturnType<typeof resolveHeader>>;
    try {
      header = await resolveHeader(followCampaign);
    } catch (error) {
      console.warn(`[campaign-followup] ${campaign.nome}: imagem do modelo indisponível (${error instanceof Error ? error.message : error})`);
      continue;
    }

    for (const message of pending) {
      if (budget <= 0) break;
      const sentAt = message.sentAt as Date;
      const blocked = (message.contactId && optedOut.has(message.contactId)) || phoneVariants(message.phone).some((key) => optedOut?.has(key));
      const engaged = blocked ? "descadastro" : await engagedSince(message.contactId, message.phone, sentAt);
      if (engaged) {
        // Auto-cancelamento: o follow-up deste contato não sai mais.
        if (await firstDispatch(followUpKey(message.id))) summary.cancelled += 1;
        continue;
      }
      if (!(await firstDispatch(followUpKey(message.id)))) continue;
      budget -= 1;
      const contact = message.contactId
        ? await prisma.contact.findUnique({ where: { id: message.contactId }, select: { id: true, name: true, email: true, birthDate: true, segment: true } })
        : null;
      const recipient: DispatchRecipient = {
        id: contact?.id ?? message.contactId ?? "",
        nome: contact?.name ?? "",
        telefone: message.phone,
        email: contact?.email ?? "",
        dataNascimento: contact?.birthDate ?? "",
        segmento: contact?.segment ?? "",
      };
      try {
        const { messageId, text } = await sendToRecipient(followCampaign, recipient, header, templateInfo);
        await recordMessage(followUpCampaignId(campaign.id), recipient, { messageId });
        if (recipient.id) {
          await recordDispatchInChat({ contactId: recipient.id, phone: chatPhone(recipient.telefone), text, externalId: messageId, authorName: `Campanha · ${campaign.nome} (follow-up)`, campaignId: campaign.id, campaignName: campaign.nome, attachment: header?.chatAttachment ?? null, template: followCampaign.modelo ? { name: followCampaign.modelo.name, language: followCampaign.modelo.language } : null });
        }
        summary.sent += 1;
      } catch (error) {
        summary.failed += 1;
        await recordMessage(followUpCampaignId(campaign.id), recipient, { failure: error instanceof Error ? error.message : "Falha no envio" });
        // Limite, pagamento, conta ou template: para tudo neste minuto e tenta de novo no próximo com os demais.
        if (describePause(error)) return summary;
      }
      await sleep(DISPATCH_TIMING.sendDelayMs);
    }
  }
  return summary;
}

export class DispatchError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}
