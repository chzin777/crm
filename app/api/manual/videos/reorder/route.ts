import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireVideoAdmin } from "@/lib/manual-videos";

/** Grava a nova ordem da playlist: recebe os ids na ordem desejada (somente administradores). */
export async function POST(request: Request) {
  const guard = await requireVideoAdmin();
  if (guard.response) return guard.response;
  const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = body?.ids;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 1000 || !ids.every((id) => typeof id === "string")) {
    return NextResponse.json({ error: "Ordem inválida." }, { status: 400 });
  }
  await prisma.$transaction(ids.map((id, index) => prisma.manualVideo.updateMany({ where: { id }, data: { order: index + 1 } })));
  return NextResponse.json({ ok: true });
}
