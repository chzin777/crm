import { requireModule } from "@/lib/api-auth";
import { canManageAttendanceAttributions } from "@/lib/attendants/access";
import { readAttendanceSettings } from "@/lib/attendants/service";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const guard = await requireModule("metricas");
  if (guard.response) return guard.response;
  try {
    return Response.json({ settings: await readAttendanceSettings() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[atendentes] falha ao carregar regras:", error);
    return Response.json({ error: "Não foi possível carregar as regras de apuração." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const guard = await requireModule("metricas");
  if (guard.response) return guard.response;
  if (!(await canManageAttendanceAttributions(guard.user.id))) {
    return Response.json({ error: "Apenas gestores podem alterar as regras de apuração." }, { status: 403 });
  }

  let body: { attributionWindowDays?: unknown; commissionMode?: unknown; commissionValue?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return Response.json({ error: "Corpo da solicitação inválido." }, { status: 400 });
  }
  const windowDays = body.attributionWindowDays;
  const mode = body.commissionMode;
  const value = body.commissionValue;
  if (windowDays !== undefined && windowDays !== 7 && windowDays !== 15) {
    return Response.json({ error: "A janela de atribuição deve ser de 7 ou 15 dias." }, { status: 400 });
  }
  if (mode !== undefined && mode !== "sale" && mode !== "percentage") {
    return Response.json({ error: "Regra de premiação inválida." }, { status: 400 });
  }
  if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1_000_000)) {
    return Response.json({ error: "Informe um valor de premiação válido." }, { status: 400 });
  }
  if (mode === "percentage" && typeof value === "number" && value > 100) {
    return Response.json({ error: "A comissão percentual não pode exceder 100%." }, { status: 400 });
  }
  if (windowDays === undefined && mode === undefined && value === undefined) {
    return Response.json({ error: "Informe ao menos uma regra para atualizar." }, { status: 400 });
  }

  try {
    const existing = await readAttendanceSettings();
    const updated = await prisma.attendanceSaleSetting.update({
      where: { id: "default" },
      data: {
        attributionWindowDays: windowDays === undefined ? existing.attributionWindowDays : windowDays,
        commissionMode: mode === undefined ? existing.commissionMode : mode,
        commissionValue: value === undefined ? existing.commissionValue : value,
        lastSyncAt: null,
      },
    });
    return Response.json({
      settings: {
        attributionWindowDays: updated.attributionWindowDays,
        commissionMode: updated.commissionMode,
        commissionValue: Number(updated.commissionValue),
      },
    });
  } catch (error) {
    console.error("[atendentes] falha ao salvar regras:", error);
    return Response.json({ error: "Não foi possível salvar as regras de apuração." }, { status: 500 });
  }
}
