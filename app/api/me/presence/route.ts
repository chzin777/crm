import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { readOperatorSettings, setPresence, touchActivity } from "@/lib/chat/operator-presence";
import { parsePresence, PRESENCE_STATUSES } from "@/lib/chat/presence-status";

/** Status do próprio operador e lojas vinculadas (seletor da barra lateral e perfil). */
export async function GET() {
  const user = await requireApiSession();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const [agent, settings] = await Promise.all([
    prisma.chatAgent.findUnique({ where: { userId: user.id }, select: { presenceStatus: true, paused: true, awayAuto: true, stores: true } }),
    readOperatorSettings(),
  ]);
  const status = agent?.paused && parsePresence(agent.presenceStatus) === "ONLINE" ? "AWAY" : parsePresence(agent?.presenceStatus);
  return NextResponse.json(
    { data: { status, awayAuto: agent?.awayAuto ?? false, stores: agent?.stores ?? [], autoAwayMinutes: settings.autoAwayMinutes } },
    { headers: { "Cache-Control": "no-store" } },
  );
}

const body = z.object({ status: z.enum(PRESENCE_STATUSES as [string, ...string[]]) });

/** Troca manual: Online / Ausente / Offline. */
export async function PUT(request: Request) {
  const user = await requireApiSession();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Status inválido." }, { status: 400 });
  const status = parsePresence(parsed.data.status);
  await setPresence(user.id, status);
  return NextResponse.json({ data: { status, awayAuto: false } });
}

/** Heartbeat de interação real (o navegador manda no máximo 1 por minuto). */
export async function POST() {
  const user = await requireApiSession();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const status = await touchActivity(user.id);
  return NextResponse.json({ data: { status } }, { headers: { "Cache-Control": "no-store" } });
}
