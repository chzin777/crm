import { LEDGER_FILTERS, ledgerPage, type LedgerFilter } from "@/lib/brasil-points/queries";
import { noStore, requireMobileUser } from "@/lib/brasil-points/mobile";

/** Extrato do vendedor logado: ?filter=todos|ganhos|perdas|resgates&page=1&pageSize=20 */
export async function GET(request: Request) {
  const guard = await requireMobileUser();
  if (guard.response) return guard.response;
  const params = new URL(request.url).searchParams;
  const raw = (params.get("filter") ?? "todos") as LedgerFilter;
  const filter = raw in LEDGER_FILTERS ? raw : "todos";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const pageSize = Math.min(50, Math.max(5, Number(params.get("pageSize")) || 20));
  return Response.json({ data: await ledgerPage(guard.user.id, filter, page, pageSize) }, noStore);
}
