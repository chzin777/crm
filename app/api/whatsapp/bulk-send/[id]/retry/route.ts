import { getUserAccess, requireApiSession } from "@/lib/api-auth";
import { BulkDispatchError, getBulkJob, retryFailures, toView } from "@/lib/bulk-dispatch";

/** Cria um novo lote só com os contatos que falharam neste. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const isAdmin = (await getUserAccess(user.id))?.isAdmin ?? false;
  const { id } = await params;
  const job = await getBulkJob(id, user.id, isAdmin);
  if (!job) return Response.json({ error: "Envio não encontrado." }, { status: 404 });
  try {
    const retry = await retryFailures(job, user.id);
    return Response.json({ data: toView(retry) }, { status: 202 });
  } catch (error) {
    if (error instanceof BulkDispatchError) return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
