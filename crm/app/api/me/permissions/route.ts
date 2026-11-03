import { NextResponse } from "next/server";
import { getUserAccess, requireApiSession } from "@/lib/api-auth";

export async function GET() {
  const user = await requireApiSession();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const access = await getUserAccess(user.id);
  if (!access) return NextResponse.json({ error: "Usuário sem acesso." }, { status: 403 });
  return NextResponse.json({ data: access });
}
