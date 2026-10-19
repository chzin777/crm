const BASE_URL = process.env.EVOLUTION_API_URL?.replace(/\/+$/, "");
const API_KEY = process.env.EVOLUTION_API_KEY;
const INSTANCE = process.env.EVOLUTION_INSTANCE ?? "crm";

async function evolution<T>(path: string, init?: RequestInit): Promise<T> {
  if (!BASE_URL || !API_KEY) {
    throw new Error("Evolution API não configurada. Defina EVOLUTION_API_URL e EVOLUTION_API_KEY no .env.");
  }
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      cache: "no-store",
      headers: { "Content-Type": "application/json", apikey: API_KEY, ...init?.headers },
    });
  } catch {
    throw new Error(`Não foi possível conectar à Evolution API em ${BASE_URL}. Verifique se ela está rodando.`);
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = body?.response?.message ?? body?.message ?? response.statusText;
    throw new Error(`Evolution API: ${Array.isArray(detail) ? detail.join(", ") : JSON.stringify(detail)}`);
  }
  return body as T;
}

export function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) throw new Error("Telefone inválido.");
  return digits.startsWith("55") && digits.length >= 12 ? digits : `55${digits}`;
}

export function sendText(phone: string, text: string) {
  return evolution(`/message/sendText/${INSTANCE}`, {
    method: "POST",
    body: JSON.stringify({ number: normalizePhone(phone), text }),
  });
}

export function sendMedia(phone: string, file: { mimetype: string; fileName: string; base64?: string; url?: string }, caption?: string) {
  const mediatype = file.mimetype.startsWith("image/") ? "image" : file.mimetype.startsWith("video/") ? "video" : "document";
  return evolution(`/message/sendMedia/${INSTANCE}`, {
    method: "POST",
    body: JSON.stringify({
      number: normalizePhone(phone),
      mediatype,
      mimetype: file.mimetype,
      fileName: file.fileName,
      caption: caption || undefined,
      ...(file.url ? { mediaUrl: file.url } : { media: file.base64 }),
    }),
  });
}

export async function getConnectionState(): Promise<string> {
  try {
    const data = await evolution<{ instance?: { state?: string } }>(`/instance/connectionState/${INSTANCE}`);
    return data.instance?.state ?? "unknown";
  } catch {
    return "close";
  }
}

export async function getConnectedNumber(): Promise<string | null> {
  type InstanceInfo = {
    instanceName?: string;
    name?: string;
    number?: string | null;
    ownerJid?: string | null;
  };
  type InstanceResponse = InstanceInfo & { instance?: InstanceInfo };
  const data = await evolution<InstanceResponse | InstanceResponse[]>(
    `/instance/fetchInstances?instanceName=${encodeURIComponent(INSTANCE)}`,
  );
  const instances = Array.isArray(data) ? data : [data.instance ?? data];
  const instance = instances.find((item) => item.instanceName === INSTANCE || item.name === INSTANCE) ?? instances[0];
  const phone = instance?.ownerJid?.split("@")[0]?.split(":")[0] ?? instance?.number;
  const digits = phone?.replace(/\D/g, "");
  return digits ? `+${digits}` : null;
}

export async function ensureInstance() {
  try {
    await evolution(`/instance/create`, {
      method: "POST",
      body: JSON.stringify({ instanceName: INSTANCE, integration: "WHATSAPP-BAILEYS", qrcode: true }),
    });
  } catch {
    // instância já existe
  }
}

export function connectInstance() {
  return evolution<{ base64?: string; code?: string; pairingCode?: string }>(`/instance/connect/${INSTANCE}`);
}

export function logoutInstance() {
  return evolution(`/instance/logout/${INSTANCE}`, { method: "DELETE" });
}
