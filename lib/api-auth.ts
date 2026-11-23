import { timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole, resolveAccess, type ModuleAccess, type ModuleKey } from "@/lib/permissions";
import { allowsAny, modulesFor, type PolicyRoute } from "@/lib/api-policy";

/** Sessão válida, inclusive de quem ainda está com senha provisória (só para a tela de primeiro acesso). */
export async function getAuthSession() {
  return auth.api.getSession({ headers: await headers() });
}

/** Sessão liberada para o CRM: com senha provisória (`mustChangePassword`), nenhuma API de negócio responde. */
export async function requireApiSession() {
  const session = await getAuthSession();
  // Bloqueado (banned) perde o acesso na hora, mesmo com sessão ainda válida no navegador.
  if (!session?.user || session.user.mustChangePassword || (session.user as { banned?: boolean | null }).banned) return null;
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
export async function requireSessionOrSyncToken(request: Request, modules: ModuleKey[] = []): Promise<Response | null> {
  const expected = process.env.SYNC_API_TOKEN;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (expected && provided.length === expected.length && timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) return null;
  // Sessão de usuário: só quem tem o módulo (a importação em massa não fica aberta a qualquer login).
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autorizado." }, { status: 401 });
  const access = await getUserAccess(user.id);
  if (!access || !allowsAny(access.modules, modules)) return Response.json({ error: "Sem permissão para esta ação." }, { status: 403 });
  return null;
}

/**
 * Guarda das APIs que antes só exigiam sessão: 401 sem sessão, 403 sem o módulo da tabela API_POLICY, null liberado.
 * Leituras fora da tabela (lista vazia) seguem liberadas para qualquer sessão válida.
 */
export async function forbidUnless(route: PolicyRoute, method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"): Promise<Response | null> {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const modules = modulesFor(route, method);
  if (modules.length === 0) return null;
  const access = await getUserAccess(user.id);
  if (!access || !allowsAny(access.modules, modules)) return Response.json({ error: "Sem permissão para esta ação." }, { status: 403 });
  return null;
}
