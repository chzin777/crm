import { NextResponse } from "next/server";
import { requireModule } from "@/lib/api-auth";
import { aiConfigured, AiError } from "@/lib/ai/openai";
import { simulateAgent, type PlaygroundMessage } from "@/lib/ai/agent";
import { sanitizeAiSettings } from "@/lib/ai/settings";
import { validateAiAttachment } from "@/lib/ai/attachments";
import type { AiMediaInput } from "@/lib/ai/multimodal";

type Payload = { settings?: unknown; messages?: unknown; profile?: unknown; ignoreMediaTrigger?: unknown; queued?: unknown; sessionId?: unknown } | null;

/**
 * Teste da IA com os parâmetros da tela (ainda não salvos). Nada é enviado ao cliente.
 * JSON (só texto) ou multipart: campo "payload" (o mesmo JSON) + "file" (anexo da última mensagem do cliente).
 */
export async function POST(request: Request) {
  const guard = await requireModule("ia", "configuracoes");
  if (guard.response) return guard.response;
  if (!aiConfigured()) return NextResponse.json({ error: "IA não configurada: defina OPENAI_API_KEY no servidor." }, { status: 503 });

  let body: Payload = null;
  let media: AiMediaInput | undefined;
  if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "Envio inválido (o arquivo pode estar acima de 10 MB)." }, { status: 400 });
    try {
      body = JSON.parse(String(form.get("payload") ?? "null")) as Payload;
    } catch {
      body = null;
    }
    const file = form.get("file");
    if (file instanceof File) {
      const check = validateAiAttachment({ name: file.name, type: file.type, size: file.size });
      if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
      media = { name: file.name.slice(0, 120), mime: file.type || "application/octet-stream", data: new Uint8Array(await file.arrayBuffer()) };
    }
  } else {
    body = (await request.json().catch(() => null)) as Payload;
  }

  const raw = Array.isArray(body?.messages) ? (body.messages as Record<string, unknown>[]) : [];
  const messages = raw
    .map((item): PlaygroundMessage => ({
      from: item?.from === "ai" ? "ai" : "customer",
      text: String(item?.text ?? "").slice(0, 2000).trim(),
      ...(typeof item?.imageSku === "string" && /^[\w.-]{1,40}$/.test(item.imageSku) ? { imageSku: item.imageSku } : {}),
      ...(typeof item?.imageUrl === "string" && /^(https?:\/\/|\/)\S{1,500}$/.test(item.imageUrl) ? { imageUrl: item.imageUrl } : {}),
      // Toque na lista interativa simulada (mesmo id do WhatsApp: "product_select:<ref>").
      ...(item?.from !== "ai" && typeof item?.selectedProductRef === "string" && /^[\w .#/-]{1,60}$/.test(item.selectedProductRef) ? { selectedProductRef: item.selectedProductRef } : {}),
    }))
    // Mensagem só com anexo (sem texto) é a última do cliente.
    .filter((item, index, list) => item.text || (media && index === list.length - 1 && item.from === "customer"))
    .slice(-20);
  if (!messages.some((item) => item.from === "customer")) return NextResponse.json({ error: "Escreva a mensagem do cliente ou anexe um arquivo." }, { status: 400 });
  try {
    return NextResponse.json(await simulateAgent(sanitizeAiSettings(body?.settings), messages, guard.user.id, media, { profile: body?.profile === "recorrente" ? "recorrente" : "novo", ignoreMediaTrigger: body?.ignoreMediaTrigger !== false, queued: body?.queued === true, sessionId: typeof body?.sessionId === "string" && /^[\w-]{8,64}$/.test(body.sessionId) ? body.sessionId : undefined }));
  } catch (error) {
    if (error instanceof AiError) return NextResponse.json({ error: error.message }, { status: error.status === 502 ? 422 : error.status });
    console.error("[ai/playground]", error);
    return NextResponse.json({ error: "Não foi possível testar a IA." }, { status: 500 });
  }
}
