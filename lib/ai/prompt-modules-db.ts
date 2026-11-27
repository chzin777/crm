import "server-only";
import { prisma } from "@/lib/prisma";
import { readAiSettings } from "@/lib/ai/store";
import { listBusinessRules, listSkills } from "@/lib/ai/studio-db";
import { skillModuleRow } from "@/lib/ai/studio";
import { normalizeModuleInput, sortModules, type ModuleCategory, type PromptModule } from "@/lib/ai/prompt-modules";
import seed from "@/lib/ai/prompt-modules.seed.json";

/**
 * Módulos de prompt no banco (AiPromptModule). Seed único na primeira execução (marcador no banco): depois disso a
 * equipe edita ou apaga tudo em /ia e nada volta sozinho, nem com a tabela vazia.
 */

const SEEDED_KEY = "ai-prompt-modules-seeded";
const SELECT = { id: true, slug: true, title: true, category: true, contentMarkdown: true, isActive: true, alwaysInclude: true, keywords: true, priorityOrder: true } as const;
let seeded = false;

type SeedRow = Omit<PromptModule, "id">;
const toModule = (row: { category: string } & Omit<PromptModule, "category">): PromptModule => ({ ...row, category: row.category as ModuleCategory });

/** Conteúdo inicial: módulos padrão + regras da empresa, skills e instruções da empresa que já estavam salvas. */
async function initialRows(): Promise<SeedRow[]> {
  const rows: SeedRow[] = (seed as SeedRow[]).map((item) => ({ ...item, isActive: true }));
  const settings = await readAiSettings().catch(() => null);
  const extra = settings?.extraInstructions?.trim();
  const company = rows.find((row) => row.slug === "instrucoes-empresa");
  if (company) {
    if (extra) company.contentMarkdown = `Instruções da empresa:\n${extra}`;
    else company.isActive = false;
  }
  const rules = await listBusinessRules().catch(() => []);
  for (const rule of rules) {
    rows.push({ slug: `regra-${rule.slug}`.slice(0, 60), title: rule.title, category: "regras", contentMarkdown: `## ${rule.title}\n${rule.content.trim()}`, isActive: rule.active, alwaysInclude: rule.alwaysInclude, keywords: [...new Set([...rule.keywords, rule.title.toLowerCase()])], priorityOrder: 150 + rule.order });
  }
  const skills = await listSkills().catch(() => []);
  for (const skill of skills) {
    if (!skill.instructionsMd.trim() && !skill.triggerDescription.trim()) continue;
    rows.push(skillModuleRow(skill));
  }
  return rows;
}

export async function ensurePromptModulesSeeded() {
  if (seeded) return;
  const marker = await prisma.crmWorkspaceData.findUnique({ where: { key: SEEDED_KEY }, select: { key: true } });
  if (!marker) {
    if ((await prisma.aiPromptModule.count()) === 0) {
      const rows = await initialRows();
      const taken = new Set<string>();
      await prisma.aiPromptModule.createMany({
        data: rows.filter((row) => !taken.has(row.slug) && taken.add(row.slug)),
        skipDuplicates: true,
      });
    }
    await prisma.crmWorkspaceData.upsert({ where: { key: SEEDED_KEY }, create: { key: SEEDED_KEY, value: { at: new Date().toISOString() } }, update: {} });
  }
  await applyPromptUpgrades().catch((error) => console.error("[ai] atualização dos módulos de prompt:", error));
  seeded = true;
}

/** Frase pronta antiga da regra "cidade sem loja" (seed e versão editada pela equipe). */
const ROBOTIC_NO_STORE = /diga(?:\s+explicitamente)?:?\s*[“"]Ainda não possuímos unidade em\s*[[<][^\]>]+[\]>]\.?[”"]\.?/;
export const NATURAL_NO_STORE = "diga com naturalidade e em poucas palavras que ainda não temos loja nessa cidade (sem frase pronta) e indique só as 1 a 3 cidades com loja realmente mais próximas (campo cidades_com_loja_detalhe), nunca a lista inteira da rede.";

/**
 * Atualizações pontuais do prompt em bases já semeadas, cada uma uma única vez (marcador no banco): depois disso a
 * equipe edita ou apaga à vontade e nada volta. Texto alterado guarda a versão anterior no histórico do módulo.
 */
const PROMPT_UPGRADES: { id: string; run: () => Promise<void> }[] = [
  {
    // Conversa humana: sem URA, retomadas ("Achou?"), cidades mais próximas de verdade e foto de referência.
    id: "ai-prompt-upgrade:2026-11-27-conversa-humana",
    run: async () => {
      const row = (seed as SeedRow[]).find((item) => item.slug === "conversa-humana");
      if (row) await prisma.aiPromptModule.createMany({ data: [{ ...row, isActive: true }], skipDuplicates: true });
    },
  },
  {
    // Regra crítica "cidade sem loja": sai a frase pronta obrigatória, entra a indicação das cidades mais próximas.
    id: "ai-prompt-upgrade:2026-11-27-cidade-sem-loja",
    run: async () => {
      const current = await prisma.aiPromptModule.findUnique({ where: { slug: "regras-criticas" }, select: { id: true, title: true, contentMarkdown: true } });
      if (!current || !ROBOTIC_NO_STORE.test(current.contentMarkdown)) return;
      await prisma.$transaction([
        prisma.aiPromptModuleRevision.create({ data: { moduleId: current.id, title: current.title, contentMarkdown: current.contentMarkdown, userId: null } }),
        prisma.aiPromptModule.update({ where: { id: current.id }, data: { contentMarkdown: current.contentMarkdown.replace(ROBOTIC_NO_STORE, NATURAL_NO_STORE) } }),
      ]);
    },
  },
];

export async function applyPromptUpgrades() {
  for (const upgrade of PROMPT_UPGRADES) {
    if (await prisma.crmWorkspaceData.findUnique({ where: { key: upgrade.id }, select: { key: true } })) continue;
    await upgrade.run();
    await prisma.crmWorkspaceData.upsert({ where: { key: upgrade.id }, create: { key: upgrade.id, value: { at: new Date().toISOString() } }, update: {} });
  }
}

export async function listPromptModules(): Promise<PromptModule[]> {
  await ensurePromptModulesSeeded();
  const rows = await prisma.aiPromptModule.findMany({ select: SELECT });
  return sortModules(rows.map(toModule));
}

/** Módulos para o motor (sem cache: editar em /ia vale na próxima resposta). Banco fora: nenhum módulo. */
export async function loadPromptModules(): Promise<PromptModule[]> {
  try {
    return await listPromptModules();
  } catch (error) {
    console.error("[ai] módulos de prompt indisponíveis:", error);
    return [];
  }
}

export async function createPromptModule(input: Partial<PromptModule>, userId: string | null) {
  const data = normalizeModuleInput(input);
  if ("error" in data) return data;
  const max = await prisma.aiPromptModule.aggregate({ _max: { priorityOrder: true } });
  const slugTaken = await prisma.aiPromptModule.findUnique({ where: { slug: data.slug }, select: { id: true } });
  const created = await prisma.aiPromptModule.create({
    data: { ...data, slug: slugTaken ? `${data.slug}-${Date.now().toString(36)}`.slice(0, 60) : data.slug, priorityOrder: input.priorityOrder === undefined ? (max._max.priorityOrder ?? 0) + 10 : data.priorityOrder },
    select: SELECT,
  });
  void userId;
  return toModule(created);
}

/** Salva e guarda a versão anterior (título + Markdown) quando o texto mudou. */
export async function updatePromptModule(id: string, input: Partial<PromptModule>, userId: string | null) {
  const current = await prisma.aiPromptModule.findUnique({ where: { id }, select: SELECT });
  if (!current) return { error: "Módulo não encontrado." };
  const data = normalizeModuleInput(input, toModule(current));
  if ("error" in data) return data;
  const changedText = data.contentMarkdown !== current.contentMarkdown || data.title !== current.title;
  const slugTaken = data.slug !== current.slug ? await prisma.aiPromptModule.findUnique({ where: { slug: data.slug }, select: { id: true } }) : null;
  const [, updated] = await prisma.$transaction([
    changedText ? prisma.aiPromptModuleRevision.create({ data: { moduleId: id, title: current.title, contentMarkdown: current.contentMarkdown, userId } }) : prisma.aiPromptModuleRevision.count({ where: { moduleId: id } }),
    prisma.aiPromptModule.update({ where: { id }, data: { ...data, slug: slugTaken ? current.slug : data.slug }, select: SELECT }),
  ]);
  return toModule(updated);
}

export async function deletePromptModule(id: string) {
  await prisma.aiPromptModule.delete({ where: { id } }).catch(() => null);
}

/** Nova ordem: ids na sequência desejada (prioridade 10, 20, 30...). */
export async function reorderPromptModules(ids: string[]) {
  await prisma.$transaction(ids.map((id, index) => prisma.aiPromptModule.update({ where: { id }, data: { priorityOrder: (index + 1) * 10 } })));
}

export async function listModuleRevisions(moduleId: string) {
  return prisma.aiPromptModuleRevision.findMany({ where: { moduleId }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, title: true, contentMarkdown: true, createdAt: true, userId: true } });
}

/** Restaura uma versão anterior (a atual vira revisão, então nada se perde). */
export async function restoreModuleRevision(moduleId: string, revisionId: string, userId: string | null) {
  const revision = await prisma.aiPromptModuleRevision.findFirst({ where: { id: revisionId, moduleId }, select: { title: true, contentMarkdown: true } });
  if (!revision) return { error: "Versão não encontrada." };
  return updatePromptModule(moduleId, { title: revision.title, contentMarkdown: revision.contentMarkdown }, userId);
}
