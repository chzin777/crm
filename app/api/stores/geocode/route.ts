import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { cachePlace, geocodePlace, pendingPlaces, placeKey, sleep } from "@/lib/geocode";

export const maxDuration = 60;

const BATCH = 6;

// Each call geocodes the store (if needed) and a small batch of contact neighborhoods, respecting the 1 request/second limit of Nominatim.
export async function POST(request: Request) {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const body = await request.json().catch(() => null) as { id?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  const store = id ? await prisma.store.findUnique({ where: { id } }) : null;
  if (!store) return Response.json({ error: "Loja não encontrada." }, { status: 404 });
  if (store.radiusKm <= 0) return Response.json({ pending: 0, storeLocated: true });

  try {
    const neighborhood = store.neighborhoods[0] ?? "";
    if (store.lat === null || store.lng === null) {
      if (!neighborhood || !store.city || !store.state) return Response.json({ pending: 0, storeLocated: false });
      const coords = await geocodePlace(neighborhood, store.city, store.state);
      await cachePlace(placeKey(neighborhood, store.city, store.state), coords);
      if (!coords) return Response.json({ pending: 0, storeLocated: false });
      await prisma.store.update({ where: { id }, data: { lat: coords.lat, lng: coords.lng } });
      await sleep(1100);
    }

    const { total, items } = await pendingPlaces(store.state ?? "", BATCH);
    for (const place of items) {
      await cachePlace(place.key, await geocodePlace(place.neighborhood, place.city, place.state));
      await sleep(1100);
    }
    return Response.json({ pending: Math.max(0, total - items.length), storeLocated: true });
  } catch {
    return Response.json({ error: "Não foi possível consultar o serviço de localização." }, { status: 502 });
  }
}
