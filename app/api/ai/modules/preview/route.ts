import { NextResponse } from "next/server";
import { requireModule } from "@/lib/api-auth";
import { inspectSystemPrompt } from "@/lib/ai/agent";

/** Prompt de sistema exato que iria para a OpenAI agora, para a mensagem de exemplo ({ text, firstReply }). */
export async function POST(request: Request) {
  const guard = await requireModule("ia", "configuracoes");
  if (guard.response) return guard.response;
  const body = (await request.json().catch(() => null)) as { text?: unknown; firstReply?: unknown; queued?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.slice(0, 2000) : "";
  return NextResponse.json(await inspectSystemPrompt({ text, firstReply: body?.firstReply !== false, queued: body?.queued === true }));
}
