import { NextResponse } from "next/server";
import { requireModule } from "@/lib/api-auth";
import { aiConfigured, aiJson, AiError } from "@/lib/ai/openai";
import { readAiStatus } from "@/lib/ai/store";

/**
 * Verificação de conexão da página /ia: um pedido mínimo à OpenAI (frações de centavo) que confirma
 * chave, modelo e créditos. A OpenAI não informa o saldo pela chave do projeto; isso diz se ainda há crédito.
 */
export async function POST() {
  const guard = await requireModule("ia", "configuracoes");
  if (guard.response) return guard.response;
  if (!aiConfigured()) return NextResponse.json({ ok: false, error: "Chave da OpenAI não configurada no servidor.", status: await readAiStatus() });
  const startedAt = Date.now();
  try {
    await aiJson<{ ok?: boolean }>([{ role: "user", content: 'Responda apenas este json: {"ok": true}' }], { feature: "check", userId: guard.user.id, maxTokens: 300 });
    return NextResponse.json({ ok: true, status: await readAiStatus() });
  } catch (error) {
    const status = await readAiStatus();
    // A OpenAI aceitou o pedido (registrado como sucesso) e só o conteúdo veio vazio: a conexão está boa.
    if (status.lastOkAt && Date.parse(status.lastOkAt) >= startedAt) return NextResponse.json({ ok: true, status });
    return NextResponse.json({ ok: false, error: error instanceof AiError ? error.message : "Não foi possível falar com a OpenAI.", status });
  }
}
