/**
 * Meta WhatsApp Cloud API client
 * Replaces Evolution API with official WhatsApp Business integration.
 *
 * Credentials (test environment):
 *   META_WHATSAPP_PHONE_NUMBER_ID  – Phone number ID from Meta Business Suite
 *   META_WHATSAPP_ACCESS_TOKEN     – Permanent or temporary access token
 *   META_WHATSAPP_ACCOUNT_ID       – WhatsApp Business Account ID
 */

const GRAPH_API = "https://graph.facebook.com/v21.0";

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

async function graph<T>(path: string, init?: RequestInit): Promise<T> {
  const { accessToken } = getConfig();
  const url = `${GRAPH_API}${path}`;

  let response: Response;
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
  } catch {
    throw new Error("Não foi possível conectar à Meta WhatsApp API. Verifique sua conexão.");
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMsg = body?.error?.message ?? body?.error?.error_user_msg ?? JSON.stringify(body?.error ?? body);
    const code = Number(body?.error?.code);
    throw new MetaApiError(`Meta WhatsApp API: ${errorMsg}`, Number.isFinite(code) ? code : undefined, response.status);
  }

  return body as T;
}

export class MetaApiError extends Error {
  constructor(message: string, public code?: number, public httpStatus?: number) {
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
export async function sendText(phone: string, text: string) {
  const { phoneNumberId } = getConfig();
  const to = normalizePhone(phone);

  return graph<{ messages: { id: string }[] }>(`/${phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body: text },
    }),
  });
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
) {
  const { phoneNumberId } = getConfig();
  const to = normalizePhone(phone);

  // Upload media first
  const mediaId = await uploadMedia(file);

  // Determine media type
  let type: string;
  let payload: Record<string, unknown>;

  if (file.mimetype.startsWith("image/")) {
    type = "image";
    payload = { image: { id: mediaId, ...(caption ? { caption } : {}) } };
  } else if (file.mimetype.startsWith("video/")) {
    type = "video";
    payload = { video: { id: mediaId, ...(caption ? { caption } : {}) } };
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
      type,
      ...payload,
    }),
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
  rejectedReason?: string;
};

type TemplateComponent = { type: string; format?: string; text?: string; buttons?: TemplateButton[]; example?: { header_handle?: string[] } };

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
  return data.data.filter((item) => item.name !== "hello_world").map((item) => ({
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

export async function createTemplate(input: {
  name: string;
  language: string;
  category: "UTILITY" | "MARKETING";
  body: string;
  examples: string[];
  footer?: string;
  buttons?: TemplateButton[];
  headerImage?: { mimetype: string; fileName: string; buffer: Buffer };
}) {
  const accountId = getAccountId();
  const components: Record<string, unknown>[] = [];
  if (input.headerImage) {
    const handle = await uploadTemplateSample(input.headerImage);
    components.push({ type: "HEADER", format: "IMAGE", example: { header_handle: [handle] } });
  }
  const body: { type: "BODY"; text: string; example?: { body_text: string[][] } } = { type: "BODY", text: input.body };
  if (input.examples.length > 0) body.example = { body_text: [input.examples] };
  components.push(body);
  if (input.footer) components.push({ type: "FOOTER", text: input.footer });
  if (input.buttons && input.buttons.length > 0) components.push({ type: "BUTTONS", buttons: input.buttons });
  return graph<{ id: string; status: string; category: string }>(`/${accountId}/message_templates`, {
    method: "POST",
    body: JSON.stringify({ name: input.name, language: input.language, category: input.category, components }),
  });
}

export async function sendTemplate(
  phone: string,
  name: string,
  language: string,
  params: string[] = [],
  headerImage?: { mimetype: string; fileName: string; base64?: string; url?: string; mediaId?: string },
) {
  const { phoneNumberId } = getConfig();
  const components: Record<string, unknown>[] = [];
  if (headerImage) {
    const id = headerImage.mediaId ?? await uploadMedia(headerImage);
    components.push({ type: "header", parameters: [{ type: "image", image: { id } }] });
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