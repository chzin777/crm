import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/api-auth";
import { readRfvpSettings, rfvpProblems, RFVP_SEGMENTS } from "@/lib/rfvp";
import { readRfvpConfig, rfvpRunning, runRfvp, saveRfvpSettings } from "@/lib/rfvp-db";

/** Critérios vigentes, último recálculo e quantos clientes há em cada segmento. */
export async function GET() {
  const guard = await requireModule("pontuacao", "contatos", "automacoes");
  if (guard.response) return guard.response;
  const [{ settings, lastRun }, groups, punctuality] = await Promise.all([
    readRfvpConfig(),
    prisma.contact.groupBy({ by: ["rfvpSegment"], _count: { _all: true }, where: { rfvpSegment: { not: null } } }),
    prisma.vmsetPunctuality.aggregate({ _count: { _all: true }, _max: { syncedAt: true } }),
  ]);
  const counts = new Map(groups.map((row) => [row.rfvpSegment, row._count._all]));
  return Response.json({
    settings, lastRun, running: rfvpRunning(),
    segments: RFVP_SEGMENTS.map((item) => ({ key: item.key, label: item.label, description: item.description, tone: item.tone, dot: item.dot, count: counts.get(item.key) ?? 0 })),
    punctuality: { customers: punctuality._count._all, syncedAt: punctuality._max.syncedAt },
  });
}

/** Salva os critérios (faixas em ordem); o recálculo é feito pelo botão ou no próximo ciclo diário. */
export async function PUT(request: Request) {
  const guard = await requireModule("pontuacao");
  if (guard.response) return guard.response;
  const body = (await request.json().catch(() => null)) as { settings?: unknown } | null;
  const settings = readRfvpSettings(body?.settings, true);
  const problems = rfvpProblems(settings);
  if (problems.length) return Response.json({ error: problems[0], problems }, { status: 400 });
  await saveRfvpSettings(settings);
  return Response.json({ settings });
}

/** "Recalcular RFV-P agora": roda em segundo plano (pontualidade do VMSet + todos os contatos). */
export async function POST() {
  const guard = await requireModule("pontuacao");
  if (guard.response) return guard.response;
  const already = rfvpRunning();
  void runRfvp("manual").catch(() => undefined);
  return Response.json({ started: !already, running: true }, { status: 202 });
}
