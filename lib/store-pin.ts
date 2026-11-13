import "server-only";
import { prisma } from "@/lib/prisma";
import { geocodeStoreAddress, isGenericCoordinate, isShortMapsLink, parseMapsCoordinates, type Coordinates } from "@/lib/ai/store-geolocation";

/** Endereço comparável para detectar a mesma coordenada em lojas diferentes. */
const addressKey = (store: { address: string | null; addressNumber: string | null; city: string | null }) =>
  [store.address, store.addressNumber, store.city].filter(Boolean).join(" ").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Coordenadas do link colado no cadastro: lê direto da URL ou, em link curto do app ("maps.app.goo.gl"),
 * segue o redirecionamento (até 5 s) para achar o ponto.
 */
export async function coordinatesFromMapsLink(link: string): Promise<Coordinates | null> {
  const direct = parseMapsCoordinates(link);
  if (direct || !isShortMapsLink(link)) return direct;
  try {
    const response = await fetch(link.trim(), { redirect: "follow", signal: AbortSignal.timeout(5000), headers: { "User-Agent": "Mozilla/5.0" } });
    return parseMapsCoordinates(response.url) ?? parseMapsCoordinates(await response.text().catch(() => ""));
  } catch {
    return null;
  }
}

/**
 * Garante o pin exato da loja: usa o manual/salvo; senão geocodifica o endereço em nível de rua (Google com chave,
 * senão Nominatim estruturado) e salva. Centro de cidade/bairro ou ponto já usado por outra loja não é salvo
 * (fica "unresolved" e a IA manda o link de busca pelo endereço).
 */
export async function ensureStorePin(id: string): Promise<Coordinates | null> {
  const store = await prisma.store.findUnique({ where: { id }, select: { id: true, address: true, addressNumber: true, neighborhoods: true, city: true, state: true, pinLat: true, pinLng: true, pinSource: true } });
  if (!store) return null;
  if (store.pinLat !== null && store.pinLng !== null) return { lat: store.pinLat, lng: store.pinLng };
  if (store.pinSource === "unresolved") return null;
  const found = await geocodeStoreAddress(
    { address: store.address, addressNumber: store.addressNumber, neighborhood: store.neighborhoods[0] ?? null, city: store.city, state: store.state },
    { fetch: (url, init) => fetch(url, init), googleKey: process.env.GOOGLE_MAPS_API_KEY?.trim() || null, timeoutMs: 4000 },
  ).catch(() => null);
  const others = found
    ? (await prisma.store.findMany({ where: { id: { not: id }, pinLat: { not: null } }, select: { pinLat: true, pinLng: true, address: true, addressNumber: true, city: true } }))
      .map((other) => ({ coords: { lat: other.pinLat!, lng: other.pinLng! }, addressKey: addressKey(other) }))
    : [];
  if (!found || isGenericCoordinate(found, others, addressKey(store))) {
    await prisma.store.update({ where: { id }, data: { pinSource: "unresolved" } });
    return null;
  }
  await prisma.store.update({ where: { id }, data: { pinLat: found.lat, pinLng: found.lng, pinSource: found.source } });
  return { lat: found.lat, lng: found.lng };
}
