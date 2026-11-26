import { NextResponse } from "next/server";
import { requireModule } from "@/lib/api-auth";
import { reorderPromptModules } from "@/lib/ai/prompt-modules-db";

/** Nova ordem dos módulos ({ ids } na sequência de montagem do prompt). */
export async function POST(request: Request) {
  const guard = await requireModule("ia", "configuracoes");
  if (guard.response) return guard.response;
  const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id): id is string => typeof id === "string").slice(0, 500) : [];
  if (!ids.length) return NextResponse.json({ error: "Envie a ordem dos módulos." }, { status: 400 });
  await reorderPromptModules(ids);
  return NextResponse.json({ ok: true });
}
