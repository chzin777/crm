import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const VERIFY_TOKEN = process.env.META_WHATSAPP_VERIFY_TOKEN || "crm_webhook_verify_token";

type WebhookStatus = "sent" | "delivered" | "read" | "failed";

interface StatusEntry {
  id: string;
  status: WebhookStatus;
  timestamp: string;
  recipient_id: string;
  errors?: { code: number; title: string; message?: string }[];
}

interface MessageEntry {
  id: string;
  from: string;
  type: string;
  timestamp: string;
  text?: { body: string };
}

interface WebhookChange {
  value: {
    messaging_product: string;
    metadata: { phone_number_id: string };
    statuses?: StatusEntry[];
    messages?: MessageEntry[];
  };
}

interface WebhookBody {
  object: string;
  entry: { changes: WebhookChange[] }[];
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN && challenge) {
    return new Response(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as WebhookBody;

    if (body.object !== "whatsapp_business_account") {
      return NextResponse.json({ ok: true });
    }

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.value.messaging_product !== "whatsapp") continue;

        await processStatuses(change.value.statuses ?? []);
        await processMessages(change.value.messages ?? []);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[webhook] Error processing webhook:", error);
    return NextResponse.json({ ok: true });
  }
}

async function processStatuses(statuses: StatusEntry[]) {
  for (const status of statuses) {
    if (!status.id) continue;

    const updateData: Record<string, unknown> = {};

    switch (status.status) {
      case "sent":
        updateData.status = "sent";
        updateData.sentAt = new Date(Number(status.timestamp) * 1000);
        break;
      case "delivered":
        updateData.status = "delivered";
        updateData.deliveredAt = new Date(Number(status.timestamp) * 1000);
        break;
      case "read":
        updateData.status = "read";
        updateData.readAt = new Date(Number(status.timestamp) * 1000);
        break;
      case "failed":
        updateData.status = "failed";
        updateData.failedAt = new Date(Number(status.timestamp) * 1000);
        updateData.failureReason = status.errors?.[0]?.message ?? status.errors?.[0]?.title ?? "Unknown error";
        break;
      default:
        continue;
    }

    try {
      await prisma.campaignMessage.updateMany({
        where: { whatsappMsgId: status.id },
        data: updateData,
      });
    } catch (error) {
      console.error(`[webhook] Failed to update message ${status.id}:`, error);
    }
  }
}

async function processMessages(messages: MessageEntry[]) {
  for (const message of messages) {
    if (!message.id || !message.from) continue;

    // Incoming messages from contacts - could be replies to campaigns
    // For now, we just log them. Future enhancement: link to campaign responses.
    console.log(`[webhook] Received message from ${message.from}: ${message.text?.body ?? "(media)"}`);
  }
}