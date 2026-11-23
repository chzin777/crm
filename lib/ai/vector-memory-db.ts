import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { aiConfigured, embedTexts } from "@/lib/ai/openai";
import { chunkText } from "@/lib/ai/studio";
import {
  catalogDocument, contentHash, EXAMPLE_MIN_SCORE, EXAMPLE_SOURCES, EXAMPLE_TOP_K, FACT_MIN_SCORE, FACT_SOURCES, FACT_TOP_K,
  rankByCosine, VECTOR_SOURCES, vectorLiteral, type SemanticMemory, type VectorHit, type VectorSource,
} from "@/lib/ai/vector-memory";

export type VectorDoc = { sourceType: VectorSource; sourceId: string; title: string; content: string; metadata?: Record<string, unknown>; embedding?: number[] };
type Meta = { userId?: string | null; conversationId?: string | null };
type CachedRow = { sourceType: VectorSource; sourceId: string; title: string; content: string; metadata: Record<string, unknown>; embedding: Float32Array };

const CATALOG_LIMIT = 2000;
const CACHE_MS = 10 * 60 * 1000;
const STATS_MS = 5 * 60 * 1000;

let pgvector: Promise<boolean> | null = null;
/** pgvector ativo = a coluna "embeddingVec" existe (criada por prisma/ai-knowledge-vector.sql quando a extensão está instalada). */
function hasPgvector() {
  pgvector ??= prisma.$queryRaw<{ ok: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'AiKnowledgeVector' AND column_name = 'embeddingVec') AS ok
  `.then((rows) => rows[0]?.ok === true).catch(() => false);
  return pgvector;
}

const rowsCache = new Map<VectorSource, { at: number; rows: Promise<CachedRow[]> }>();
let statsCache: { at: number; total: number } | null = null;
function invalidate(type: VectorSource) {
  rowsCache.delete(type);
  statsCache = null;
}

/** Sem pgvector: vetores de cada origem ficam em memória (Float32Array) por 10 min e o cosseno roda no aplicativo. */
function cachedRows(type: VectorSource) {
  const hit = rowsCache.get(type);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.rows;
  const rows = prisma.aiKnowledgeVector.findMany({
    where: { sourceType: type, NOT: { embedding: { isEmpty: true } } },
    select: { sourceType: true, sourceId: true, title: true, content: true, metadata: true, embedding: true },
  }).then((list) => list.map((row) => ({ ...row, sourceType: row.sourceType as VectorSource, metadata: (row.metadata ?? {}) as Record<string, unknown>, embedding: Float32Array.from(row.embedding) })));
  rowsCache.set(type, { at: Date.now(), rows });
  rows.catch(() => rowsCache.delete(type));
  return rows;
}

/**
 * Grava/atualiza documentos (chave: origem + id da origem). Só gera embedding do que mudou (hash do conteúdo);
 * embedding já calculado (trechos da base de conhecimento) é reaproveitado. Devolve quantos foram (re)vetorizados.
 */
export async function upsertVectors(docs: VectorDoc[], meta: Meta & { feature?: string } = {}): Promise<number> {
  const items = docs.filter((doc) => doc.content.trim()).map((doc) => ({ ...doc, hash: contentHash(`${doc.title}\n${doc.content}`) }));
  if (!items.length) return 0;
  const existing = await prisma.aiKnowledgeVector.findMany({
    where: { OR: VECTOR_SOURCES.map((type) => ({ sourceType: type, sourceId: { in: items.filter((item) => item.sourceType === type).map((item) => item.sourceId) } })).filter((clause) => clause.sourceId.in.length) },
    select: { sourceType: true, sourceId: true, contentHash: true },
  });
  const known = new Map(existing.map((row) => [`${row.sourceType}|${row.sourceId}`, row.contentHash]));
  const changed = items.filter((item) => known.get(`${item.sourceType}|${item.sourceId}`) !== item.hash);
  if (!changed.length) return 0;
  const missing = changed.filter((item) => !item.embedding?.length);
  if (missing.length && aiConfigured()) {
    const vectors = await embedTexts(missing.map((item) => `${item.title}\n${item.content}`), { feature: meta.feature ?? "vector_index", userId: meta.userId ?? null, conversationId: meta.conversationId ?? null });
    missing.forEach((item, index) => { item.embedding = vectors[index]; });
  }
  for (let start = 0; start < changed.length; start += 100) {
    await prisma.$transaction(changed.slice(start, start + 100).map((item) => {
      const data = { title: item.title.slice(0, 300), content: item.content, metadata: (item.metadata ?? {}) as Prisma.InputJsonValue, embedding: item.embedding ?? [], contentHash: item.embedding?.length ? item.hash : "" };
      return prisma.aiKnowledgeVector.upsert({ where: { sourceType_sourceId: { sourceType: item.sourceType, sourceId: item.sourceId } }, create: { sourceType: item.sourceType, sourceId: item.sourceId, ...data }, update: data });
    }));
  }
  if (await hasPgvector()) {
    for (const type of new Set(changed.map((item) => item.sourceType))) {
      const ids = changed.filter((item) => item.sourceType === type).map((item) => item.sourceId);
      await prisma.$executeRaw`UPDATE "AiKnowledgeVector" SET "embeddingVec" = CASE WHEN cardinality("embedding") = 1536 THEN "embedding"::vector ELSE NULL END WHERE "sourceType" = ${type} AND "sourceId" = ANY(${ids})`.catch(() => 0);
    }
  }
  for (const type of new Set(changed.map((item) => item.sourceType))) invalidate(type);
  return changed.filter((item) => item.embedding?.length).length;
}

/** Remove vetores de uma origem: por prefixo do id (ex.: trechos de um documento) e/ou mantendo só os ids informados. */
export async function deleteVectors(type: VectorSource, filter: { prefix?: string; sourceId?: string; keep?: string[] }) {
  const result = await prisma.aiKnowledgeVector.deleteMany({
    where: {
      sourceType: type,
      ...(filter.sourceId ? { sourceId: filter.sourceId } : {}),
      ...(filter.prefix ? { sourceId: { startsWith: filter.prefix } } : {}),
      ...(filter.keep ? { NOT: { sourceId: { in: filter.keep } } } : {}),
    },
  });
  if (result.count) invalidate(type);
  return result.count;
}

/** Busca por similaridade de cosseno: HNSW no Postgres com pgvector; senão, no aplicativo. */
export async function searchVectors(embedding: number[], types: VectorSource[], topK: number, minScore: number): Promise<VectorHit[]> {
  if (await hasPgvector()) {
    const literal = vectorLiteral(embedding);
    const rows = await prisma.$queryRaw<(Omit<VectorHit, "score"> & { score: number })[]>`
      SELECT "sourceType", "sourceId", "title", "content", "metadata", (1 - ("embeddingVec" <=> ${literal}::vector))::float8 AS score
      FROM "AiKnowledgeVector"
      WHERE "sourceType" = ANY(${types}) AND "embeddingVec" IS NOT NULL
      ORDER BY "embeddingVec" <=> ${literal}::vector
      LIMIT ${topK * 4}
    `.catch(() => null);
    if (rows) return rows.filter((row) => row.score >= minScore).slice(0, topK);
    pgvector = Promise.resolve(false);
  }
  const rows = (await Promise.all(types.map(cachedRows))).flat();
  return rankByCosine(embedding, rows, topK, minScore).map((row) => ({ sourceType: row.sourceType, sourceId: row.sourceId, title: row.title, content: row.content, metadata: row.metadata, score: row.score }));
}

async function vectorCount() {
  if (statsCache && Date.now() - statsCache.at < STATS_MS) return statsCache.total;
  const total = await prisma.aiKnowledgeVector.count({ where: { NOT: { embedding: { isEmpty: true } } } });
  statsCache = { at: Date.now(), total };
  return total;
}

/**
 * Memória semântica de uma resposta: embedding da mensagem atual + contexto imediato, top 3 fatos (base + catálogo)
 * e top 2 atendimentos parecidos (padrão ouro + correções do copiloto), acima da relevância mínima.
 */
export async function loadSemanticMemory(text: string, meta: Meta = {}): Promise<SemanticMemory> {
  const empty = { facts: [], examples: [] };
  const query = text.trim().slice(0, 2000);
  if (query.length < 3 || !aiConfigured() || !(await vectorCount())) return empty;
  const [embedding] = await embedTexts([query], { feature: "vector_search", userId: meta.userId ?? null, conversationId: meta.conversationId ?? null });
  if (!embedding?.length) return empty;
  const [facts, examples] = await Promise.all([
    searchVectors(embedding, FACT_SOURCES, FACT_TOP_K, FACT_MIN_SCORE),
    searchVectors(embedding, EXAMPLE_SOURCES, EXAMPLE_TOP_K, EXAMPLE_MIN_SCORE),
  ]);
  return { facts, examples };
}

/** Trechos de um documento da base (/ia) viram vetores KNOWLEDGE_BASE; documento desligado ou vazio sai da memória. */
export async function syncKnowledgeDocumentVectors(documentId: string, meta: Meta = {}) {
  const document = await prisma.knowledgeDocument.findUnique({ where: { id: documentId }, select: { id: true, title: true, active: true, systemKey: true, chunks: { orderBy: { index: "asc" }, select: { index: true, content: true, embedding: true } } } });
  if (!document || !document.active || document.systemKey || !document.chunks.length) return deleteVectors("KNOWLEDGE_BASE", { prefix: `doc:${documentId}:` });
  const docs = document.chunks.map((chunk) => ({ sourceType: "KNOWLEDGE_BASE" as const, sourceId: `doc:${documentId}:${chunk.index}`, title: document.title, content: chunk.content, metadata: { documentId, index: chunk.index }, embedding: chunk.embedding.length ? chunk.embedding : undefined }));
  const count = await upsertVectors(docs, { ...meta, feature: "knowledge_index" });
  await deleteVectors("KNOWLEDGE_BASE", { prefix: `doc:${documentId}:`, keep: docs.map((doc) => doc.sourceId) });
  return count;
}

/** Regras da empresa do Estúdio (/ia) também entram como fatos pesquisáveis. */
export async function syncBusinessRules(meta: Meta = {}) {
  const rules = await prisma.aiBusinessRule.findMany({ where: { active: true }, select: { id: true, title: true, content: true } }).catch(() => []);
  const docs = rules.flatMap((rule) => chunkText(rule.content).map((content, index) => ({ sourceType: "KNOWLEDGE_BASE" as const, sourceId: `rule:${rule.id}:${index}`, title: rule.title, content, metadata: { ruleId: rule.id } })));
  const count = await upsertVectors(docs, { ...meta, feature: "knowledge_index" });
  await prisma.aiKnowledgeVector.deleteMany({ where: { sourceType: "KNOWLEDGE_BASE", sourceId: { startsWith: "rule:", notIn: docs.map((doc) => doc.sourceId) } } });
  invalidate("KNOWLEDGE_BASE");
  return count;
}

/** Catálogo: produtos de varejo mais vendidos no último ano (descrição, marca, categoria e faixa de preço). */
export async function syncCatalogVectors(meta: Meta = {}) {
  const products = await prisma.$queryRaw<{ code: string | null; description: string; brand: string | null; category: string | null; subcategory: string | null; sales: number; price: number | null; minPrice: number | null; maxPrice: number | null }[]>`
    SELECT max("productCode") AS code, btrim("description") AS description, max("brand") AS brand, max("category") AS category, max("subcategory") AS subcategory,
      COUNT(*)::int AS sales, round(avg("amount" / NULLIF("quantity", 0)), 2)::float8 AS price,
      round(min("amount" / NULLIF("quantity", 0)), 2)::float8 AS "minPrice", round(max("amount" / NULLIF("quantity", 0)), 2)::float8 AS "maxPrice"
    FROM "VmsetSale"
    WHERE "type" = 'Venda' AND "amount" > 0 AND NULLIF(btrim("description"), '') IS NOT NULL
      AND COALESCE("category", '') NOT ILIKE '%SERVI%' AND COALESCE("category", '') <> 'LENTES'
      AND "orderDate" >= (now() AT TIME ZONE 'America/Sao_Paulo')::date - 365
    GROUP BY 2
    ORDER BY 6 DESC
    LIMIT ${CATALOG_LIMIT}
  `;
  const docs = products.map((product) => ({
    sourceType: "PRODUCT_CATALOG" as const,
    sourceId: product.description.toLowerCase(),
    title: product.description,
    content: catalogDocument(product),
    metadata: { code: product.code, brand: product.brand, category: product.category, subcategory: product.subcategory, price: product.price, sales: product.sales },
  }));
  const count = await upsertVectors(docs, { ...meta, feature: "catalog_index" });
  if (docs.length) await deleteVectors("PRODUCT_CATALOG", { keep: docs.map((doc) => doc.sourceId) });
  return { products: docs.length, embedded: count };
}

/** "Reindexar base agora" (/ia): documentos ativos, regras e catálogo. Atendimentos e correções já ficam gravados. */
export async function reindexVectorMemory(meta: Meta = {}) {
  const documents = await prisma.knowledgeDocument.findMany({ where: { systemKey: null }, select: { id: true } });
  let knowledge = 0;
  for (const document of documents) knowledge += await syncKnowledgeDocumentVectors(document.id, meta);
  knowledge += await syncBusinessRules(meta);
  const catalog = await syncCatalogVectors(meta);
  return { knowledge, catalog: catalog.embedded, products: catalog.products };
}

export async function vectorMemoryStats() {
  const [groups, engine] = await Promise.all([
    prisma.aiKnowledgeVector.groupBy({ by: ["sourceType"], where: { NOT: { embedding: { isEmpty: true } } }, _count: { _all: true }, _max: { updatedAt: true } }),
    hasPgvector(),
  ]);
  const count = (type: VectorSource) => groups.find((group) => group.sourceType === type)?._count._all ?? 0;
  const updated = groups.map((group) => group._max.updatedAt?.getTime() ?? 0);
  return {
    knowledge: count("KNOWLEDGE_BASE"),
    products: count("PRODUCT_CATALOG"),
    conversations: count("CLOSED_CONVERSATION"),
    corrections: count("COPILOT_CORRECTION"),
    engine: engine ? "pgvector" : "aplicativo",
    updatedAt: updated.length ? new Date(Math.max(...updated)).toISOString() : null,
    configured: aiConfigured(),
  };
}
