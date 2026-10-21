import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { ensureInstance, sendMedia, sendText } from "@/lib/meta-whatsapp";
import { prisma } from "@/lib/prisma";

const MAX_FILES = 5;
const MAX_FILE_SIZE = 16 * 1024 * 1024;
const ALLOWED = (type: string) => type.startsWith("image/") || type.startsWith("video/") || type === "application/pdf";

export async function POST(request: Request) {
  if (!(await requireApiSession())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  try {
    await ensureInstance();
    const form = await request.formData();
    const phone = String(form.get("phone") ?? "");
    const text = String(form.get("text") ?? "").trim();
    const files = form.getAll("files").filter((item): item is File => item instanceof File);
    const mediaUrlsRaw = form.get("mediaUrls");
    const campaignId = form.get("campaignId") as string | null;
    const contactId = form.get("contactId") as string | null;

    let mediaUrls: { url: string; fileName: string; mimetype: string }[] = [];
    if (typeof mediaUrlsRaw === "string" && mediaUrlsRaw.trim()) {
      try {
        mediaUrls = JSON.parse(mediaUrlsRaw);
      } catch {
        return NextResponse.json({ error: "mediaUrls inválido." }, { status: 400 });
      }
    }

    if (!text && files.length === 0 && mediaUrls.length === 0) {
      return NextResponse.json({ error: "Mensagem vazia." }, { status: 400 });
    }

    const sentMsgIds: string[] = [];

    // Envio via URLs do MinIO (campanhas)
    if (mediaUrls.length > 0) {
      for (const [index, media] of mediaUrls.entries()) {
        const result = await sendMedia(
          phone,
          { mimetype: media.mimetype, fileName: media.fileName, url: media.url },
          index === 0 ? text : undefined
        );
        if (result?.messages?.[0]?.id) sentMsgIds.push(result.messages[0].id);
      }
    } else if (files.length > MAX_FILES) {
      return NextResponse.json({ error: `Máximo de ${MAX_FILES} arquivos.` }, { status: 400 });
    } else {
      for (const file of files) {
        if (!ALLOWED(file.type) || file.size > MAX_FILE_SIZE) {
          return NextResponse.json({ error: `Arquivo não permitido: ${file.name}` }, { status: 400 });
        }
      }

      if (files.length === 0) {
        const result = await sendText(phone, text);
        if (result?.messages?.[0]?.id) sentMsgIds.push(result.messages[0].id);
      } else {
        for (const [index, file] of files.entries()) {
          const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
          const result = await sendMedia(phone, { mimetype: file.type, fileName: file.name, base64 }, index === 0 ? text : undefined);
          if (result?.messages?.[0]?.id) sentMsgIds.push(result.messages[0].id);
        }
      }
    }

    // Salvar rastreamento se for mensagem de campanha
    if (campaignId && sentMsgIds.length > 0) {
      for (const msgId of sentMsgIds) {
        try {
          await prisma.campaignMessage.create({
            data: {
              campaignId,
              contactId: contactId ?? undefined,
              phone,
              whatsappMsgId: msgId,
              status: "sent",
              sentAt: new Date(),
            },
          });
        } catch (err) {
          console.error(`[send] Failed to track message ${msgId}:`, err);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao enviar." }, { status: 502 });
  }
}
