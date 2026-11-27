import { NextResponse } from "next/server";
import { requireModule } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { normalizeSkillInput, SKILL_TOOLS, type AiSkillInput } from "@/lib/ai/studio";
import { listSkills, syncSkillPromptModule } from "@/lib/ai/studio-db";

/** Skills da IA em Markdown (Estúdio): lista (com seed das nativas na primeira vez) e criação de skill customizada. */
export async function GET() {
  const guard = await requireModule("ia", "configuracoes");
  if (guard.response) return guard.response;
  return NextResponse.json({ skills: await listSkills(), tools: SKILL_TOOLS });
}

export async function POST(request: Request) {
  const guard = await requireModule("ia", "configuracoes");
  if (guard.response) return guard.response;
  const data = normalizeSkillInput(((await request.json().catch(() => null)) ?? {}) as AiSkillInput);
  if ("error" in data) return NextResponse.json({ error: data.error }, { status: 400 });
  const taken = await prisma.aiSkill.findUnique({ where: { slug: data.slug }, select: { id: true } });
  if (taken) return NextResponse.json({ error: `Já existe uma skill com o slug "${data.slug}".` }, { status: 409 });
  const skill = await prisma.aiSkill.create({ data: { ...data, builtin: false } });
  await syncSkillPromptModule(skill);
  return NextResponse.json({ skill }, { status: 201 });
}
