import "server-only";
import { prisma } from "@/lib/prisma";
import { createProductImageService, imageSearchConfig, searchWebImage, type ImageCache } from "@/lib/ai/product-image";

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
  search: (query) => searchWebImage(query, imageSearchConfig(process.env)),
});

export const invalidateProductImage = (sku: string) => cache.invalidate(sku).catch(() => undefined);
