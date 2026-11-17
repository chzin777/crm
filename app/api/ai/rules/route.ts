import { NextResponse } from "next/server";
import { requireModule } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { normalizeRuleInput, type BusinessRuleInput } from "@/lib/ai/studio";
import { listBusinessRules } from "@/lib/ai/studio-db";

/** Regras da empresa (Estúdio de IA): lista e criação. */
export async function GET() {
  const guard = await requireModule("ia", "configuracoes");
  if (guard.response) return guard.response;
  return NextResponse.json({ rules: await listBusinessRules() });
}

export async function POST(request: Request) {
  const guard = await requireModule("ia", "configuracoes");
  if (guard.response) return guard.response;
  const data = normalizeRuleInput(((await request.json().catch(() => null)) ?? {}) as BusinessRuleInput);
  if ("error" in data) return NextResponse.json({ error: data.error }, { status: 400 });
  const taken = await prisma.aiBusinessRule.findUnique({ where: { slug: data.slug }, select: { id: true } });
  if (taken) return NextResponse.json({ error: `Já existe uma regra com o slug "${data.slug}".` }, { status: 409 });
  const rule = await prisma.aiBusinessRule.create({ data });
  return NextResponse.json({ rule }, { status: 201 });
}
