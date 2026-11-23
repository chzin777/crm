import { NextResponse } from "next/server";
import { getAuthSession, getUserAccess, MUST_CHANGE_PASSWORD } from "@/lib/api-auth";

export async function GET() {
  const session = await getAuthSession();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  // Senha provisória: o painel manda para a tela de primeiro acesso.
  if (user.mustChangePassword) return NextResponse.json({ error: "Crie sua nova senha para continuar.", code: MUST_CHANGE_PASSWORD }, { status: 403 });
  const access = await getUserAccess(user.id);
  if (!access) return NextResponse.json({ error: "Usuário sem acesso." }, { status: 403 });
  return NextResponse.json({ data: access });
}
