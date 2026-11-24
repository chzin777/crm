-- Catálogo do VMSET persistido para a página /produtos (aditivo, expand-only).
CREATE TABLE IF NOT EXISTS "CatalogProduct" (
  "code" TEXT PRIMARY KEY,
  "description" TEXT NOT NULL,
  "reference" TEXT, "ean" TEXT, "brand" TEXT, "category" TEXT, "subcategory" TEXT, "ncm" TEXT,
  "color" TEXT, "material" TEXT, "eyeSize" TEXT, "bridge" TEXT,
  "warrantyMonths" INTEGER,
  "price" DOUBLE PRECISION, "priceMin" DOUBLE PRECISION, "priceMax" DOUBLE PRECISION,
  "imageUrl" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "hash" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CatalogProduct_category_idx" ON "CatalogProduct" ("category");
CREATE INDEX IF NOT EXISTS "CatalogProduct_active_idx" ON "CatalogProduct" ("active");

CREATE TABLE IF NOT EXISTS "CatalogStock" (
  "code" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "erpName" TEXT NOT NULL,
  "available" DOUBLE PRECISION NOT NULL,
  "reserved" DOUBLE PRECISION NOT NULL,
  "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("code", "unit")
);
