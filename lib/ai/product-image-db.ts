import "server-only";
import { prisma } from "@/lib/prisma";
import { createProductImageService, imageQuery, imageSearchConfig, isUsableImage, photoCategory, rankByCategory, searchWebImages, type ImageCache } from "@/lib/ai/product-image";

/** Cache da foto por código do produto no banco do CRM (reaproveitado por todas as conversas). */
const cache: ImageCache = {
  get: (sku) => prisma.productImageCache.findUnique({ where: { sku } }),
  set: async (row) => {
    await prisma.productImageCache.upsert({ where: { sku: row.sku }, create: row, update: { query: row.query, imageUrl: row.imageUrl, source: row.source } });
  },
  // Foto recusada (download/formato/Meta): marca como "sem foto" para não reenviar a mesma URL quebrada.
  invalidate: async (sku) => {
    await prisma.productImageCache.updateMany({ where: { sku }, data: { imageUrl: null, source: "invalid" } });
  },
};

export const imageSearchStatus = () => imageSearchConfig(process.env);

export const searchAndCacheProductImage = createProductImageService({
  cache,
  search: (query) => searchWebImages(query, imageSearchConfig(process.env)),
  validate: (url) => isUsableImage(url),
});

export const invalidateProductImage = (sku: string) => cache.invalidate(sku).catch(() => undefined);

/**
 * Fotos do catálogo visual por código: primeiro as já cadastradas (cache válido); se faltar para chegar a `want`
 * modelos, busca na web (em paralelo, timeout curto) só para os primeiros modelos sem foto.
 */
export async function catalogImages(models: CatalogImageModel[], options: { want: number; web: boolean }): Promise<Record<string, string>> {
  const codes = [...new Set(models.flatMap((model) => model.codigos))].slice(0, 80);
  if (!codes.length) return {};
  const rows = await prisma.productImageCache.findMany({ where: { sku: { in: codes }, NOT: { imageUrl: null } }, select: { sku: true, imageUrl: true, query: true } }).catch(() => []);
  const bySku = new Map(rows.map((row) => [row.sku, row]));
  const images: Record<string, string> = {};
  // Foto em cache só vale se foi buscada já com o tipo do modelo (sol/grau) e a URL não indica o tipo oposto.
  for (const model of models) {
    const category = photoCategory(model.categoriaModelo);
    for (const code of model.codigos) {
      const row = bySku.get(code);
      if (!row?.imageUrl) continue;
      if (category && (!row.query.includes(imageQuery({ produto: "", categoria: model.categoriaModelo })) || !rankByCategory([row.imageUrl], category).length)) continue;
      images[code] = row.imageUrl;
    }
  }
  const withPhoto = models.filter((model) => model.codigos.some((code) => images[code])).length;
  if (options.web && withPhoto < options.want && imageSearchStatus()) {
    const missing = models.filter((model) => model.codigos.length && !model.codigos.some((code) => images[code])).slice(0, Math.max(0, options.want - withPhoto) + 3);
    const found = await Promise.all(missing.map((model) => searchAndCacheProductImage({ codigo: model.codigos[0], produto: imageProductName(model), categoria: model.categoriaModelo }).catch(() => null)));
    for (const image of found) if (image) images[image.sku] = image.url;
  }
  return validCatalogImages(images);
}

export type CatalogImageModel = { codigos: string[]; nomeComercial: string; referencia?: string | null; categoriaModelo?: string | null };

/** Nome para a busca da foto: nome comercial + referência legível ("Ray-Ban" + "0RB4340" → "Ray-Ban RB4340"). */
export function imageProductName(model: CatalogImageModel) {
  const ref = (model.referencia ?? "").replace(/^0(?=[A-Z])/i, "").trim();
  if (!ref || ref.startsWith("#")) return model.nomeComercial;
  return model.nomeComercial.toUpperCase().replace(/[^A-Z0-9]/g, "").includes(ref.toUpperCase().replace(/[^A-Z0-9]/g, "")) ? model.nomeComercial : `${model.nomeComercial} ${ref}`;
}

/**
 * Antes de montar o catálogo, cada foto é baixada de novo (HTTP 200, JPG/PNG, até 5 MB): a que falhar é invalidada
 * no cache e sai da lista, para a vitrine trocar o modelo pelo próximo com foto válida em vez de mandar só texto.
 */
const VALID_TTL_MS = 30 * 60 * 1000;
const recentlyValid = new Map<string, number>();

async function validCatalogImages(images: Record<string, string>) {
  const entries = Object.entries(images);
  const fresh = (url: string) => (recentlyValid.get(url) ?? 0) > Date.now() - VALID_TTL_MS;
  const checks = await Promise.all(entries.map(async ([sku, url]) => ({ sku, url, ok: fresh(url) || (await isUsableImage(url).catch(() => false)) })));
  const valid: Record<string, string> = {};
  if (recentlyValid.size > 2000) recentlyValid.clear();
  for (const check of checks) {
    if (check.ok) recentlyValid.set(check.url, Date.now());
    if (check.ok) valid[check.sku] = check.url;
    else {
      console.warn(`[ai][catalogo] foto inválida do ${check.sku} descartada (será trocada pelo próximo modelo com foto)`);
      await invalidateProductImage(check.sku);
    }
  }
  return valid;
}
