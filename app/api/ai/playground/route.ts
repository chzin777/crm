import { NextResponse } from "next/server";
import { requireModule } from "@/lib/api-auth";
import { aiConfigured, AiError } from "@/lib/ai/openai";
import { simulateAgent, type PlaygroundMessage } from "@/lib/ai/agent";
import { sanitizeAiSettings } from "@/lib/ai/settings";

/** Teste da IA com os parâmetros da tela (ainda não salvos). Nada é enviado ao cliente. */
export async function POST(request: Request) {
  const guard = await requireModule("ia", "configuracoes");
  if (guard.response) return guard.response;
  if (!aiConfigured()) return NextResponse.json({ error: "IA não configurada: defina OPENAI_API_KEY no servidor." }, { status: 503 });
  const body = (await request.json().catch(() => null)) as { settings?: unknown; messages?: unknown } | null;
  const messages = Array.isArray(body?.messages)
    ? (body.messages as Record<string, unknown>[])
        .map((item): PlaygroundMessage => ({ from: item?.from === "ai" ? "ai" : "customer", text: String(item?.text ?? "").slice(0, 2000).trim() }))
        .filter((item) => item.text)
        .slice(-20)
    : [];
  if (!messages.some((item) => item.from === "customer")) return NextResponse.json({ error: "Escreva a mensagem do cliente." }, { status: 400 });
  try {
    return NextResponse.json(await simulateAgent(sanitizeAiSettings(body?.settings), messages, guard.user.id));
  } catch (error) {
    if (error instanceof AiError) return NextResponse.json({ error: error.message }, { status: error.status === 502 ? 422 : error.status });
    console.error("[ai/playground]", error);
    return NextResponse.json({ error: "Não foi possível testar a IA." }, { status: 500 });
  }
}
