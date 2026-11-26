import { NextResponse } from "next/server";
import { requireModule } from "@/lib/api-auth";
import { createPromptModule, listPromptModules } from "@/lib/ai/prompt-modules-db";
import { estimateTokens, MODULE_CATEGORIES, MODULE_CONDITIONS, MODULE_VARIABLES, type PromptModule } from "@/lib/ai/prompt-modules";

/** Módulos de prompt da IA (/ia): lista (com tokens estimados) e criação. */
export async function GET() {
  const guard = await requireModule("ia", "configuracoes");
  if (guard.response) return guard.response;
  const modules = await listPromptModules();
  return NextResponse.json({
    modules: modules.map((module) => ({ ...module, tokens: estimateTokens(module.contentMarkdown) })),
    totalTokens: modules.filter((module) => module.isActive).reduce((sum, module) => sum + estimateTokens(module.contentMarkdown), 0),
    categories: MODULE_CATEGORIES,
    conditions: MODULE_CONDITIONS,
    variables: MODULE_VARIABLES,
  });
}

export async function POST(request: Request) {
  const guard = await requireModule("ia", "configuracoes");
  if (guard.response) return guard.response;
  const result = await createPromptModule(((await request.json().catch(() => null)) ?? {}) as Partial<PromptModule>, guard.user.id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ module: result }, { status: 201 });
}
