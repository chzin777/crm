import { NextResponse } from "next/server";
import { requireModule } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { defaultSkillInput, normalizeSkillInput, type AiSkillInput } from "@/lib/ai/studio";
import { deleteSkillPromptModule, syncSkillPromptModule } from "@/lib/ai/studio-db";

type Context = { params: Promise<{ id: string }> };

/**
 * Atualiza a skill, nativa ou customizada: nome, gatilho, instruções Markdown, liga/desliga e ordem. Skill nativa
 * mantém o slug (liga a skill às ferramentas do motor). `{ restoreDefault: true }` volta a nativa ao texto de fábrica.
 * Mudança de texto/ordem regrava o módulo de prompt que o motor lê, valendo já na próxima resposta.
 */
export async function PUT(request: Request, { params }: Context) {
  const guard = await requireModule("ia", "configuracoes");
  if (guard.response) return guard.response;
  const { id } = await params;
  const current = await prisma.aiSkill.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "Skill não encontrada." }, { status: 404 });
  const body = ((await request.json().catch(() => null)) ?? {}) as AiSkillInput & { restoreDefault?: boolean };
  let input: AiSkillInput = body;
  if (body.restoreDefault) {
    const original = current.builtin ? defaultSkillInput(current.slug) : null;
    if (!original) return NextResponse.json({ error: "Só skills nativas têm texto padrão para restaurar." }, { status: 400 });
    input = original;
  }
  const data = normalizeSkillInput(input, current);
  if ("error" in data) return NextResponse.json({ error: data.error }, { status: 400 });
  const taken = await prisma.aiSkill.findFirst({ where: { slug: data.slug, id: { not: id } }, select: { id: true } });
  if (taken) return NextResponse.json({ error: `Já existe uma skill com o slug "${data.slug}".` }, { status: 409 });
  const previousSlug = current.slug;
  const contentChanged = (["name", "slug", "triggerDescription", "instructionsMd", "sortOrder"] as const).some((key) => data[key] !== current[key]);
  const skill = await prisma.aiSkill.update({ where: { id }, data });
  if (contentChanged || body.restoreDefault) {
    if (skill.slug !== previousSlug) await deleteSkillPromptModule(previousSlug);
    await syncSkillPromptModule(skill);
  }
  return NextResponse.json({ skill });
}

/** Exclui skill customizada (e o módulo de prompt dela). As nativas só podem ser desligadas (ferramentas do CRM). */
export async function DELETE(_request: Request, { params }: Context) {
  const guard = await requireModule("ia", "configuracoes");
  if (guard.response) return guard.response;
  const { id } = await params;
  const current = await prisma.aiSkill.findUnique({ where: { id }, select: { builtin: true, slug: true } });
  if (!current) return NextResponse.json({ ok: true });
  if (current.builtin) return NextResponse.json({ error: "Skills nativas não podem ser excluídas; desligue o toggle." }, { status: 400 });
  await prisma.aiSkill.delete({ where: { id } });
  await deleteSkillPromptModule(current.slug);
  return NextResponse.json({ ok: true });
}
