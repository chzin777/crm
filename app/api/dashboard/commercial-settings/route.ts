import { requireModule } from "@/lib/api-auth";
import { readCommercialSettings, saveCommercialSettings } from "@/lib/commercial/jobs-db";

/** Modelos oficiais dos lembretes de pós-venda e recuperação automática de orçamento. */
export async function GET() {
  const guard = await requireModule("metricas", "configuracoes");
  if (guard.response) return guard.response;
  return Response.json({ data: await readCommercialSettings() });
}

export async function PUT(request: Request) {
  const guard = await requireModule("configuracoes", "metricas");
  if (guard.response) return guard.response;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return Response.json({ error: "Dados inválidos." }, { status: 400 });
  return Response.json({ data: await saveCommercialSettings(body) });
}
