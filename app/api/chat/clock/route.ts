import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runClock } from "@/lib/chat/clock";

function validToken(provided: string | null) {
  const expected = process.env.CHAT_CRON_TOKEN;
  if (!expected || !provided || provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

/** Rotinas por minuto, chamadas pelo cron do host. Sem CHAT_CRON_TOKEN, recusa tudo. */
export async function POST(request: Request) {
  if (!validToken(request.headers.get("x-cron-token"))) return new Response("Forbidden", { status: 403 });
  return NextResponse.json(await runClock());
}
