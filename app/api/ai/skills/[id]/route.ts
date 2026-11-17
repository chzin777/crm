import { NextResponse } from "next/server";
import { requireModule } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { normalizeSkillInput, type AiSkillInput } from "@/lib/ai/studio";

type Context = { params: Promise<{ id: string }> };

/** Atualiza a skill (Markdown, gatilho, liga/desliga, ordem). Skill nativa mantém o slug. */
export async function PUT(request: Request, { params }: Context) {
  const guard = await requireModule("ia", "configuracoes");
  if (guard.response) return guard.response;
  const { id } = await params;
  const current = await prisma.aiSkill.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "Skill não encontrada." }, { status: 404 });
  const data = normalizeSkillInput(((await request.json().catch(() => null)) ?? {}) as AiSkillInput, current);
  if ("error" in data) return NextResponse.json({ error: data.error }, { status: 400 });
  const taken = await prisma.aiSkill.findFirst({ where: { slug: data.slug, id: { not: id } }, select: { id: true } });
  if (taken) return NextResponse.json({ error: `Já existe uma skill com o slug "${data.slug}".` }, { status: 409 });
  const skill = await prisma.aiSkill.update({ where: { id }, data });
  return NextResponse.json({ skill });
}

/** Exclui skill customizada. As nativas só podem ser desligadas (estão ligadas às ferramentas do CRM). */
export async function DELETE(_request: Request, { params }: Context) {
  const guard = await requireModule("ia", "configuracoes");
  if (guard.response) return guard.response;
  const { id } = await params;
  const current = await prisma.aiSkill.findUnique({ where: { id }, select: { builtin: true } });
  if (!current) return NextResponse.json({ ok: true });
  if (current.builtin) return NextResponse.json({ error: "Skills nativas não podem ser excluídas; desligue o toggle." }, { status: 400 });
  await prisma.aiSkill.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
