import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { cached, invalidateCache } from "@/lib/cache";
import { normalizePlace, normalizePlaceList } from "@/lib/store-places";

const storeSchema = z.object({
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
});

function serialize(store: { id: string; name: string; address: string | null; addressNumber: string | null; complement: string | null; postalCode: string | null; city: string | null; state: string | null; neighborhoods: string[]; active: boolean; kind: string | null; startDate: string | null; unitIds: string[]; radiusKm: number; lat: number | null }) {
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
    active: store.active,
    kind: store.kind ?? "",
    startDate: store.startDate ?? "",
    unitCount: store.unitIds.length,
  };
}

function toData(input: z.infer<typeof storeSchema>) {
  return {
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
  if (await prisma.store.findUnique({ where: { name: parsed.data.name } })) {
    return Response.json({ error: `Já existe a loja "${parsed.data.name}".` }, { status: 409 });
  }
  const store = await prisma.store.create({ data: toData(parsed.data) });
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
  const duplicate = await prisma.store.findUnique({ where: { name: parsed.data.name } });
  if (duplicate && duplicate.id !== id) {
    return Response.json({ error: `Já existe a loja "${parsed.data.name}".` }, { status: 409 });
  }
  const store = await prisma.store.update({ where: { id }, data: toData(parsed.data) }).catch(() => null);
  if (!store) return Response.json({ error: "Loja não encontrada." }, { status: 404 });
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
