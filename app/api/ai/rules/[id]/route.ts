import { NextResponse } from "next/server";
import { requireModule } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { normalizeRuleInput, type BusinessRuleInput } from "@/lib/ai/studio";

type Context = { params: Promise<{ id: string }> };

/** Atualiza a regra (campos enviados por cima dos atuais). */
export async function PUT(request: Request, { params }: Context) {
  const guard = await requireModule("ia", "configuracoes");
  if (guard.response) return guard.response;
  const { id } = await params;
  const current = await prisma.aiBusinessRule.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "Regra não encontrada." }, { status: 404 });
  const patch = ((await request.json().catch(() => null)) ?? {}) as BusinessRuleInput;
  const data = normalizeRuleInput({ ...current, ...patch });
  if ("error" in data) return NextResponse.json({ error: data.error }, { status: 400 });
  const taken = await prisma.aiBusinessRule.findFirst({ where: { slug: data.slug, id: { not: id } }, select: { id: true } });
  if (taken) return NextResponse.json({ error: `Já existe uma regra com o slug "${data.slug}".` }, { status: 409 });
  const rule = await prisma.aiBusinessRule.update({ where: { id }, data });
  return NextResponse.json({ rule });
}

export async function DELETE(_request: Request, { params }: Context) {
  const guard = await requireModule("ia", "configuracoes");
  if (guard.response) return guard.response;
  const { id } = await params;
  await prisma.aiBusinessRule.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
