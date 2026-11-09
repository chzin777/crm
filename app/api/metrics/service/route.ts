import { requireModule } from "@/lib/api-auth";
import { getServiceMetrics, getServiceMetricsOptions, type PeriodPreset } from "@/lib/service-metrics";

const PRESETS: PeriodPreset[] = ["today", "7d", "30d", "month", "custom"];

/** Métricas de atendimento (TME, TMA, TMR, volume, NPS, ranking, termos e regiões) com filtros de período, fila e atendente. */
export async function GET(request: Request) {
  const guard = await requireModule("metricas");
  if (guard.response) return guard.response;
  const url = new URL(request.url);
  const preset = (PRESETS.find((item) => item === url.searchParams.get("preset")) ?? "7d") as PeriodPreset;
  try {
    const [metrics, options] = await Promise.all([
      getServiceMetrics({
        preset,
        start: url.searchParams.get("start") || undefined,
        end: url.searchParams.get("end") || undefined,
        queueId: url.searchParams.get("queueId") || undefined,
        assigneeId: url.searchParams.get("assigneeId") || undefined,
      }),
      getServiceMetricsOptions(),
    ]);
    return Response.json({ data: metrics, options }, { headers: { "Cache-Control": "private, max-age=30" } });
  } catch (error) {
    console.error("[metrics/service] falha ao calcular métricas:", error);
    return Response.json({ error: "Não foi possível calcular as métricas de atendimento." }, { status: 500 });
  }
}
