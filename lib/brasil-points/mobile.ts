import "server-only";
import { requireApiSession } from "@/lib/api-auth";

/** App dos vendedores: mesma sessão do app (Better Auth, cookie/bearer) usada em /api/app/*. Cada um vê só o próprio extrato. */
export async function requireMobileUser() {
  const user = await requireApiSession();
  if (!user) return { response: Response.json({ error: "Não autenticado." }, { status: 401 }) } as const;
  return { user } as const;
}

export const noStore = { headers: { "Cache-Control": "no-store" } };
