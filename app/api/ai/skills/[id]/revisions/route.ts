import { NextResponse } from "next/server";
import { requireModule } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { normalizeSkillInput, parseSkillModule, skillModuleSlug } from "@/lib/ai/studio";
import { syncSkillPromptModule } from "@/lib/ai/studio-db";

type Context = { params: Promise<{ id: string }> };

async function skillAndModule(id: string) {
  const skill = await prisma.aiSkill.findUnique({ where: { id } });
  if (!skill) return null;
  const promptModule = await prisma.aiPromptModule.findUnique({ where: { slug: skillModuleSlug(skill.slug) }, select: { id: true } });
  return { skill, moduleId: promptModule?.id ?? null };
}

/** Histórico de versões da skill (últimas 30): o texto anterior de cada salvamento, já separado em nome/gatilho/protocolo. */
export async function GET(_request: Request, { params }: Context) {
  const guard = await requireModule("ia", "configuracoes");
  if (guard.response) return guard.response;
  const found = await skillAndModule((await params).id);
  if (!found) return NextResponse.json({ error: "Skill não encontrada." }, { status: 404 });
  if (!found.moduleId) return NextResponse.json({ revisions: [] });
  const rows = await prisma.aiPromptModuleRevision.findMany({ where: { moduleId: found.moduleId }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, contentMarkdown: true, createdAt: true } });
  return NextResponse.json({ revisions: rows.map((row) => ({ id: row.id, createdAt: row.createdAt, ...parseSkillModule(row.contentMarkdown) })) });
}

/** Restaura uma versão ({ revisionId }) na skill e no motor; a versão atual também entra no histórico. */
export async function POST(request: Request, { params }: Context) {
  const guard = await requireModule("ia", "configuracoes");
  if (guard.response) return guard.response;
  const found = await skillAndModule((await params).id);
  if (!found?.moduleId) return NextResponse.json({ error: "Skill não encontrada." }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { revisionId?: unknown } | null;
  if (typeof body?.revisionId !== "string") return NextResponse.json({ error: "Escolha a versão." }, { status: 400 });
  const revision = await prisma.aiPromptModuleRevision.findFirst({ where: { id: body.revisionId, moduleId: found.moduleId }, select: { contentMarkdown: true } });
  if (!revision) return NextResponse.json({ error: "Versão não encontrada." }, { status: 404 });
  const data = normalizeSkillInput(parseSkillModule(revision.contentMarkdown), found.skill);
  if ("error" in data) return NextResponse.json({ error: data.error }, { status: 400 });
  const skill = await prisma.aiSkill.update({ where: { id: found.skill.id }, data });
  await syncSkillPromptModule(skill);
  return NextResponse.json({ skill });
}
