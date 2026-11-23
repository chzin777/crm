import { timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole, resolveAccess, type ModuleAccess, type ModuleKey } from "@/lib/permissions";

/** Sessão válida, inclusive de quem ainda está com senha provisória (só para a tela de primeiro acesso). */
export async function getAuthSession() {
  return auth.api.getSession({ headers: await headers() });
}

/** Sessão liberada para o CRM: com senha provisória (`mustChangePassword`), nenhuma API de negócio responde. */
export async function requireApiSession() {
  const session = await getAuthSession();
  if (!session?.user || session.user.mustChangePassword) return null;
  return session.user;
}

export const MUST_CHANGE_PASSWORD = "MUST_CHANGE_PASSWORD";

export async function getUserAccess(userId: string): Promise<{ isAdmin: boolean; modules: ModuleAccess } | null> {
  const record = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, banned: true, roleRef: { select: { permissions: true } } },
  });
  if (!record || record.banned) return null;
  const modules = resolveAccess(record.role, record.roleRef?.permissions);
  return { isAdmin: isAdminRole(record.role), modules };
}

type ModuleGuard = { user: NonNullable<Awaited<ReturnType<typeof requireApiSession>>>; response?: undefined } | { user?: undefined; response: Response };

/** Exige sessão válida e acesso a pelo menos um dos módulos informados. */
export async function requireModule(...modules: ModuleKey[]): Promise<ModuleGuard> {
  const user = await requireApiSession();
  if (!user) return { response: Response.json({ error: "Não autenticado." }, { status: 401 }) };
  const access = await getUserAccess(user.id);
  if (!access || !modules.some((module) => access.modules[module])) {
    return { response: Response.json({ error: "Sem permissão para esta ação." }, { status: 403 }) };
  }
  return { user };
}

/** Aceita sessão válida ou o token de serviço SYNC_API_TOKEN (Authorization: Bearer). */
export async function requireSessionOrSyncToken(request: Request): Promise<Response | null> {
  const expected = process.env.SYNC_API_TOKEN;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (expected && provided.length === expected.length && timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) return null;
  if (await requireApiSession()) return null;
  return Response.json({ error: "Não autorizado." }, { status: 401 });
}
