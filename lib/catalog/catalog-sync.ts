/**
 * Sincronização incremental do catálogo do VMSET (puro, sem banco): hash por produto e diferença entre o que já está
 * no banco local e o retrato novo do ERP. Só o que é novo ou mudou é gravado; o que sumiu fica inativo.
 */
import { createHash } from "node:crypto";
import type { CatalogProduct } from "@/lib/catalog/catalog-query";

const FIELDS = ["description", "reference", "ean", "brand", "category", "subcategory", "ncm", "color", "material", "eyeSize", "bridge", "warrantyMonths", "price", "priceMin", "priceMax"] as const;

/** Hash estável dos campos do ERP (mesma ordem sempre). */
export function productHash(product: CatalogProduct) {
  return createHash("md5").update(JSON.stringify(FIELDS.map((field) => product[field] ?? null))).digest("hex");
}

export type StoredProductState = { hash: string; active: boolean };

export type ProductDiff = {
  /** Produtos novos ou alterados (ou reativados), com o hash novo. */
  upserts: (CatalogProduct & { hash: string })[];
  /** Códigos que estavam ativos e não vieram no retrato: ficam inativos. */
  deactivate: string[];
  created: number;
  updated: number;
  unchanged: number;
};

export function diffProducts(stored: Map<string, StoredProductState>, incoming: CatalogProduct[]): ProductDiff {
  const seen = new Set<string>();
  const upserts: ProductDiff["upserts"] = [];
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  for (const product of incoming) {
    if (!product.code || seen.has(product.code)) continue;
    seen.add(product.code);
    const hash = productHash(product);
    const current = stored.get(product.code);
    if (!current) created += 1;
    else if (current.hash !== hash || !current.active) updated += 1;
    else { unchanged += 1; continue; }
    upserts.push({ ...product, hash });
  }
  // Retrato vazio (falha do ERP) nunca desativa o catálogo inteiro.
  const deactivate = incoming.length ? [...stored].filter(([code, state]) => state.active && !seen.has(code)).map(([code]) => code) : [];
  return { upserts, deactivate, created, updated, unchanged };
}

export type StockRowInput = { code: string; unit: string; erpName: string; available: number; reserved: number };
export type StockDiff = { upserts: StockRowInput[]; removals: { code: string; unit: string }[] };

/** Saldo por loja: grava só linhas novas/alteradas e remove as que zeraram e sumiram do retrato. */
export function diffStock(stored: Map<string, StockRowInput>, incoming: StockRowInput[]): StockDiff {
  const key = (row: { code: string; unit: string }) => `${row.code}|${row.unit}`;
  const seen = new Set<string>();
  const upserts: StockRowInput[] = [];
  for (const row of incoming) {
    const id = key(row);
    if (seen.has(id)) continue;
    seen.add(id);
    const current = stored.get(id);
    if (current && current.available === row.available && current.reserved === row.reserved && current.erpName === row.erpName) continue;
    upserts.push(row);
  }
  const removals = incoming.length ? [...stored.values()].filter((row) => !seen.has(key(row))).map(({ code, unit }) => ({ code, unit })) : [];
  return { upserts, removals };
}
