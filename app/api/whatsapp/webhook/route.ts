import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
  if (!secret) return false;
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(body).digest();
  const received = Buffer.from(header.slice(7), "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

type StatusEvent = {
  id?: string;
  status?: string;
  timestamp?: string;
  recipient_id?: string;
  errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[];
};

type InboundMessageEvent = {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: { caption?: string };
  video?: { caption?: string };
  audio?: { transcript?: string };
  document?: { caption?: string };
};

const statusRank = { queued: 0, sent: 1, delivered: 2, read: 3, replied: 4 } as const;

// Atualiza o registro da mensagem da campanha; nunca retrocede o status (ex.: read não volta para delivered).
async function updateMessageStatus(event: StatusEvent) {
  if (!event.id || !event.status) return;
  const message = await prisma.campaignMessage.findUnique({ where: { whatsappMsgId: event.id }, select: { id: true, status: true } });
  if (!message) return;
  const at = event.timestamp ? new Date(Number(event.timestamp) * 1000) : new Date();
  if (event.status === "failed") {
    const error = event.errors?.[0];
    await prisma.campaignMessage.update({
      where: { id: message.id },
      data: { status: "failed", failedAt: at, failureReason: (error?.error_data?.details ?? error?.title ?? error?.message ?? "Falha informada pela Meta").slice(0, 500) },
    });
    return;
  }
  if (event.status !== "sent" && event.status !== "delivered" && event.status !== "read") return;
  if (message.status !== "failed" && statusRank[message.status as keyof typeof statusRank] >= statusRank[event.status]) return;
  await prisma.campaignMessage.update({
    where: { id: message.id },
    data: { status: event.status, ...(event.status === "sent" ? { sentAt: at } : event.status === "delivered" ? { deliveredAt: at } : { readAt: at }) },
  });
}

// Processa mensagens recebidas (inbound): salva no DB e marca repliedAt na última mensagem enviada ao contato.
async function handleInboundMessage(msg: InboundMessageEvent) {
  if (!msg.id || !msg.from) return;
  const receivedAt = msg.timestamp ? new Date(Number(msg.timestamp) * 1000) : new Date();
  const text = msg.text?.body ?? msg.image?.caption ?? msg.video?.caption ?? msg.audio?.transcript ?? msg.document?.caption ?? null;
  const mediaType = msg.type === "text" ? null : msg.type ?? null;

  // Normaliza telefone para buscar contato (remove 55 se presente)
  let phoneDigits = msg.from.replace(/\D/g, "");
  if (phoneDigits.startsWith("55") && phoneDigits.length > 11) phoneDigits = phoneDigits.slice(2);

  const contact = await prisma.contact.findFirst({
    where: { OR: [{ phone: msg.from }, { phone: phoneDigits }, { phone: `55${phoneDigits}` }] },
    select: { id: true },
  });

  // Salva mensagem recebida
  await prisma.inboundMessage.upsert({
    where: { whatsappMsgId: msg.id },
    create: { whatsappMsgId: msg.id, contactId: contact?.id ?? null, phone: msg.from, text, mediaType, receivedAt },
    update: { text, mediaType, receivedAt },
  });

  // Marca repliedAt na última mensagem enviada ao contato que ainda não foi respondida
  if (contact?.id) {
    const lastSent = await prisma.campaignMessage.findFirst({
      where: { contactId: contact.id, status: { in: ["sent", "delivered", "read"] }, repliedAt: null },
      orderBy: { sentAt: "desc" },
      select: { id: true },
    });
    if (lastSent) {
      await prisma.campaignMessage.update({
        where: { id: lastSent.id },
        data: { repliedAt: receivedAt, status: "replied" },
      });
    }
  }

  console.log(`[whatsapp/webhook] inbound de ${msg.from} (${msg.id})${contact ? ` → contato ${contact.id}` : " → sem contato"}`);
}

// Registra o status de entrega (sent/delivered/read/failed) e o motivo das falhas nos logs.
export async function POST(request: Request) {
  const raw = await request.text();
  if (!validSignature(raw, request.headers.get("x-hub-signature-256"))) {
    return new Response("Invalid signature", { status: 401 });
  }
  try {
    const payload = JSON.parse(raw) as { entry?: { changes?: { field?: string; value?: { statuses?: StatusEvent[]; messages?: InboundMessageEvent[] } }[] }[] };
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const status of change.value?.statuses ?? []) {
          await updateMessageStatus(status).catch((failure) => console.error("[whatsapp/webhook] atualizar status:", failure));
          const error = status.errors?.[0];
          console.log(
            `[whatsapp/webhook] ${status.status} para ${status.recipient_id} (${status.id})` +
              (error ? ` — erro ${error.code}: ${error.title ?? error.message}${error.error_data?.details ? ` | ${error.error_data.details}` : ""}` : ""),
          );
        }
        for (const msg of change.value?.messages ?? []) {
          await handleInboundMessage(msg).catch((failure) => console.error("[whatsapp/webhook] processar inbound:", failure));
        }
      }
    }
  } catch (error) {
    console.error("[whatsapp/webhook] payload inválido:", error);
  }
  return NextResponse.json({ ok: true });
}
