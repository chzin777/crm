import { timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole, resolveAccess, type ModuleAccess, type ModuleKey } from "@/lib/permissions";

export async function requireApiSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

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
