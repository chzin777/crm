import { NextResponse } from "next/server";
import { requireModule } from "@/lib/api-auth";
import { listModuleRevisions, restoreModuleRevision } from "@/lib/ai/prompt-modules-db";

type Context = { params: Promise<{ id: string }> };

/** Histórico de versões do módulo (últimas 30). */
export async function GET(_request: Request, { params }: Context) {
  const guard = await requireModule("ia", "configuracoes");
  if (guard.response) return guard.response;
  const { id } = await params;
  return NextResponse.json({ revisions: await listModuleRevisions(id) });
}

/** Restaura uma versão ({ revisionId }); a versão atual também fica no histórico. */
export async function POST(request: Request, { params }: Context) {
  const guard = await requireModule("ia", "configuracoes");
  if (guard.response) return guard.response;
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { revisionId?: unknown } | null;
  if (typeof body?.revisionId !== "string") return NextResponse.json({ error: "Escolha a versão." }, { status: 400 });
  const result = await restoreModuleRevision(id, body.revisionId, guard.user.id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ module: result });
}
