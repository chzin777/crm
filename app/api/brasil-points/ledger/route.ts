import { z } from "zod";
import { adminName, pointsErrorResponse, requirePointsAdmin } from "@/lib/brasil-points/api";
import { balanceOf, manualEntry } from "@/lib/brasil-points/engine";
import { LEDGER_FILTERS, ledgerPage, type LedgerFilter } from "@/lib/brasil-points/queries";
import { prisma } from "@/lib/prisma";

/** Extrato de um vendedor (gestão): ?userId=...&filter=todos|ganhos|perdas|resgates&page=1 */
export async function GET(request: Request) {
  const guard = await requirePointsAdmin();
  if (guard.response) return guard.response;
  const params = new URL(request.url).searchParams;
  const userId = params.get("userId");
  if (!userId) return Response.json({ error: "Informe o vendedor." }, { status: 400 });
  const filter = (params.get("filter") ?? "todos") as LedgerFilter;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [data, balance] = await Promise.all([ledgerPage(userId, filter in LEDGER_FILTERS ? filter : "todos", page), balanceOf(prisma, userId)]);
  return Response.json({ data: { ...data, balance } }, { headers: { "Cache-Control": "no-store" } });
}

const manual = z.object({
  userId: z.string().min(1),
  points: z.number().int().refine((value) => value !== 0 && Math.abs(value) <= 1_000_000, "Informe os pontos."),
  reason: z.string().trim().min(5, "Escreva a justificativa (o vendedor vê no extrato).").max(500),
  ruleId: z.string().nullable().optional(),
});

/** Lançamento manual: bônus (+) ou desconto (−) com justificativa obrigatória. */
export async function POST(request: Request) {
  const guard = await requirePointsAdmin();
  if (guard.response) return guard.response;
  const parsed = manual.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Lançamento inválido." }, { status: 400 });
  try {
    const entry = await manualEntry({ ...parsed.data, ruleId: parsed.data.ruleId ?? null, by: adminName(guard.user) });
    return Response.json({ data: entry }, { status: 201 });
  } catch (error) {
    return pointsErrorResponse(error, "lançamento manual");
  }
}
