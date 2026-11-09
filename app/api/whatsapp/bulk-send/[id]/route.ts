import { requireApiSession } from "@/lib/api-auth";
import { getBulkJob, toView } from "@/lib/bulk-dispatch";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;
  const job = await getBulkJob(id, user.id);
  if (!job) return Response.json({ error: "Envio não encontrado." }, { status: 404 });
  return Response.json({ data: toView(job) });
}
