import { requireModule } from "@/lib/api-auth";
import { brDay, brDaysAgo } from "@/lib/br-time";
import { analyzeObjections, conversionReport } from "@/lib/commercial/jobs-db";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function period(url: URL) {
  const start = url.searchParams.get("start") ?? "";
  const end = url.searchParams.get("end") ?? "";
  const to = DAY.test(end) ? end : brDay();
  const from = DAY.test(start) && start <= to ? start : brDaysAgo(30);
  return { from, to };
}

/** Conversão real (atendimentos x vendas faturadas no VMSet em até 15 dias), mapa de objeções e lembretes enviados. */
export async function GET(request: Request) {
  const guard = await requireModule("metricas");
  if (guard.response) return guard.response;
  const { from, to } = period(new URL(request.url));
  try {
    return Response.json({ data: await conversionReport(from, to) }, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch (error) {
    console.error("[dashboard/conversion] falha:", error);
    return Response.json({ error: "Não foi possível calcular a conversão." }, { status: 500 });
  }
}

/** Reanalisa as objeções das conversas encerradas no período (até 90 dias). */
export async function POST(request: Request) {
  const guard = await requireModule("metricas");
  if (guard.response) return guard.response;
  const { from, to } = period(new URL(request.url));
  const start = new Date(`${from}T03:00:00Z`);
  const end = new Date(new Date(`${to}T03:00:00Z`).getTime() + DAY_MS);
  if (end.getTime() - start.getTime() > 92 * DAY_MS) return Response.json({ error: "Escolha um período de até 90 dias." }, { status: 400 });
  try {
    return Response.json({ analyzed: await analyzeObjections(start, end) });
  } catch (error) {
    console.error("[dashboard/conversion] objeções:", error);
    return Response.json({ error: "Não foi possível analisar as objeções." }, { status: 500 });
  }
}
