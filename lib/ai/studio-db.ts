import "server-only";
import { loadSemanticMemory, syncKnowledgeDocumentVectors } from "@/lib/ai/vector-memory-db";
import { prisma } from "@/lib/prisma";
import { aiConfigured, aiJson, embedTexts } from "@/lib/ai/openai";
import { readAiSettings } from "@/lib/ai/store";
import { chunkText, CONSULTORIA_POS_CAMPANHA_MD, DEFAULT_SKILLS, LEGACY_CONSULTORIA_POS_CAMPANHA_MD, LEGACY_ESTOQUE_MD, LEGACY_ESTOQUE_MD_V2, fallbackSkills, rankChunks, seedSkillRows, shouldSearchKnowledge, skillModuleRow, skillModuleSlug, topicsToRules, type AiSkill, type BusinessRule, type KnowledgeChunkHit, type StudioPromptContext } from "@/lib/ai/studio";

/** Estúdio de IA no banco: regras, skills e base de conhecimento (RAG). Falha de banco nunca derruba a resposta. */

const RULE_SELECT = { id: true, title: true, slug: true, keywords: true, content: true, order: true, active: true, alwaysInclude: true } as const;
const SKILL_SELECT = { id: true, name: true, slug: true, triggerDescription: true, instructionsMd: true, isActive: true, sortOrder: true, builtin: true } as const;
const TOPICS_MIGRATED_KEY = "ai-topics-migrated";
let topicsMigrated = false;

/**
 * Unifica os "Assuntos rápidos" (base anterior, dentro das configurações da IA) com as Regras da empresa: copia cada
 * assunto para AiBusinessRule uma única vez (marcador no banco). O JSON original fica intacto como histórico.
 */
export async function migrateLegacyTopics(): Promise<number> {
  if (topicsMigrated) return 0;
  const marker = await prisma.crmWorkspaceData.findUnique({ where: { key: TOPICS_MIGRATED_KEY }, select: { key: true } });
  if (marker) {
    topicsMigrated = true;
    return 0;
  }
  const settings = await readAiSettings();
  const existing = await prisma.aiBusinessRule.findMany({ select: { slug: true } });
  const rules = topicsToRules(settings.topics, existing.map((rule) => rule.slug));
  // skipDuplicates: outro container (Blue/Green) pode estar migrando ao mesmo tempo.
  const created = rules.length ? (await prisma.aiBusinessRule.createMany({ data: rules, skipDuplicates: true })).count : 0;
  await prisma.crmWorkspaceData.upsert({ where: { key: TOPICS_MIGRATED_KEY }, create: { key: TOPICS_MIGRATED_KEY, value: { at: new Date().toISOString(), topics: settings.topics.length, created } }, update: {} });
  topicsMigrated = true;
  return created;
}

export async function listBusinessRules(): Promise<BusinessRule[]> {
  await migrateLegacyTopics().catch(() => 0);
  return prisma.aiBusinessRule.findMany({ orderBy: [{ order: "asc" }, { title: "asc" }], select: RULE_SELECT });
}

/** Popula as skills padrão quando a tabela está vazia (idempotente: slug único + skipDuplicates). */
export async function seedSkills(): Promise<void> {
  if (await prisma.aiSkill.count()) return;
  const legacy = await prisma.aiSkillConfig.findMany({ select: { key: true, enabled: true, instructions: true } }).catch(() => []);
  await prisma.aiSkill.createMany({ data: seedSkillRows(legacy), skipDuplicates: true });
}

let nativesChecked = false;

/**
 * Skills nativas criadas depois do seed inicial (ex.: Encerramento Autônomo) entram nas bases existentes uma vez,
 * herdando a opção antiga de /ia ("Encerrar quando o cliente confirmar que foi resolvido").
 */
async function addMissingNativeSkills(rows: AiSkill[]): Promise<boolean> {
  if (nativesChecked) return false;
  const missing = DEFAULT_SKILLS.filter((skill) => !rows.some((row) => row.slug === skill.slug));
  if (missing.length) {
    const settings = await readAiSettings();
    const data = missing.map((skill) => (skill.slug === "encerramento_autonomo" ? { ...skill, isActive: settings.closeWhenResolved } : skill));
    await prisma.aiSkill.createMany({ data, skipDuplicates: true });
  }
  // Skill de estoque nunca editada: recebe o protocolo novo (3 opções distintas e ticket mínimo).
  const estoque = DEFAULT_SKILLS.find((skill) => skill.slug === "estoque_cidade");
  let upgraded = 0;
  try {
    if (estoque) upgraded = (await prisma.aiSkill.updateMany({ where: { slug: "estoque_cidade", instructionsMd: { in: [LEGACY_ESTOQUE_MD, LEGACY_ESTOQUE_MD_V2] } }, data: { instructionsMd: estoque.instructionsMd } })).count;
    // Skill pós-campanha nunca editada: sai o roteiro fixo de perguntas, entra a leitura do contexto da campanha.
    upgraded += (await prisma.aiSkill.updateMany({ where: { slug: "consultoria_pos_campanha", instructionsMd: LEGACY_CONSULTORIA_POS_CAMPANHA_MD }, data: { instructionsMd: CONSULTORIA_POS_CAMPANHA_MD } })).count;
  } catch (error) {
    console.warn("[ai][estudio] protocolo novo da skill de estoque não aplicado:", error instanceof Error ? error.message : error);
  }
  nativesChecked = true;
  return missing.length > 0 || upgraded > 0;
}

export async function listSkills(): Promise<AiSkill[]> {
  const rows = await prisma.aiSkill.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: SKILL_SELECT });
  if (rows.length && !(await addMissingNativeSkills(rows))) return rows;
  if (!rows.length) await seedSkills();
  return prisma.aiSkill.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: SKILL_SELECT });
}

/**
 * Grava as instruções da skill no módulo de prompt que o motor lê (sem cache: vale na próxima resposta).
 * Chamado ao criar, editar ou restaurar uma skill (nativa ou customizada).
 */
export async function syncSkillPromptModule(skill: Pick<AiSkill, "name" | "slug" | "triggerDescription" | "instructionsMd" | "sortOrder">): Promise<void> {
  const row = skillModuleRow(skill);
  const { slug, ...content } = row;
  await prisma.aiPromptModule.upsert({ where: { slug }, create: row, update: content });
}

export async function deleteSkillPromptModule(slug: string): Promise<void> {
  await prisma.aiPromptModule.deleteMany({ where: { slug: skillModuleSlug(slug) } });
}

/** Skills para o motor. Banco fora ou tabela ausente: skills nativas ligadas (comportamento anterior). */
export async function loadSkills(): Promise<AiSkill[]> {
  try {
    const skills = await listSkills();
    return skills.length ? skills : fallbackSkills();
  } catch {
    return fallbackSkills();
  }
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
  // Memória vetorial (busca semântica da IA) acompanha o documento salvo, reaproveitando os embeddings acima.
  await syncKnowledgeDocumentVectors(documentId, { userId }).catch((cause: unknown) => console.warn("[ai][memoria] documento não vetorizado:", cause instanceof Error ? cause.message : cause));
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
export async function loadStudioContext(text: string, meta: { userId?: string | null; conversationId?: string | null; /** Mensagem atual + contexto imediato para a busca semântica (sem ele, usa text). */ memoryText?: string }): Promise<StudioPromptContext> {
  const safe = async <T,>(run: () => Promise<T>, fallback: T) => { try { return await run(); } catch { return fallback; } };
  const [rules, skills, knowledge, memory] = await Promise.all([
    safe(async () => {
      await migrateLegacyTopics().catch(() => 0);
      return prisma.aiBusinessRule.findMany({ where: { active: true }, orderBy: [{ order: "asc" }, { title: "asc" }], select: RULE_SELECT });
    }, [] as BusinessRule[]),
    loadSkills(),
    shouldSearchKnowledge(text) ? safe(() => searchKnowledge(text, meta), [] as KnowledgeChunkHit[]) : Promise.resolve([] as KnowledgeChunkHit[]),
    safe(() => loadSemanticMemory(meta.memoryText ?? text, meta), undefined),
  ]);
  return { rules, skills, knowledge, memory };
}
