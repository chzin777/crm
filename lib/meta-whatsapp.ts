/**
 * Meta WhatsApp Cloud API client
 * Replaces Evolution API with official WhatsApp Business integration.
 *
 * Credentials (test environment):
 *   META_WHATSAPP_PHONE_NUMBER_ID  – Phone number ID from Meta Business Suite
 *   META_WHATSAPP_ACCESS_TOKEN     – Permanent or temporary access token
 *   META_WHATSAPP_ACCOUNT_ID       – WhatsApp Business Account ID
 */

import { request } from "node:https";
import { connect, type TLSSocket } from "node:tls";

const GRAPH_API = "https://graph.facebook.com/v21.0";

/**
 * Certificado que o FortiGate apresenta para *.fbsbx.com enquanto inspeciona o tráfego, sem enviar a CA.
 * Vence em 14/11/2026: depois disso o download falha até este valor ser atualizado.
 * Remover quando lookaside.fbsbx.com entrar na exceção de inspeção SSL do firewall.
 */
const INSPECTED_MEDIA_FINGERPRINT = "39:B7:52:85:A6:CA:37:09:7F:40:CF:E6:31:6D:98:56:BA:EC:EB:CF:BB:AC:C8:74:C5:C5:E9:E3:E9:CC:9D:31";
const MEDIA_TIMEOUT_MS = 20_000;
const CHAIN_ERRORS = new Set([
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
]);

const isChainError = (error: unknown) => CHAIN_ERRORS.has((error as { cause?: { code?: string } }).cause?.code ?? "");

const isMediaHost = (url: URL) => url.protocol === "https:" && (url.hostname === "fbsbx.com" || url.hostname.endsWith(".fbsbx.com"));

/** Só devolve o socket depois de conferir a fingerprint: nenhum byte HTTP, nem o token, sai antes disso. */
function pinnedMediaSocket(host: string) {
  return new Promise<TLSSocket>((resolve, reject) => {
    const socket = connect({ host, port: 443, servername: host, rejectUnauthorized: false });
    socket.setTimeout(MEDIA_TIMEOUT_MS, () => socket.destroy(new Error("Tempo esgotado ao baixar mídia.")));
    socket.once("error", reject);
    socket.once("secureConnect", () => {
      const { fingerprint256 } = socket.getPeerCertificate();
      if (fingerprint256 !== INSPECTED_MEDIA_FINGERPRINT) {
        socket.destroy();
        reject(new Error(`Certificado de mídia não reconhecido (${fingerprint256}).`));
        return;
      }
      socket.off("error", reject);
      resolve(socket);
    });
  });
}

async function downloadPinnedMedia(url: URL, accessToken: string, maxBytes: number) {
  const socket = await pinnedMediaSocket(url.hostname);
  return new Promise<{ buffer: Buffer; contentType: string | undefined }>((resolve, reject) => {
    // Sem a opção agent: com qualquer agent o Node ignora createConnection e abre outra conexão.
    const outgoing = request(url, { createConnection: () => socket, headers: { Authorization: `Bearer ${accessToken}` } }, (response) => {
      if (response.statusCode !== 200) {
        outgoing.destroy();
        reject(new Error(`Falha ao baixar mídia (${response.statusCode}).`));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) outgoing.destroy(new Error("Mídia acima do limite."));
        else chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("end", () => {
        socket.destroy();
        resolve({ buffer: Buffer.concat(chunks), contentType: response.headers["content-type"] });
      });
    });
    outgoing.on("error", reject);
    outgoing.end();
  });
}

function getConfig() {
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
  const accountId = process.env.META_WHATSAPP_ACCOUNT_ID;

  if (!phoneNumberId || !accessToken) {
    throw new Error(
      "Meta WhatsApp API não configurada. Defina META_WHATSAPP_PHONE_NUMBER_ID e META_WHATSAPP_ACCESS_TOKEN no .env.",
    );
  }

  return { phoneNumberId, accessToken, accountId };
}

const CONNECT_ERRORS = new Set(["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ENETUNREACH", "EHOSTUNREACH", "UND_ERR_CONNECT_TIMEOUT"]);
const CONNECT_RETRY_MS = [1_000, 3_000];

/** O fetch do Node esconde o motivo em `cause`; sem ele o log não diz se foi DNS, firewall ou tempo esgotado. */
function networkCause(error: unknown) {
  const cause = error instanceof Error ? (error.cause as { code?: string; message?: string } | undefined) : undefined;
  return cause?.code ?? cause?.message ?? (error instanceof Error ? error.message : "erro desconhecido");
}

async function graph<T>(path: string, init?: RequestInit): Promise<T> {
  const { accessToken } = getConfig();
  const url = `${GRAPH_API}${path}`;

  let response: Response | undefined;
  for (let attempt = 0; !response; attempt += 1) {
    try {
      response = await fetch(url, {
        ...init,
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          ...init?.headers,
        },
      });
    } catch (error) {
      const cause = networkCause(error);
      // Só repete quando a conexão nem abriu: a Meta não recebeu nada, então não há envio em dobro.
      if (CONNECT_ERRORS.has(cause) && attempt < CONNECT_RETRY_MS.length) {
        console.warn(`[meta] sem conexão com a Graph API (${cause}), nova tentativa ${attempt + 1} de ${CONNECT_RETRY_MS.length}: ${path}`);
        await new Promise((resolve) => setTimeout(resolve, CONNECT_RETRY_MS[attempt]));
        continue;
      }
      console.error(`[meta] falha de rede na Graph API (${cause}) após ${attempt + 1} tentativa(s): ${path}`);
      throw new Error(`Não foi possível conectar à Meta WhatsApp API (${cause}). Verifique sua conexão.`);
    }
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMsg = body?.error?.message ?? body?.error?.error_user_msg ?? JSON.stringify(body?.error ?? body);
    const code = Number(body?.error?.code);
    console.error(`[meta] Graph API respondeu ${response.status} em ${path}: código ${body?.error?.code ?? "?"}, subcódigo ${body?.error?.error_subcode ?? "?"} - ${errorMsg}`);
    throw new MetaApiError(`Meta WhatsApp API: ${errorMsg}`, Number.isFinite(code) ? code : undefined, response.status, body?.error);
  }

  return body as T;
}

export class MetaApiError extends Error {
  constructor(message: string, public code?: number, public httpStatus?: number, public details?: unknown) {
    super(message);
    this.name = "MetaApiError";
  }
}

/**
 * Normalize phone to E.164 format without the + prefix.
 * Meta API expects numbers like "5511999999999".
 */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) throw new Error("Telefone inválido.");
  // Ensure country code 55 for Brazilian numbers
  const normalized = digits.startsWith("55") && digits.length >= 12 ? digits : `55${digits}`;
  return normalized;
}

/**
 * Send a text message via Meta WhatsApp Cloud API.
 */
export async function sendText(phone: string, text: string, replyToId?: string) {
  const { phoneNumberId } = getConfig();
  const to = normalizePhone(phone);

  return graph<{ messages: { id: string }[] }>(`/${phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      ...(replyToId ? { context: { message_id: replyToId } } : {}),
      type: "text",
      text: { preview_url: false, body: text },
    }),
  });
}

/** Lista interativa: comporta mais opções que os botões, limitados a 3 pela Meta. */
export async function sendList(phone: string, list: { body: string; button: string; rows: { id: string; title: string }[] }) {
  const { phoneNumberId } = getConfig();

  return graph<{ messages: { id: string }[] }>(`/${phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalizePhone(phone),
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: list.body },
        action: { button: list.button, sections: [{ rows: list.rows }] },
      },
    }),
  });
}

/** Baixa a mídia recebida: o evento traz só o id; a URL exige o mesmo Bearer e expira em minutos. */
export async function downloadMedia(mediaId: string, maxBytes: number) {
  const { accessToken } = getConfig();
  const info = await graph<{ url: string; mime_type?: string; file_size?: number }>(`/${mediaId}`);
  if (info.file_size && info.file_size > maxBytes) throw new Error("Mídia acima do limite.");
  const url = new URL(info.url);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" }).catch((error: unknown) => {
    if (isChainError(error) && isMediaHost(url)) return null;
    throw error;
  });
  if (!response) {
    const { buffer, contentType } = await downloadPinnedMedia(url, accessToken, maxBytes);
    return { buffer, mime: info.mime_type ?? contentType ?? "application/octet-stream" };
  }
  if (!response.ok) throw new Error(`Falha ao baixar mídia (${response.status}).`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > maxBytes) throw new Error("Mídia acima do limite.");
  return { buffer, mime: info.mime_type ?? response.headers.get("content-type") ?? "application/octet-stream" };
}

/**
 * Upload media to Meta's servers and return the media ID.
 * Required before sending media messages.
 */
export async function uploadMedia(file: { mimetype: string; fileName: string; base64?: string; url?: string }): Promise<string> {
  const { phoneNumberId, accessToken } = getConfig();

  // If we have a URL, download it first to get a buffer
  let buffer: Buffer;
  if (file.url) {
    const response = await fetch(file.url);
    if (!response.ok) throw new Error(`Falha ao baixar mídia de ${file.url}`);
    buffer = Buffer.from(await response.arrayBuffer());
  } else if (file.base64) {
    buffer = Buffer.from(file.base64, "base64");
  } else {
    throw new Error("Arquivo sem base64 ou URL.");
  }

  // Build multipart form data for Meta upload endpoint
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(buffer)], { type: file.mimetype });
  formData.append("file", blob, file.fileName);
  formData.append("messaging_product", "whatsapp");
  formData.append("type", file.mimetype);

  const response = await fetch(`${GRAPH_API}/${phoneNumberId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const errorMsg = body?.error?.message ?? JSON.stringify(body?.error ?? body);
    throw new Error(`Meta WhatsApp API (upload): ${errorMsg}`);
  }

  return (body as { id: string }).id;
}

/**
 * Send a media message (image, video, document) via Meta WhatsApp Cloud API.
 */
export async function sendMedia(
  phone: string,
  file: { mimetype: string; fileName: string; base64?: string; url?: string },
  caption?: string,
  options: { asDocument?: boolean; replyToId?: string } = {},
) {
  const { phoneNumberId } = getConfig();
  const to = normalizePhone(phone);

  // Upload media first
  const mediaId = await uploadMedia(file);
  if (file.mimetype.startsWith("audio/")) console.log(`[whatsapp/media] áudio enviado à Meta: mime=${file.mimetype} media_id=${mediaId}`);

  // Determine media type
  let type: string;
  let payload: Record<string, unknown>;

  if (!options.asDocument && file.mimetype.startsWith("image/")) {
    type = "image";
    payload = { image: { id: mediaId, ...(caption ? { caption } : {}) } };
  } else if (!options.asDocument && file.mimetype.startsWith("video/")) {
    type = "video";
    payload = { video: { id: mediaId, ...(caption ? { caption } : {}) } };
  } else if (!options.asDocument && file.mimetype.startsWith("audio/")) {
    // Áudio não aceita legenda; ogg/opus segue como mensagem de voz, com a barra de reprodução nativa.
    type = "audio";
    payload = { audio: { id: mediaId, ...(file.mimetype === "audio/ogg" ? { voice: true } : {}) } };
  } else {
    type = "document";
    payload = {
      document: {
        id: mediaId,
        filename: file.fileName,
        ...(caption ? { caption } : {}),
      },
    };
  }

  return graph<{ messages: { id: string }[] }>(`/${phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      ...(options.replyToId ? { context: { message_id: options.replyToId } } : {}),
      type,
      ...payload,
    }),
  });
}

/** Confirma a leitura da mensagem recebida (tiques azuis no celular do cliente). */
export async function markMessageRead(messageId: string) {
  const { phoneNumberId } = getConfig();
  return graph<{ success: boolean }>(`/${phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: messageId }),
  });
}

export type TemplateButton = {
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
  text: string;
  url?: string;
  phone_number?: string;
};

export type WhatsAppTemplate = {
  headerImageUrl: string | null;
  buttons: TemplateButton[];
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  body: string;
  footer: string;
  headerFormat: string | null;
  headerText: string;
  examples: string[];
  rejectedReason?: string;
};

type TemplateComponent = { type: string; format?: string; text?: string; buttons?: TemplateButton[]; example?: { header_handle?: string[]; body_text?: string[][] } };

function getAccountId() {
  const { accountId } = getConfig();
  if (!accountId) throw new Error("META_WHATSAPP_ACCOUNT_ID não configurado no .env.");
  return accountId;
}

export async function listTemplates(): Promise<WhatsAppTemplate[]> {
  const accountId = getAccountId();
  const data = await graph<{
    data: { id: string; name: string; status: string; category: string; language: string; rejected_reason?: string; components?: TemplateComponent[] }[];
  }>(`/${accountId}/message_templates?limit=100&fields=name,status,category,language,components,rejected_reason`);
  return data.data.filter((item) => item.name !== "hello_world" && !["DELETED", "PENDING_DELETION"].includes(item.status)).map((item) => ({
    id: item.id,
    name: item.name,
    status: item.status,
    category: item.category,
    language: item.language,
    body: item.components?.find((component) => component.type === "BODY")?.text ?? "",
    footer: item.components?.find((component) => component.type === "FOOTER")?.text ?? "",
    headerImageUrl: item.components?.find((component) => component.type === "HEADER" && component.format === "IMAGE")?.example?.header_handle?.[0] ?? null,
    buttons: item.components?.find((component) => component.type === "BUTTONS")?.buttons ?? [],
    headerFormat: item.components?.find((component) => component.type === "HEADER")?.format ?? null,
    headerText: item.components?.find((component) => component.type === "HEADER")?.text ?? "",
    examples: item.components?.find((component) => component.type === "BODY")?.example?.body_text?.[0] ?? [],
    rejectedReason: item.rejected_reason && item.rejected_reason !== "NONE" ? item.rejected_reason : undefined,
  }));
}

// Resumable Upload API: gera o "header_handle" exigido para exemplo de mídia no cabeçalho do modelo.
async function uploadTemplateSample(file: { mimetype: string; fileName: string; buffer: Buffer }): Promise<string> {
  const { accessToken } = getConfig();
  const debug = await graph<{ data?: { app_id?: string } }>(`/debug_token?input_token=${encodeURIComponent(accessToken)}`);
  const appId = debug.data?.app_id;
  if (!appId) throw new Error("Não foi possível identificar o app da Meta para enviar a imagem de exemplo.");

  const session = await graph<{ id: string }>(
    `/${appId}/uploads?file_length=${file.buffer.length}&file_type=${encodeURIComponent(file.mimetype)}&file_name=${encodeURIComponent(file.fileName)}`,
    { method: "POST" },
  );

  const response = await fetch(`${GRAPH_API}/${session.id}`, {
    method: "POST",
    headers: { Authorization: `OAuth ${accessToken}`, file_offset: "0" },
    body: new Uint8Array(file.buffer),
  });
  const body = (await response.json().catch(() => null)) as { h?: string; error?: { message?: string } } | null;
  if (!response.ok || !body?.h) {
    throw new Error(`Meta WhatsApp API (upload do exemplo): ${body?.error?.message ?? "falha no envio da imagem"}`);
  }
  return body.h;
}

export type TemplateHeaderImage = { mimetype: string; fileName: string; buffer: Buffer };

export type TemplateContent = {
  body: string;
  examples: string[];
  footer?: string;
  buttons?: TemplateButton[];
  headerImage?: TemplateHeaderImage;
  headerText?: string;
};

/** A Meta não aceita de volta a URL da imagem: para manter a atual, ela precisa ser enviada de novo. */
export async function downloadTemplateImage(url: string): Promise<TemplateHeaderImage> {
  const response = await fetch(url, { cache: "no-store" }).catch(() => null);
  if (!response?.ok) throw new Error("Não foi possível recuperar a imagem atual do modelo. Selecione a imagem novamente.");
  const type = response.headers.get("content-type")?.split(";")[0] ?? "";
  const mimetype = type === "image/png" ? "image/png" : "image/jpeg";
  return { mimetype, fileName: mimetype === "image/png" ? "modelo.png" : "modelo.jpg", buffer: Buffer.from(await response.arrayBuffer()) };
}

async function buildTemplateComponents(input: TemplateContent) {
  const components: Record<string, unknown>[] = [];
  if (input.headerImage) {
    const handle = await uploadTemplateSample(input.headerImage);
    components.push({ type: "HEADER", format: "IMAGE", example: { header_handle: [handle] } });
  } else if (input.headerText) {
    components.push({ type: "HEADER", format: "TEXT", text: input.headerText });
  }
  const body: { type: "BODY"; text: string; example?: { body_text: string[][] } } = { type: "BODY", text: input.body };
  if (input.examples.length > 0) body.example = { body_text: [input.examples] };
  components.push(body);
  if (input.footer) components.push({ type: "FOOTER", text: input.footer });
  if (input.buttons && input.buttons.length > 0) components.push({ type: "BUTTONS", buttons: input.buttons });
  return components;
}

export async function createTemplate(input: TemplateContent & { name: string; language: string; category: "UTILITY" | "MARKETING" }) {
  const accountId = getAccountId();
  const components = await buildTemplateComponents(input);
  return graph<{ id: string; status: string; category: string }>(`/${accountId}/message_templates`, {
    method: "POST",
    body: JSON.stringify({ name: input.name, language: input.language, category: input.category, components }),
  });
}

/** Nome, idioma e categoria continuam os mesmos; a Meta revisa o conteúdo novo. */
export async function editTemplate(id: string, input: TemplateContent) {
  return graph<{ success: boolean }>(`/${id}`, { method: "POST", body: JSON.stringify({ components: await buildTemplateComponents(input) }) });
}

/** Consulta direta por nome: a listagem geral para em 100 modelos. */
export async function findTemplate(id: string, name: string) {
  const accountId = getAccountId();
  const found = await graph<{ data: { id: string; status: string }[] }>(`/${accountId}/message_templates?name=${encodeURIComponent(name)}&fields=id,status&limit=100`);
  return found.data.find((item) => item.id === id && !["DELETED", "PENDING_DELETION"].includes(item.status)) ?? null;
}

/**
 * Com hsm_id a Meta apaga só este idioma; só com o nome, apagaria todos.
 * Ler modelos não exige a atribuição da conta ao usuário do sistema; apagar exige.
 */
export async function deleteTemplate(id: string, name: string) {
  const accountId = getAccountId();
  const path = `/${accountId}/message_templates?hsm_id=${encodeURIComponent(id)}&name=${encodeURIComponent(name)}`;
  console.log(`[whatsapp/templates] DELETE ${GRAPH_API}${path}`);
  try {
    const result = await graph<{ success: boolean }>(path, { method: "DELETE" });
    console.log(`[whatsapp/templates] DELETE ${name}: ${JSON.stringify(result)}`);
    return result;
  } catch (error) {
    if (!(error instanceof MetaApiError)) throw error;
    console.error(`[whatsapp/templates] DELETE ${name}: HTTP ${error.httpStatus} ${JSON.stringify(error.details)}`);
    if (error.code === 100 && /need permission/i.test(error.message)) {
      throw new MetaApiError(
        `A Meta recusou a exclusão: o usuário do sistema não tem acesso à conta do WhatsApp ${accountId}. No Meta Business, atribua esta conta a ele com controle total. Se o erro continuar, gere um novo token com os escopos whatsapp_business_management e whatsapp_business_messaging e atualize o .env do servidor.`,
        error.code,
        error.httpStatus,
        error.details,
      );
    }
    throw error;
  }
}

export async function sendTemplate(
  phone: string,
  name: string,
  language: string,
  params: string[] = [],
  headerImage?: { mimetype: string; fileName: string; base64?: string; url?: string; mediaId?: string; kind?: "image" | "video" | "document" },
  headerParams: string[] = [],
) {
  const { phoneNumberId } = getConfig();
  const components: Record<string, unknown>[] = [];
  if (headerImage) {
    const id = headerImage.mediaId ?? await uploadMedia(headerImage);
    const kind = headerImage.kind ?? "image";
    components.push({ type: "header", parameters: [{ type: kind, [kind]: kind === "document" ? { id, filename: headerImage.fileName } : { id } }] });
  } else if (headerParams.length > 0) {
    components.push({ type: "header", parameters: headerParams.map((text) => ({ type: "text", text })) });
  }
  if (params.length > 0) {
    components.push({ type: "body", parameters: params.map((text) => ({ type: "text", text })) });
  }
  return graph<{ messages: { id: string }[] }>(`/${phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalizePhone(phone),
      type: "template",
      template: {
        name,
        language: { code: language },
        ...(components.length > 0 ? { components } : {}),
      },
    }),
  });
}

export async function getPhoneInfo() {
  const { phoneNumberId } = getConfig();
  const data = await graph<{
    display_phone_number?: string;
    verified_name?: string;
    status?: string;
    quality_rating?: string;
  }>(`/${phoneNumberId}?fields=display_phone_number,verified_name,status,quality_rating`);
  return {
    number: data.display_phone_number ?? null,
    verifiedName: data.verified_name ?? null,
    status: data.status ?? null,
    quality: data.quality_rating ?? null,
  };
}

const BLOCKER_TEXT: Record<number, { description: string; solution: string }> = {
  141006: {
    description: "Há um problema com a forma de pagamento da conta. Isso bloqueia o envio de mensagens iniciadas pela empresa.",
    solution: "Cadastre uma nova forma de pagamento na conta do WhatsApp Business no Meta Business.",
  },
  141010: {
    description: "A conta do WhatsApp Business não tem uma conta de pagamento vinculada.",
    solution: "Vincule uma conta de pagamento no Meta Business.",
  },
  141008: {
    description: "A conta de pagamento da conta do WhatsApp Business está inativa ou com pendências.",
    solution: "Regularize a conta de pagamento no Meta Business.",
  },
};

/**
 * Limite de mensagens (tier) do número e se a conta está apta a enviar.
 * `can_send_message` da WABA reflete problemas como forma de pagamento ausente.
 */
export async function getMessagingInfo() {
  const { phoneNumberId, accountId } = getConfig();
  const phone = await graph<{
    whatsapp_business_manager_messaging_limit?: string;
    throughput?: { level?: string };
  }>(`/${phoneNumberId}?fields=whatsapp_business_manager_messaging_limit,throughput`).catch(() => null);
  const waba = accountId
    ? await graph<{
        health_status?: {
          can_send_message?: string;
          entities?: { entity_type?: string; can_send_message?: string; errors?: { error_code?: number; error_description?: string; possible_solution?: string }[] }[];
        };
      }>(`/${accountId}?fields=health_status`).catch(() => null)
    : null;
  const tier = phone?.whatsapp_business_manager_messaging_limit ?? null;
  const tierMatch = tier ? /^TIER_(\d+)(K)?$/.exec(tier) : null;
  const dailyLimit = tierMatch ? Number(tierMatch[1]) * (tierMatch[2] ? 1000 : 1) : tier === "TIER_UNLIMITED" ? -1 : null;
  const blockers = (waba?.health_status?.entities ?? []).flatMap((entity) =>
    (entity.errors ?? []).map((error) => {
      const known = error.error_code ? BLOCKER_TEXT[error.error_code] : undefined;
      return {
        code: error.error_code ?? null,
        description: known?.description ?? error.error_description ?? "",
        solution: known?.solution ?? error.possible_solution ?? "",
      };
    }),
  );
  return {
    tier,
    dailyLimit,
    throughput: phone?.throughput?.level ?? null,
    canSendMessage: waba?.health_status?.can_send_message ?? null,
    blockers,
  };
}

/**
 * Check the phone number quality and status.
 * Returns connection state compatible with the existing UI.
 */
export async function getConnectionState(): Promise<string> {
  try {
    const { phoneNumberId } = getConfig();
    const data = await graph<{
      id: string;
      verified_name?: string;
      code_verification_status?: string;
      display_phone_number?: string;
      quality_rating?: string;
      platform_type?: string;
      throughput?: { level?: string };
      name_status?: string;
      status?: string;
    }>(`/${phoneNumberId}?fields=verified_name,code_verification_status,display_phone_number,quality_rating,platform_type,name_status,status`);

    // Meta API phone numbers are always "connected" if the API responds successfully
    // The status field indicates registration status
    if (data.status === "BANNED" || data.code_verification_status === "REJECTED") {
      return "close";
    }
    return "open";
  } catch {
    return "close";
  }
}

/**
 * Get the connected phone number from Meta API.
 */
export async function getConnectedNumber(): Promise<string | null> {
  try {
    const { phoneNumberId } = getConfig();
    const data = await graph<{
      id: string;
      display_phone_number?: string;
    }>(`/${phoneNumberId}?fields=display_phone_number`);

    return data.display_phone_number ? `+${data.display_phone_number.replace(/\D/g, "")}` : null;
  } catch {
    return null;
  }
}

/**
 * No-op for Meta API compatibility.
 * Meta Cloud API doesn't need instance creation — the phone number is pre-registered.
 */
export async function ensureInstance() {
  // Nothing to do — Meta Cloud API uses pre-registered phone numbers
}

/**
 * Not applicable for Meta Cloud API.
 * Returns empty object since there's no QR code pairing flow.
 */
export function connectInstance() {
  return Promise.resolve({ base64: null, pairingCode: null });
}

/**
 * Not applicable for Meta Cloud API.
 * Deregistration would require Meta Business Suite, not an API call.
 */
export function logoutInstance() {
  return Promise.resolve({ ok: true });
}