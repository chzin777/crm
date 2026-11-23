import { NextResponse } from "next/server";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { prisma } from "@/lib/prisma";
import { getAuthSession } from "@/lib/api-auth";
import { passwordMeetsPolicy } from "@/lib/password-policy";

/** Situação do primeiro acesso de quem está logado (a tela decide se mostra o formulário ou segue para o painel). */
export async function GET() {
  const session = await getAuthSession();
  if (!session?.user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  return NextResponse.json({ data: { name: session.user.name, mustChangePassword: Boolean(session.user.mustChangePassword) } });
}

/** Troca a senha provisória pela definitiva e libera o CRM na mesma sessão. */
export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session?.user) return NextResponse.json({ error: "Sua sessão expirou. Entre novamente." }, { status: 401 });
  if (!session.user.mustChangePassword) return NextResponse.json({ data: { ok: true } });

  const body = (await request.json().catch(() => null)) as { password?: unknown; confirmation?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";
  const confirmation = typeof body?.confirmation === "string" ? body.confirmation : "";
  if (!passwordMeetsPolicy(password)) {
    return NextResponse.json({ error: "A senha precisa de pelo menos 12 caracteres, com letras e números." }, { status: 400 });
  }
  if (password.length > 128) return NextResponse.json({ error: "A senha pode ter no máximo 128 caracteres." }, { status: 400 });
  if (password !== confirmation) return NextResponse.json({ error: "As senhas não conferem." }, { status: 400 });

  const userId = session.user.id;
  const account = await prisma.account.findFirst({ where: { userId, providerId: "credential" }, select: { id: true, password: true } });
  if (account?.password && (await verifyPassword({ hash: account.password, password }))) {
    return NextResponse.json({ error: "A nova senha não pode ser igual à senha provisória." }, { status: 400 });
  }

  const hashed = await hashPassword(password);
  await prisma.$transaction([
    account
      ? prisma.account.update({ where: { id: account.id }, data: { password: hashed } })
      : prisma.account.create({ data: { id: crypto.randomUUID(), accountId: userId, providerId: "credential", userId, password: hashed } }),
    prisma.user.update({ where: { id: userId }, data: { mustChangePassword: false } }),
    // A sessão atual continua (o CRM é liberado na hora); outras sessões abertas com a senha provisória caem.
    prisma.session.deleteMany({ where: { userId, id: { not: session.session.id } } }),
  ]);
  return NextResponse.json({ data: { ok: true } });
}
