import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { cached, invalidateCache } from "@/lib/cache";
import { normalizePlace, normalizePlaceList } from "@/lib/store-places";
import { clearStoreDirectory } from "@/lib/ai/stock-db";
import { coordinatesFromMapsLink } from "@/lib/store-pin";

const storeSchema = z.object({
  number: z.number().int().positive(),
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(200).optional().default(""),
  addressNumber: z.string().trim().max(40).optional().default(""),
  complement: z.string().trim().max(200).optional().default(""),
  postalCode: z.string().trim().max(16).optional().default(""),
  city: z.string().trim().max(120).optional().default(""),
  state: z.string().trim().max(2).optional().default(""),
  neighborhoods: z.array(z.string().max(120)).max(1),
  radiusKm: z.number().min(0).max(200).optional().default(20),
  active: z.boolean(),
  /** Link do Google Maps ou "lat, lng" do pin exato; vazio remove o pin manual; ausente mantém. */
  mapsLink: z.string().trim().max(2000).optional(),
});

type PinFields = { pinLat: number | null; pinLng: number | null; pinSource: string | null; pinUrl: string | null };
type StoreAddress = { address: string | null; addressNumber: string | null; city: string | null; pinLat: number | null; pinLng: number | null; pinSource: string | null; pinUrl: string | null };

/** Texto do pin mostrado no formulário: o link colado ou as coordenadas. */
const pinDisplay = (store: Pick<StoreAddress, "pinUrl" | "pinLat" | "pinLng">) => store.pinUrl || (store.pinLat !== null && store.pinLng !== null ? `${store.pinLat}, ${store.pinLng}` : "");

/**
 * Pin exato da loja a partir do link colado: coordenadas do link (ou do link curto, seguindo o redirecionamento).
 * Sem link novo, mantém; endereço alterado zera o pin automático (é geocodificado de novo no próximo pedido).
 */
async function pinChanges(input: z.infer<typeof storeSchema>, previous: StoreAddress | null): Promise<Partial<PinFields> | { error: string }> {
  const link = input.mapsLink;
  if (link !== undefined && (!previous || link !== pinDisplay(previous))) {
    if (!link) return { pinLat: null, pinLng: null, pinSource: null, pinUrl: null };
    const coords = await coordinatesFromMapsLink(link);
    if (!coords) return { error: "Não encontrei as coordenadas nesse link. Abra a loja no Google Maps, copie o link da barra de endereço (com @latitude,longitude) ou cole as coordenadas (ex.: -16.8234, -49.2456)." };
    return { pinLat: coords.lat, pinLng: coords.lng, pinSource: "manual", pinUrl: /^https?:\/\//i.test(link) ? link : null };
  }
  const moved = previous && ((previous.address ?? "") !== (input.address || "") || (previous.addressNumber ?? "") !== (input.addressNumber || "") || (previous.city ?? "") !== (input.city ? normalizePlace(input.city) : ""));
  if (moved && previous?.pinSource !== "manual") return { pinLat: null, pinLng: null, pinSource: null, pinUrl: null };
  return {};
}

function serialize(store: { id: string; name: string; address: string | null; addressNumber: string | null; complement: string | null; postalCode: string | null; city: string | null; state: string | null; neighborhoods: string[]; active: boolean; kind: string | null; startDate: string | null; unitIds: string[]; radiusKm: number; lat: number | null; pinLat: number | null; pinLng: number | null; pinSource: string | null; pinUrl: string | null }) {
  return {
    id: store.id,
    name: store.name,
    address: store.address ?? "",
    addressNumber: store.addressNumber ?? "",
    complement: store.complement ?? "",
    postalCode: store.postalCode ?? "",
    city: store.city ?? "",
    state: store.state ?? "",
    neighborhoods: store.neighborhoods,
    radiusKm: store.radiusKm,
    located: store.lat !== null,
    mapsLink: pinDisplay(store),
    pinSource: store.pinLat !== null ? store.pinSource ?? "" : "",
    active: store.active,
    kind: store.kind ?? "",
    startDate: store.startDate ?? "",
    unitCount: store.unitIds.length,
  };
}

function toData(input: z.infer<typeof storeSchema>) {
  return {
    number: input.number,
    name: input.name,
    address: input.address || null,
    addressNumber: input.addressNumber || null,
    complement: input.complement || null,
    postalCode: input.postalCode || null,
    city: input.city ? normalizePlace(input.city) : null,
    state: input.state ? input.state.toUpperCase() : null,
    neighborhoods: normalizePlaceList(input.neighborhoods),
    radiusKm: input.radiusKm,
    lat: null,
    lng: null,
    active: input.active,
  };
}

export async function GET(request: Request) {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const url = new URL(request.url);
  const sortByRaw = url.searchParams.get("sortBy") || "name";
  const sortOrderRaw = url.searchParams.get("sortOrder") || "asc";

  const allowedSortFields: Record<string, string> = {
    loja: "name",
    
    number: "name",
    nome: "name",
    name: "name",
    cidade: "city",
    city: "city",
    bairro: "neighborhoods",
    neighborhoods: "neighborhoods",
    status: "active",
    active: "active",
    contatos: "unitCount",
    unitCount: "unitCount",
  };
  const sortField = allowedSortFields[sortByRaw] ?? "number";
  const sortOrder = sortOrderRaw === "desc" ? "desc" : "asc";

  // Campos compostos (como neighborhoods) não são ordenáveis diretamente no Prisma;
  // para esses, mantemos a ordenação por número como fallback seguro.
  const isSortableField = ["name", "city", "active"].includes(sortField);
  const effectiveSortField = isSortableField ? sortField : "name";
  const effectiveSortOrder = isSortableField ? sortOrder : "asc";

  const cacheKey = `stores:${effectiveSortField}:${effectiveSortOrder}`;
  const data = await cached(cacheKey, 300, async () => {
    const stores = await prisma.store.findMany({ orderBy: { [effectiveSortField]: effectiveSortOrder } });
    return stores.map(serialize);
  });
  return Response.json({ data });
}

export async function POST(request: Request) {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const parsed = storeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Dados da loja inválidos." }, { status: 400 });
  if (await prisma.store.findUnique({ where: { number: parsed.data.number } })) {
    return Response.json({ error: `Já existe a loja ${parsed.data.number}.` }, { status: 409 });
  }
  const pin = await pinChanges(parsed.data, null);
  if ("error" in pin) return Response.json({ error: pin.error }, { status: 400 });
  const store = await prisma.store.create({ data: { ...toData(parsed.data), ...pin } });
  clearStoreDirectory();
  await invalidateCache("stores", "audience:store:");
  return Response.json({ data: serialize(store) }, { status: 201 });
}

export async function PATCH(request: Request) {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const body = await request.json().catch(() => null) as { id?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  const parsed = storeSchema.safeParse(body);
  if (!id || !parsed.success) return Response.json({ error: "Dados da loja inválidos." }, { status: 400 });
  const duplicate = await prisma.store.findUnique({ where: { number: parsed.data.number } });
  if (duplicate && duplicate.id !== id) {
    return Response.json({ error: `Já existe a loja ${parsed.data.number}.` }, { status: 409 });
  }
  const previous = await prisma.store.findUnique({ where: { id }, select: { address: true, addressNumber: true, city: true, pinLat: true, pinLng: true, pinSource: true, pinUrl: true } });
  if (!previous) return Response.json({ error: "Loja não encontrada." }, { status: 404 });
  const pin = await pinChanges(parsed.data, previous);
  if ("error" in pin) return Response.json({ error: pin.error }, { status: 400 });
  const store = await prisma.store.update({ where: { id }, data: { ...toData(parsed.data), ...pin } }).catch(() => null);
  if (!store) return Response.json({ error: "Loja não encontrada." }, { status: 404 });
  clearStoreDirectory();
  await invalidateCache("stores", "audience:store:");
  return Response.json({ data: serialize(store) });
}

export async function DELETE(request: Request) {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) return Response.json({ error: "Loja inválida." }, { status: 400 });
  await prisma.store.delete({ where: { id } }).catch(() => null);
  await invalidateCache("stores", "audience:store:");
  return Response.json({ ok: true });
}
