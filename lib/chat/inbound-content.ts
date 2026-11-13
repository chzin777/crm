import type { AttachmentKind } from "@/lib/chat/media-rules";
import { productSelectRef, selectionText } from "@/lib/ai/interactive-showcase";

/** Leitura pura do payload da Meta (sem banco), separada de inbound.ts para poder ser testada. */
export type MetaMedia = { id?: string; mime_type?: string; caption?: string; filename?: string };

export type MetaInboundMessage = {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  context?: { id?: string };
  text?: { body?: string };
  image?: MetaMedia;
  video?: MetaMedia;
  audio?: MetaMedia;
  document?: MetaMedia;
  sticker?: MetaMedia;
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
  contacts?: { name?: { formatted_name?: string }; phones?: { phone?: string }[] }[];
  button?: { text?: string };
  interactive?: { type?: string; button_reply?: { id?: string; title?: string }; list_reply?: { id?: string; title?: string; description?: string } };
};

export const MEDIA_LABELS: Record<AttachmentKind, string> = {
  image: "[Imagem]",
  video: "[Vídeo]",
  audio: "[Áudio]",
  document: "[Documento]",
  sticker: "[Figurinha]",
};

function describeLocation(location: NonNullable<MetaInboundMessage["location"]>) {
  const place = [location.name, location.address].filter(Boolean).join(" - ");
  const coordinates = location.latitude !== undefined && location.longitude !== undefined ? `https://maps.google.com/?q=${location.latitude},${location.longitude}` : "";
  return ["📍 Localização", place, coordinates].filter(Boolean).join("\n");
}

function describeContacts(contacts: NonNullable<MetaInboundMessage["contacts"]>) {
  return contacts.map((item) => `👤 ${item.name?.formatted_name ?? "Contato"} ${item.phones?.[0]?.phone ?? ""}`.trim()).join("\n");
}

/**
 * Só o que o cliente realmente enviou. "system" (troca de número, chave de segurança),
 * "reaction", "ephemeral" e "request_welcome" são avisos de protocolo da Meta.
 * "unsupported" fica: é mensagem do cliente que a API não sabe ler (ex.: visualização única).
 */
const CUSTOMER_TYPES = new Set(["text", "image", "video", "audio", "document", "sticker", "location", "contacts", "button", "interactive", "order", "unsupported"]);
export const isCustomerMessage = (type: string | undefined) => CUSTOMER_TYPES.has(type ?? "");

/** Motivo curto e sem dado sensível da falha no download da mídia (o detalhe fica só no log do servidor). */
export function mediaFailureReason(detail: string) {
  if (/limite|too large|maxBytes/i.test(detail)) return "arquivo acima de 16 MB";
  if (/\b(401|403)\b|token|OAuth|expired|expirad/i.test(detail)) return "falha de autorização ao baixar do WhatsApp";
  if (/\b404\b|not found/i.test(detail)) return "arquivo não está mais disponível no WhatsApp";
  return "falha ao baixar o arquivo do WhatsApp";
}

export function readContent(message: MetaInboundMessage): { text: string; media: (MetaMedia & { kind: AttachmentKind }) | null; /** Referência escolhida na lista interativa da vitrine. */ selectedProductRef?: string } {
  switch (message.type) {
    case "text":
      return { text: message.text?.body ?? "", media: null };
    case "image":
    case "video":
    case "audio":
    case "document":
    case "sticker": {
      const media = message[message.type];
      return { text: media?.caption ?? "", media: media?.id ? { ...media, kind: message.type } : null };
    }
    case "location":
      return { text: message.location ? describeLocation(message.location) : "📍 Localização", media: null };
    case "contacts":
      return { text: message.contacts ? describeContacts(message.contacts) : "👤 Contato", media: null };
    case "button":
      return { text: message.button?.text ?? "[Botão]", media: null };
    case "interactive": {
      // Modelo escolhido na vitrine interativa: texto legível no histórico ("Quero ver o modelo: ...").
      const reply = message.interactive?.list_reply;
      const ref = productSelectRef(reply?.id);
      if (ref) return { text: selectionText(ref, reply?.title, reply?.description), media: null, selectedProductRef: ref };
      return { text: message.interactive?.button_reply?.title ?? reply?.title ?? "[Resposta interativa]", media: null };
    }
    default:
      return { text: `[Mensagem do tipo ${message.type ?? "desconhecido"}]`, media: null };
  }
}
