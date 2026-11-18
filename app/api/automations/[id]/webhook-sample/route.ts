import { NextResponse } from "next/server";
import { requireModule } from "@/lib/api-auth";
import { clearWebhookSample, readWebhookSample } from "@/lib/automations/webhook-db";
import { guessField } from "@/lib/automations/webhook-lead";

type Context = { params: Promise<{ id: string }> };

/** Última amostra recebida pela URL do webhook do fluxo, com o palpite de nome/telefone/e-mail/origem. */
export async function GET(_request: Request, { params }: Context) {
  const guard = await requireModule("automacoes");
  if (guard.response) return guard.response;
  const { id } = await params;
  const sample = await readWebhookSample(id);
  return NextResponse.json({ sample, guess: sample ? { phone: guessField(sample.fields, "phone"), name: guessField(sample.fields, "name"), email: guessField(sample.fields, "email"), source: guessField(sample.fields, "source") } : null });
}

/** Começa a escutar: limpa a amostra anterior para a tela esperar um evento novo. */
export async function DELETE(_request: Request, { params }: Context) {
  const guard = await requireModule("automacoes");
  if (guard.response) return guard.response;
  const { id } = await params;
  await clearWebhookSample(id);
  return NextResponse.json({ ok: true });
}
