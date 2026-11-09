import { requireModule } from "@/lib/api-auth";
import { getCustomerDashboard, getCustomerDashboardOptions, INACTIVE_DAY_OPTIONS, type CompareMode, type CustomerPeriodPreset } from "@/lib/customer-dashboard";

const PRESETS: CustomerPeriodPreset[] = ["30d", "month", "quarter", "custom"];

/** Painel de clientes e retenção: base, compradores, inativos, insatisfação, ticket, saúde da carteira e clientes em risco. */
export async function GET(request: Request) {
  const guard = await requireModule("painel");
  if (guard.response) return guard.response;
  const url = new URL(request.url);
  const preset = PRESETS.find((item) => item === url.searchParams.get("preset")) ?? "30d";
  const compare: CompareMode = url.searchParams.get("compare") === "yoy" ? "yoy" : "prev";
  const inactive = Number(url.searchParams.get("inactiveDays"));
  const inactiveDays = (INACTIVE_DAY_OPTIONS as readonly number[]).includes(inactive) ? inactive : 90;
  try {
    const [data, options] = await Promise.all([
      getCustomerDashboard({
        preset,
        start: url.searchParams.get("start") || undefined,
        end: url.searchParams.get("end") || undefined,
        compare,
        store: url.searchParams.get("store") || undefined,
        seller: url.searchParams.get("seller") || undefined,
        inactiveDays,
      }),
      getCustomerDashboardOptions(),
    ]);
    return Response.json({ data, options }, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch (error) {
    console.error("[dashboard/customers] falha ao calcular o painel:", error);
    return Response.json({ error: "Não foi possível calcular o painel de clientes." }, { status: 500 });
  }
}
