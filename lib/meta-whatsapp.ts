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
    throw new Error(`Meta WhatsApp API: ${errorMsg}`);
  }

  return body as T;
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
async function uploadMedia(file: { mimetype: string; fileName: string; base64?: string; url?: string }): Promise<string> {
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
  const blob = new Blob([buffer], { type: file.mimetype });
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