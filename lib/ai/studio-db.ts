import "server-only";
import { prisma } from "@/lib/prisma";
import { aiConfigured, aiJson, embedTexts } from "@/lib/ai/openai";
import { chunkText, mergeSkills, rankChunks, shouldSearchKnowledge, type BusinessRule, type KnowledgeChunkHit, type SkillConfig, type SkillKey, type StudioPromptContext } from "@/lib/ai/studio";

/** Estúdio de IA no banco: regras, skills e base de conhecimento (RAG). Falha de banco nunca derruba a resposta. */

export async function listBusinessRules(): Promise<BusinessRule[]> {
  return prisma.aiBusinessRule.findMany({ orderBy: [{ order: "asc" }, { title: "asc" }], select: { id: true, title: true, slug: true, keywords: true, content: true, order: true, active: true, alwaysInclude: true } });
}

export async function loadSkills(): Promise<Record<SkillKey, SkillConfig>> {
  try {
    return mergeSkills(await prisma.aiSkillConfig.findMany({ select: { key: true, enabled: true, instructions: true } }));
  } catch {
    // Tabela ainda não criada ou banco fora: todas as skills ligadas (comportamento anterior).
    return mergeSkills([]);
  }
}

export async function saveSkills(skills: { key: string; enabled: boolean; instructions?: string }[]) {
  const merged = mergeSkills(skills);
  await prisma.$transaction(Object.values(merged).map((skill) => prisma.aiSkillConfig.upsert({ where: { key: skill.key }, create: { key: skill.key, enabled: skill.enabled, instructions: skill.instructions }, update: { enabled: skill.enabled, instructions: skill.instructions } })));
  return merged;
}

/** Lê o texto de um PDF pelo modelo (o projeto não tem leitor de PDF local). */
export async function extractPdfText(file: { name: string; data: Uint8Array }, userId: string): Promise<string> {
  const base64 = Buffer.from(file.data).toString("base64");
  const result = await aiJson<{ texto?: string }>(
    [
      { role: "system", content: "Transcreva todo o texto do PDF em português, fielmente, preservando tabelas como linhas \"coluna: valor\" e títulos como linhas próprias. Não resuma nem comente. Responda em JSON: {\"texto\": \"...\"}." },
      { role: "user", content: [{ type: "text", text: "Documento da base de conhecimento:" }, { type: "file", file: { filename: file.name.toLowerCase().endsWith(".pdf") ? file.name : `${file.name}.pdf`, file_data: `data:application/pdf;base64,${base64}` } }] },
    ],
    { feature: "knowledge_index", userId, maxTokens: 16000 },
  );
  return String(result.texto ?? "").trim();
}

/** Divide o documento em trechos e grava com embedding (sem chave ou com falha: só busca textual, status "parcial"). */
export async function indexKnowledgeDocument(documentId: string, userId: string) {
  const document = await prisma.knowledgeDocument.findUniqueOrThrow({ where: { id: documentId } });
  const chunks = chunkText(document.content);
  let embeddings: number[][] = [];
  let error: string | null = null;
  if (chunks.length && aiConfigured()) {
    embeddings = await embedTexts(chunks.map((chunk) => `${document.title}\n${chunk}`), { feature: "knowledge_index", userId }).catch((cause: unknown) => {
      error = cause instanceof Error ? cause.message : "Falha ao gerar embeddings.";
      return [];
    });
  }
  await prisma.$transaction([
    prisma.knowledgeChunk.deleteMany({ where: { documentId } }),
    prisma.knowledgeChunk.createMany({ data: chunks.map((content, index) => ({ documentId, index, content, embedding: embeddings[index] ?? [] })) }),
    prisma.knowledgeDocument.update({ where: { id: documentId }, data: { chunkCount: chunks.length, status: !chunks.length ? "erro" : embeddings.length === chunks.length ? "indexado" : "parcial", error: !chunks.length ? "Documento sem texto." : error } }),
  ]);
}

/** Top-K trechos da base ativa para a pergunta (híbrido: embedding da pergunta + termos). */
export async function searchKnowledge(query: string, options: { topK?: number; userId?: string | null; conversationId?: string | null; minScore?: number } = {}): Promise<KnowledgeChunkHit[]> {
  if (!query.trim()) return [];
  const chunks = await prisma.knowledgeChunk.findMany({ where: { document: { active: true } }, select: { documentId: true, index: true, content: true, embedding: true, document: { select: { title: true } } }, take: 5000 });
  if (!chunks.length) return [];
  const withVectors = chunks.some((chunk) => chunk.embedding.length);
  const queryEmbedding = withVectors && aiConfigured()
    ? await embedTexts([query], { feature: "knowledge_search", userId: options.userId ?? null, conversationId: options.conversationId ?? null }).then((items) => items[0] ?? null).catch(() => null)
    : null;
  return rankChunks(query, chunks.map((chunk) => ({ documentId: chunk.documentId, documentTitle: chunk.document.title, index: chunk.index, content: chunk.content, embedding: chunk.embedding })), { queryEmbedding, topK: options.topK ?? 4, minScore: options.minScore });
}

/** Contexto do Estúdio para uma resposta da IA: regras ativas, skills e RAG da pergunta atual. */
export async function loadStudioContext(text: string, meta: { userId?: string | null; conversationId?: string | null }): Promise<StudioPromptContext> {
  const safe = async <T,>(run: () => Promise<T>, fallback: T) => { try { return await run(); } catch { return fallback; } };
  const [rules, skills, knowledge] = await Promise.all([
    safe(() => prisma.aiBusinessRule.findMany({ where: { active: true }, orderBy: [{ order: "asc" }, { title: "asc" }], select: { id: true, title: true, slug: true, keywords: true, content: true, order: true, active: true, alwaysInclude: true } }), [] as BusinessRule[]),
    loadSkills(),
    shouldSearchKnowledge(text) ? safe(() => searchKnowledge(text, meta), [] as KnowledgeChunkHit[]) : Promise.resolve([] as KnowledgeChunkHit[]),
  ]);
  return { rules, skills, knowledge };
}
