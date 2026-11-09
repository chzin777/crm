import { getUserAccess, requireApiSession } from "@/lib/api-auth";
import { BulkDispatchError, controlBulkJob, getBulkJob, toView } from "@/lib/bulk-dispatch";

async function loadJob(params: Promise<{ id: string }>) {
  const user = await requireApiSession();
  if (!user) return { response: Response.json({ error: "Não autenticado." }, { status: 401 }) };
  const isAdmin = (await getUserAccess(user.id))?.isAdmin ?? false;
  const { id } = await params;
  const job = await getBulkJob(id, user.id, isAdmin);
  if (!job) return { response: Response.json({ error: "Envio não encontrado." }, { status: 404 }) };
  return { job, user };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await loadJob(params);
  if (result.response) return result.response;
  return Response.json({ data: toView(result.job, true) });
}

/** Pausar, retomar ou cancelar o restante do lote. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await loadJob(params);
  if (result.response) return result.response;
  const body = await request.json().catch(() => null) as { action?: string } | null;
  const action = body?.action;
  if (action !== "pause" && action !== "resume" && action !== "cancel") {
    return Response.json({ error: "Ação inválida." }, { status: 400 });
  }
  try {
    const job = await controlBulkJob(result.job, action);
    return Response.json({ data: toView(job) });
  } catch (error) {
    if (error instanceof BulkDispatchError) return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
