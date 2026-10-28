import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

// Verificação do webhook (a Meta chama via GET ao cadastrar a URL).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const expected = process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (expected && url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === expected) {
    return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

function validSignature(body: string, header: string | null) {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return true;
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(body).digest();
  const received = Buffer.from(header.slice(7), "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

type StatusEvent = {
  id?: string;
  status?: string;
  recipient_id?: string;
  errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[];
};

// Registra o status de entrega (sent/delivered/read/failed) e o motivo das falhas nos logs.
export async function POST(request: Request) {
  const raw = await request.text();
  if (!validSignature(raw, request.headers.get("x-hub-signature-256"))) {
    return new Response("Invalid signature", { status: 401 });
  }
  try {
    const payload = JSON.parse(raw) as { entry?: { changes?: { field?: string; value?: { statuses?: StatusEvent[] } }[] }[] };
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const status of change.value?.statuses ?? []) {
          const error = status.errors?.[0];
          console.log(
            `[whatsapp/webhook] ${status.status} para ${status.recipient_id} (${status.id})` +
              (error ? ` — erro ${error.code}: ${error.title ?? error.message}${error.error_data?.details ? ` | ${error.error_data.details}` : ""}` : ""),
          );
        }
      }
    }
  } catch (error) {
    console.error("[whatsapp/webhook] payload inválido:", error);
  }
  return NextResponse.json({ ok: true });
}
