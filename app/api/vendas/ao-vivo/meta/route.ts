import { getUserAccess, requireModule } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { broadcastGoal } from "@/lib/sales-live/live-db";
import { normalizeGoalAmount, readGoal, writeGoal, type GoalStore } from "@/lib/sales-live/goal";

const VIEW_MODULES = ["vendas", "painel", "campanhas", "metricas"] as const;
const db = prisma.crmWorkspaceData as unknown as GoalStore;
const storeParam = (value: unknown) => (typeof value === "string" && /^\d{1,6}$/.test(value.trim()) ? value.trim() : null);

/** Quem altera a meta: admin ou quem tem o módulo Metas (gestão de lojas/usuários). */
async function canEditGoal(userId: string) {
  const access = await getUserAccess(userId);
  return Boolean(access && (access.isAdmin || access.modules.metas));
}

/** Meta do Dia vigente (a mesma para qualquer usuário com acesso à tela) + se quem pede pode alterar. */
export async function GET(request: Request) {
  const guard = await requireModule(...VIEW_MODULES);
  if (guard.response) return guard.response;
  const store = storeParam(new URL(request.url).searchParams.get("store"));
  const [goal, canEdit] = await Promise.all([readGoal(db, store), canEditGoal(guard.user.id)]);
  return Response.json({ data: { goal, canEdit } }, { headers: { "Cache-Control": "no-store" } });
}

/** Define ou remove ({ amount: null }) a meta global; todas as telas abertas recebem pelo canal ao vivo. */
export async function PUT(request: Request) {
  const guard = await requireModule(...VIEW_MODULES);
  if (guard.response) return guard.response;
  if (!(await canEditGoal(guard.user.id))) return Response.json({ error: "Só gestores (módulo Metas) podem alterar a meta." }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { amount?: unknown; store?: unknown } | null;
  const amount = normalizeGoalAmount(body?.amount ?? null);
  if (amount === "invalid") return Response.json({ error: "Meta inválida." }, { status: 400 });
  const store = storeParam(body?.store);
  const goal = await writeGoal(db, amount, guard.user.name ?? guard.user.email ?? guard.user.id, store);
  broadcastGoal(store, goal);
  return Response.json({ data: { goal, canEdit: true } });
}
