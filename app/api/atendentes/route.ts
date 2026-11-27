import { requireModule } from "@/lib/api-auth";
import { canManageAttendanceAttributions } from "@/lib/attendants/access";
import { attendantKpis } from "@/lib/attendants/attribution";
import { backfillCurrentMonthIfDue, readAttendanceSettings, refreshAttendanceAttributions } from "@/lib/attendants/service";
import { prisma } from "@/lib/prisma";
import { brDay } from "@/lib/br-time";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function validDay(value: string) {
  if (!DAY.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function period(url: URL) {
  const today = brDay();
  const defaultFrom = `${today.slice(0, 7)}-01`;
  const from = url.searchParams.get("from") ?? defaultFrom;
  const to = url.searchParams.get("to") ?? today;
  if (!validDay(from) || !validDay(to) || from > to) return null;
  if ((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS > 92) return null;
  return { from, to, today, defaultFrom };
}

export async function GET(request: Request) {
  const guard = await requireModule("metricas");
  if (guard.response) return guard.response;
  const dates = period(new URL(request.url));
  if (!dates) return Response.json({ error: "Período inválido. Escolha um intervalo de até 92 dias." }, { status: 400 });

  try {
    let settings = await readAttendanceSettings();
    const from = new Date(`${dates.from}T03:00:00.000Z`);
    const to = new Date(`${dates.to}T03:00:00.000Z`);
    const existing = await prisma.attendanceSaleAttribution.count({ where: { attendanceAt: { gte: from, lt: new Date(to.getTime() + DAY_MS) } } });
    if (!existing && dates.from === dates.defaultFrom && dates.to === dates.today) {
      await backfillCurrentMonthIfDue();
      settings = await readAttendanceSettings();
    }

    const records = await prisma.attendanceSaleAttribution.findMany({
      where: { attendanceAt: { gte: from, lt: new Date(to.getTime() + DAY_MS) } },
      orderBy: [{ attendanceAt: "desc" }, { saleDate: "desc" }],
      select: {
        id: true,
        conversationId: true,
        saleKey: true,
        sourceKey: true,
        attendantId: true,
        attendantName: true,
        orderNumber: true,
        invoiceNumber: true,
        attendanceAt: true,
        orderDate: true,
        saleDate: true,
        store: true,
        seller: true,
        customerName: true,
        netAmount: true,
        windowDays: true,
        aiStatus: true,
        aiQualified: true,
        aiConfidence: true,
        aiSummary: true,
        targetStore: true,
        manualDecision: true,
        reviewNote: true,
        reviewedAt: true,
        conversation: { select: { contact: { select: { name: true, phone: true } } } },
      },
    });

    const kpis = attendantKpis(records.map((row) => ({
      conversationId: row.conversationId,
      saleKey: row.saleKey,
      aiStatus: row.aiStatus,
      aiQualified: row.aiQualified,
      manualDecision: row.manualDecision,
      netAmount: row.netAmount === null ? null : Number(row.netAmount),
    })), { mode: settings.commissionMode, value: settings.commissionValue });
    const attendantOptions = [...new Set(records.map((row) => row.attendantName).filter((name): name is string => !!name))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const storeOptions = [...new Set(records.filter((row) => row.saleKey && row.store).map((row) => row.store!))].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));

    return Response.json({
      period: { from: dates.from, to: dates.to },
      settings,
      kpis,
      canReview: await canManageAttendanceAttributions(guard.user.id),
      attendants: attendantOptions,
      stores: storeOptions,
      data: records.map((row) => ({
        id: row.id,
        conversationId: row.conversationId,
        saleKey: row.saleKey,
        customerName: row.customerName ?? row.conversation.contact.name,
        customerPhone: row.conversation.contact.phone,
        attendantId: row.attendantId,
        attendantName: row.attendantName ?? "Sem atendente identificado",
        orderNumber: row.orderNumber,
        invoiceNumber: row.invoiceNumber,
        attendanceAt: row.attendanceAt.toISOString(),
        orderDate: row.orderDate?.toISOString().slice(0, 10) ?? null,
        saleDate: row.saleDate?.toISOString().slice(0, 10) ?? null,
        store: row.store,
        seller: row.seller,
        netAmount: row.netAmount === null ? null : Number(row.netAmount),
        windowDays: row.windowDays,
        aiStatus: row.aiStatus,
        aiQualified: row.aiQualified,
        aiConfidence: row.aiConfidence,
        aiSummary: row.aiSummary,
        targetStore: row.targetStore,
        manualDecision: row.manualDecision,
        reviewNote: row.reviewNote,
        reviewedAt: row.reviewedAt?.toISOString() ?? null,
        eligible: row.manualDecision ?? (row.aiStatus === "completed" && row.aiQualified === true),
      })),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[atendentes] falha ao carregar painel:", error);
    return Response.json({ error: "Não foi possível carregar o desempenho dos atendentes." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const guard = await requireModule("metricas");
  if (guard.response) return guard.response;
  if (!(await canManageAttendanceAttributions(guard.user.id))) {
    return Response.json({ error: "Apenas gestores podem atualizar a apuração." }, { status: 403 });
  }

  let body: { from?: unknown; to?: unknown };
  try {
    body = await request.json() as { from?: unknown; to?: unknown };
  } catch {
    return Response.json({ error: "Corpo da solicitação inválido." }, { status: 400 });
  }
  const today = brDay();
  const defaultFrom = `${today.slice(0, 7)}-01`;
  if ((body.from !== undefined && typeof body.from !== "string") || (body.to !== undefined && typeof body.to !== "string")) {
    return Response.json({ error: "Informe as datas do período no formato AAAA-MM-DD." }, { status: 400 });
  }
  const from = typeof body.from === "string" ? body.from : defaultFrom;
  const to = typeof body.to === "string" ? body.to : today;
  if (!from || !to || !validDay(from) || !validDay(to) || from > to ||
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS > 92) {
    return Response.json({ error: "Período inválido. Escolha um intervalo de até 92 dias." }, { status: 400 });
  }

  try {
    const settings = await readAttendanceSettings();
    const result = await refreshAttendanceAttributions(from, to, settings.attributionWindowDays);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("[atendentes] falha na atualização:", error);
    return Response.json({ error: "Não foi possível cruzar as conversas com as vendas do VMSET." }, { status: 503 });
  }
}
