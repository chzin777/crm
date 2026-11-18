/**
 * Webhook de entrada (Meta Ads, Google Ads, Typeform, landing pages): achata o JSON recebido em caminhos
 * ("lead.phone", "answers.0.email"), acha nome/telefone/e-mail/origem pelo mapeamento do nó (ou por palpite)
 * e gera as variáveis do fluxo. Puro: testável e usado na rota pública e na tela de "Escutar evento de teste".
 */

const MAX_FIELDS = 150;
const MAX_DEPTH = 6;

/** Formato "field_data": [{ name, values: [...] }] (Meta Lead Ads via Zapier/Make) vira name → primeiro valor. */
function namedValues(list: unknown[]): Record<string, unknown> | null {
  if (!list.length || !list.every((item) => item && typeof item === "object" && "name" in item && ("values" in item || "value" in item))) return null;
  return Object.fromEntries(list.map((item) => {
    const row = item as { name: unknown; values?: unknown; value?: unknown };
    return [String(row.name), Array.isArray(row.values) ? row.values[0] : row.value ?? row.values];
  }));
}

export function flattenPayload(input: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (value: unknown, path: string, depth: number) => {
    if (Object.keys(out).length >= MAX_FIELDS || depth > MAX_DEPTH) return;
    if (value === null || value === undefined) return;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      if (path) out[path] = String(value).slice(0, 500);
      return;
    }
    if (Array.isArray(value)) {
      const named = namedValues(value);
      if (named) return walk(named, path, depth + 1);
      value.slice(0, 30).forEach((item, index) => walk(item, path ? `${path}.${index}` : String(index), depth + 1));
      return;
    }
    if (typeof value === "object") for (const [key, item] of Object.entries(value as Record<string, unknown>)) walk(item, path ? `${path}.${key}` : key, depth + 1);
  };
  walk(input, "", 0);
  return out;
}

const plain = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const lastKey = (path: string) => plain(path.split(".").filter((part) => !/^\d+$/.test(part)).pop() ?? path);

const GUESS: Record<LeadKey, RegExp> = {
  phone: /(phone|telefone|celular|whats|fone|mobile|tel)/,
  name: /^(full_?name|nome(_completo)?|name|first_?name|cliente)$/,
  email: /e-?mail/,
  source: /^(utm_source|source|origem|fonte|campaign|utm_campaign)$/,
};

export type LeadKey = "phone" | "name" | "email" | "source";
export type LeadMapping = Partial<Record<LeadKey, string>>;
export type Lead = { phone: string; name: string; email: string; source: string };

/** Primeiro caminho cujo nome parece o campo (telefone com ao menos 10 dígitos, e-mail com @). */
export function guessField(fields: Record<string, string>, key: LeadKey): string {
  return Object.keys(fields).find((path) => {
    if (!GUESS[key].test(lastKey(path))) return false;
    if (key === "phone") return fields[path].replace(/\D/g, "").length >= 10;
    if (key === "email") return fields[path].includes("@");
    return !!fields[path].trim();
  }) ?? "";
}

/** Telefone no formato do WhatsApp (55 + DDD + número); vazio se não parece um telefone do Brasil. */
export function leadPhone(raw: string) {
  const digits = raw.replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return digits;
  return "";
}

export function extractLead(fields: Record<string, string>, mapping: LeadMapping): Lead {
  const read = (key: LeadKey) => {
    const path = (mapping[key] ?? "").trim() || guessField(fields, key);
    return (path ? fields[path] ?? "" : "").trim();
  };
  const first = read("name");
  // Formulários com nome e sobrenome separados.
  const last = Object.entries(fields).find(([path]) => /^(last_?name|sobrenome)$/.test(lastKey(path)))?.[1] ?? "";
  const name = first && last && !first.includes(" ") ? `${first} ${last}` : first;
  const email = read("email");
  return { phone: leadPhone(read("phone")), name: name.slice(0, 120), email: email.includes("@") ? email.slice(0, 160).toLowerCase() : "", source: read("source").slice(0, 120) };
}

/** Variáveis do fluxo: cada caminho vira {{caminho_com_underscore}} (ex.: {{utm_source}}, {{lead_phone}}). */
export function payloadVars(fields: Record<string, string>): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [path, value] of Object.entries(fields)) {
    const key = plain(path).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60);
    if (key && !(key in vars)) vars[key] = value;
    if (Object.keys(vars).length >= 60) break;
  }
  return vars;
}

/** Corpo do POST: JSON, formulário (landing page) ou query string. */
export async function readWebhookBody(request: Request): Promise<unknown> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    if (!form) return null;
    const out: Record<string, string> = {};
    form.forEach((value, key) => { if (typeof value === "string") out[key] = value; });
    return out;
  }
  const text = await request.text().catch(() => "");
  if (!text.trim()) return Object.fromEntries(new URL(request.url).searchParams);
  try {
    return JSON.parse(text);
  } catch {
    return Object.fromEntries(new URLSearchParams(text));
  }
}
