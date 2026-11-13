import { matchesRegion, storeLabel, type StoreInfo } from "@/lib/ai/stock";

/**
 * Localização da loja (tool enviarLocalizacaoLoja): pin nativo do WhatsApp quando a loja tem latitude/longitude
 * no cadastro; senão, link direto do Google Maps pelo endereço. Sem banco nem rede.
 */

export type StoreLocation = {
  code: string;
  nome: string;
  endereco: string;
  latitude: number | null;
  longitude: number | null;
  mapsUrl: string;
  /** true = sai como mensagem de localização (pin) no WhatsApp; false = link do Google Maps no texto. */
  pinNativo: boolean;
};

const hasCoords = (store: StoreInfo) => typeof store.lat === "number" && typeof store.lng === "number" && Number.isFinite(store.lat) && Number.isFinite(store.lng) && !(store.lat === 0 && store.lng === 0);

/** Endereço completo para o mapa: rua, número, bairro, cidade. */
export function fullAddress(store: StoreInfo) {
  const number = store.addressNumber && !/^s\/?n$/i.test(store.addressNumber.trim()) ? store.addressNumber.trim() : "";
  return [[store.address?.trim(), number].filter(Boolean).join(", "), store.neighborhood?.trim(), store.city?.trim()].filter(Boolean).join(" - ");
}

/** Link do Google Maps: pelas coordenadas quando houver; senão pelo endereço (busca). */
export function googleMapsUrl(store: StoreInfo) {
  const query = hasCoords(store) ? `${store.lat},${store.lng}` : `Óticas Brasil ${fullAddress(store)}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function storeLocation(code: string, store: StoreInfo): StoreLocation {
  const label = storeLabel(code, store);
  const [nome, endereco] = label.split(" — ");
  const pin = hasCoords(store);
  return {
    code,
    nome: `Óticas Brasil - ${nome}`,
    endereco: endereco ?? fullAddress(store),
    latitude: pin ? store.lat! : null,
    longitude: pin ? store.lng! : null,
    mapsUrl: googleMapsUrl(store),
    pinNativo: pin,
  };
}

/** Loja pedida pelo cliente ("Setor Bueno", "loja 17", "Marista"): todas as que casam (a IA pede para escolher se houver mais de uma). */
export function findStores(stores: Map<string, StoreInfo>, wanted: string) {
  const found: { code: string; store: StoreInfo }[] = [];
  for (const [code, store] of stores) if (matchesRegion(code, store, wanted)) found.push({ code, store });
  return found;
}

/** Corpo da mensagem nativa de localização da WhatsApp Cloud API. */
export function locationPayload(to: string, location: StoreLocation) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "location",
    location: { latitude: location.latitude, longitude: location.longitude, name: location.nome, address: location.endereco },
  };
}

/** Texto da localização (registro no chat e fallback sem coordenadas): nome, endereço e link do Maps. */
export function locationText(location: StoreLocation) {
  return `📍 *${location.nome}*\n${location.endereco}\n${location.mapsUrl}`;
}

/**
 * Envio da localização: pin nativo quando há coordenadas; sem coordenadas (ou se o pin falhar), o link clicável
 * do Google Maps com o endereço. Nunca só o endereço em texto seco.
 */
export async function deliverLocation(location: StoreLocation, deps: { sendPin: () => Promise<unknown>; sendText: (text: string) => Promise<unknown> }) {
  if (location.pinNativo) {
    try {
      await deps.sendPin();
      return "pin" as const;
    } catch {
      // Pin recusado pela Meta: segue com o link.
    }
  }
  await deps.sendText(locationText(location));
  return "link" as const;
}

export const LOCATION_TOOL = {
  type: "function" as const,
  function: {
    name: "enviarLocalizacaoLoja",
    description: "Envia ao cliente a localização da loja no mapa (pin do WhatsApp ou link do Google Maps), logo depois da sua resposta. Use quando o cliente pedir localização, mapa, como chegar ou onde fica uma loja.",
    parameters: {
      type: "object",
      properties: {
        nomeLoja: { type: "string", description: "Loja citada na conversa: bairro, nome ou número, ex.: \"Setor Bueno\", \"LJ 17\"." },
      },
      required: ["nomeLoja"],
      additionalProperties: false,
    },
  },
};

/** Regra fixa do prompt: pedido de localização vira pin/link de verdade. */
export const LOCATION_RULES = [
  "LOCALIZAÇÃO (regra fixa): quando o cliente pedir a localização, o mapa, como chegar ou onde fica a loja, chame enviarLocalizacaoLoja com a loja da conversa. A localização (pin no mapa ou link do Google Maps) é enviada automaticamente logo depois da sua resposta.",
  "Nesse caso responda curto, sem repetir o endereço inteiro (ex.: \"Claro! Te mandei a localização da *Loja Setor Bueno* aqui embaixo 👇\"). Se a ferramenta devolver mais de uma loja possível, pergunte qual delas. Nunca diga que não consegue mandar a localização.",
].join("\n");
