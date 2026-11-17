import "server-only";
import { prisma } from "@/lib/prisma";
import { createProductImageService, imageSearchConfig, isUsableImage, searchWebImages, type ImageCache } from "@/lib/ai/product-image";

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
export async function catalogImages(models: { codigos: string[]; nomeComercial: string }[], options: { want: number; web: boolean }): Promise<Record<string, string>> {
  const codes = [...new Set(models.flatMap((model) => model.codigos))].slice(0, 80);
  if (!codes.length) return {};
  const rows = await prisma.productImageCache.findMany({ where: { sku: { in: codes }, NOT: { imageUrl: null } }, select: { sku: true, imageUrl: true } }).catch(() => []);
  const images: Record<string, string> = Object.fromEntries(rows.filter((row) => !!row.imageUrl).map((row) => [row.sku, row.imageUrl as string]));
  const withPhoto = models.filter((model) => model.codigos.some((code) => images[code])).length;
  if (!options.web || withPhoto >= options.want || !imageSearchStatus()) return images;
  const missing = models.filter((model) => model.codigos.length && !model.codigos.some((code) => images[code])).slice(0, Math.max(0, options.want - withPhoto) + 2);
  const found = await Promise.all(missing.map((model) => searchAndCacheProductImage({ codigo: model.codigos[0], produto: model.nomeComercial }).catch(() => null)));
  for (const image of found) if (image) images[image.sku] = image.url;
  return images;
}
