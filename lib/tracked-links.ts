import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * Encurtador/rastreador nativo: /r/<slug> identifica o contato, registra o clique, dispara o gatilho
 * "Clicou em link rastreado" e redireciona para o destino.
 */

const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?]/gi;

export const publicBaseUrl = () => (process.env.PUBLIC_LINK_BASE_URL || process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "https://crm.oticasbrasil.com.br").replace(/\/+$/, "");
export const shortUrl = (slug: string) => `${publicBaseUrl()}/r/${slug}`;

function newSlug(length = 7) {
  const bytes = randomBytes(length);
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

export async function createTrackedLink(input: { url: string; contactId?: string | null; flowId?: string | null; source?: string; label?: string }) {
  const url = new URL(input.url.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Use um link http(s).");
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const link = await prisma.trackedLink.create({ data: { slug: newSlug(), url: url.toString(), contactId: input.contactId ?? null, flowId: input.flowId ?? null, source: input.source ?? "manual", label: (input.label ?? "").slice(0, 120) } });
      return { ...link, shortUrl: shortUrl(link.slug) };
    } catch (error) {
      if (attempt === 4) throw error;
    }
  }
  throw new Error("Não foi possível gerar o link.");
}

/** Troca cada URL do texto por um link curto rastreado do contato (links já encurtados ficam como estão). */
export async function trackLinksInText(text: string, input: { contactId: string; flowId?: string | null; source?: string }) {
  const base = publicBaseUrl();
  const urls = [...new Set(text.match(URL_PATTERN) ?? [])].filter((url) => !url.startsWith(`${base}/r/`));
  let result = text;
  for (const url of urls) {
    const link = await createTrackedLink({ url, contactId: input.contactId, flowId: input.flowId, source: input.source ?? "automacao" }).catch(() => null);
    if (link) result = result.split(url).join(link.shortUrl);
  }
  return { text: result, tracked: urls.length };
}
