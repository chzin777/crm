import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runAutomation } from "@/lib/chat/automation";
import { notifyChatChange } from "@/lib/chat/events";
import { isCustomerMessage, recordInbound, type MetaInboundMessage } from "@/lib/chat/inbound";
import { phoneVariants } from "@/lib/chat/phone";

// Verificação do webhook (a Meta chama via GET ao cadastrar a URL).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const expected = process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (expected && url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === expected) {
    return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

function validSignature(body: string, header: string | null, secret: string) {
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

const chatDeliveryBefore = { sent: ["sending"], delivered: ["sending", "sent"], read: ["sending", "sent", "delivered"] } as const;

// Tiques do atendimento: mesma regra de não regredir, por externalId.
async function updateChatDelivery(event: StatusEvent) {
  if (!event.id) return;
  if (event.status === "failed") {
    const error = event.errors?.[0];
    await prisma.chatMessage.updateMany({
      where: { externalId: event.id, delivery: { not: "read" } },
      data: { delivery: "failed", failureReason: (error?.error_data?.details ?? error?.title ?? error?.message ?? "Falha informada pela Meta").slice(0, 500) },
    });
  } else if (event.status === "sent" || event.status === "delivered" || event.status === "read") {
    await prisma.chatMessage.updateMany({
      where: { externalId: event.id, delivery: { in: [...chatDeliveryBefore[event.status]] } },
      data: { delivery: event.status },
    });
  } else {
    return;
  }
  const message = await prisma.chatMessage.findUnique({ where: { externalId: event.id }, select: { conversationId: true } });
  if (message) await prisma.chatConversation.update({ where: { id: message.conversationId }, data: { updatedAt: new Date() } });
}

// Atualiza o registro da mensagem da campanha; nunca retrocede o status (ex.: read não volta para delivered).
async function updateMessageStatus(event: StatusEvent) {
  await updateChatDelivery(event).catch((failure) => console.error("[whatsapp/webhook] atualizar entrega do chat:", failure));
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

// Salva a mensagem recebida; a resposta à campanha é registrada em recordInbound.
async function handleInboundMessage(msg: InboundMessageEvent) {
  if (!msg.id || !msg.from) return;
  const receivedAt = msg.timestamp ? new Date(Number(msg.timestamp) * 1000) : new Date();
  const text = msg.text?.body ?? msg.image?.caption ?? msg.video?.caption ?? msg.audio?.transcript ?? msg.document?.caption ?? null;
  const mediaType = msg.type === "text" ? null : msg.type ?? null;

  const contact = await prisma.contact.findFirst({
    where: { phone: { in: phoneVariants(msg.from) } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  // Salva mensagem recebida
  await prisma.inboundMessage.upsert({
    where: { whatsappMsgId: msg.id },
    create: { whatsappMsgId: msg.id, contactId: contact?.id ?? null, phone: msg.from, text, mediaType, receivedAt },
    update: { text, mediaType, receivedAt },
  });

  console.log(`[whatsapp/webhook] inbound de ${msg.from} (${msg.id})${contact ? ` → contato ${contact.id}` : " → sem contato"}`);
}

// Registra o status de entrega (sent/delivered/read/failed) e o motivo das falhas nos logs.
export async function POST(request: Request) {
  const raw = await request.text();
  const secret = process.env.META_APP_SECRET;
  // Sem 200 a Meta reenvia o evento: nada se perde enquanto a chave não estiver certa.
  if (!secret) {
    console.error("[whatsapp/webhook] evento recusado: META_APP_SECRET não está configurado no .env do servidor.");
    return new Response("Webhook not configured", { status: 503 });
  }
  if (!validSignature(raw, request.headers.get("x-hub-signature-256"), secret)) {
    console.error(`[whatsapp/webhook] assinatura inválida (${raw.length} bytes): confira se META_APP_SECRET é a chave secreta do app desta conta na Meta.`);
    return new Response("Invalid signature", { status: 401 });
  }
  try {
    const payload = JSON.parse(raw) as {
      entry?: { changes?: { field?: string; value?: { statuses?: StatusEvent[]; messages?: (InboundMessageEvent & MetaInboundMessage)[]; contacts?: { wa_id?: string; profile?: { name?: string } }[] } }[] }[];
    };
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const profiles = change.value?.contacts ?? [];
        console.log(`[whatsapp/webhook] evento ${change.field ?? "?"}: ${change.value?.messages?.length ?? 0} mensagem(ns), ${change.value?.statuses?.length ?? 0} status`);
        for (const status of change.value?.statuses ?? []) {
          await updateMessageStatus(status).catch((failure) => console.error("[whatsapp/webhook] atualizar status:", failure));
          notifyChatChange();
          const error = status.errors?.[0];
          console.log(
            `[whatsapp/webhook] ${status.status} para ${status.recipient_id} (${status.id})` +
              (error ? ` — erro ${error.code}: ${error.title ?? error.message}${error.error_data?.details ? ` | ${error.error_data.details}` : ""}` : ""),
          );
        }
        for (const msg of change.value?.messages ?? []) {
          if (!isCustomerMessage(msg.type)) {
            console.log(`[whatsapp/webhook] evento de protocolo ${msg.type ?? "sem tipo"} de ${msg.from} ignorado (${msg.id})`);
            continue;
          }
          await handleInboundMessage(msg).catch((failure) => console.error("[whatsapp/webhook] processar inbound:", failure));
          const profile = profiles.find((item) => item.wa_id === msg.from)?.profile?.name ?? profiles[0]?.profile?.name;
          let recorded;
          try {
            recorded = await recordInbound(msg, profile);
          } catch (failure) {
            // Sem a conversa gravada, a mensagem se perderia: 500 faz a Meta reenviar o evento.
            console.error("[whatsapp/webhook] gravar conversa:", failure);
            return new Response("Falha ao gravar", { status: 500 });
          }
          console.log(recorded ? `[whatsapp/webhook] mensagem ${msg.id} gravada na conversa ${recorded.conversationId}` : `[whatsapp/webhook] mensagem ${msg.id} ignorada (repetida ou reação)`);
          if (recorded) {
            notifyChatChange();
            await runAutomation(recorded).catch((failure) => console.error("[whatsapp/webhook] fluxo automático:", failure));
            notifyChatChange();
          }
        }
      }
    }
  } catch (error) {
    console.error("[whatsapp/webhook] payload inválido:", error);
  }
  return NextResponse.json({ ok: true });
}
