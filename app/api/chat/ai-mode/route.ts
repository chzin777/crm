import { NextResponse } from "next/server";
import { requireChatActor } from "@/lib/chat/access";
import { aiConfigured } from "@/lib/ai/openai";
import { readAiSettings } from "@/lib/ai/store";

/** Modo da IA para o indicador do /chat: "triage_only" = filtra robôs/ruídos pós-campanha, mas não responde clientes. */
export async function GET() {
  const guard = await requireChatActor();
  if (guard.response) return guard.response;
  const settings = await readAiSettings();
  const configured = aiConfigured();
  const triage = configured && settings.triageEnabled;
  const replies = configured && settings.autonomousEnabled;
  const mode = triage && !replies ? "triage_only" : replies ? "replies" : "off";
  return NextResponse.json({ mode, triage, replies }, { headers: { "Cache-Control": "no-store" } });
}
