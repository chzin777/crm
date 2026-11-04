import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const event = body?.event;
    const data = body?.data;

    console.log("[Webhook/Evolution] Event:", event);

    switch (event) {
      case "MESSAGES_UPSERT": {
        const msg = data?.message;
        if (!msg) break;
        const phone = msg.key?.remoteJid?.split("@")[0]?.replace(/\D/g, "") || null;
        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || null;
        const fromMe = msg.key?.fromMe ?? false;
        if (phone && text && !fromMe) {
          const contact = await prisma.contact.findFirst({
            where: { phone: { contains: phone.slice(-11) } },
          });
          console.log(`[Webhook] Message from ${contact ? contact.name : "unknown"} (${phone}): ${text.slice(0, 50)}`);
        }
        break;
      }
      case "MESSAGES_UPDATE": {
        const updates = Array.isArray(data) ? data : [data];
        for (const upd of updates) {
          const status = upd?.update?.status;
          const msgId = upd?.key?.id;
          if (status && msgId) console.log(`[Webhook] Message ${msgId} status: ${status}`);
        }
        break;
      }
      case "CONNECTION_UPDATE": {
        const state = data?.state;
        console.log(`[Webhook] Connection state: ${state}`);
        break;
      }
      default:
        console.log(`[Webhook] Unhandled event: ${event}`);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Webhook/Evolution] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
