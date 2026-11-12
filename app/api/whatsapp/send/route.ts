import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { ensureInstance, listTemplates, sendMedia, sendTemplate, sendText } from "@/lib/meta-whatsapp";
import { friendlyError, recordSingleSend } from "@/lib/bulk-dispatch";
import { renderTemplateText } from "@/lib/chat/dispatch-history";

const MAX_FILES = 5;
const MAX_FILE_SIZE = 16 * 1024 * 1024;
const ALLOWED = (type: string) => type.startsWith("image/") || type.startsWith("video/") || type === "application/pdf";

type Sent = { messages?: { id: string }[] } | undefined;
const firstId = (result: Sent) => result?.messages?.[0]?.id ?? null;

/**
 * Envio individual (card do pipeline, "Enviar notificação" de um modelo).
 * Todo envio aceito ou recusado pela Meta fica registrado (lote de 1 em /campanhas, métricas e /chat);
 * a confirmação de entrega ou a falha posterior chega pelo webhook e atualiza o mesmo registro.
 */
export async function POST(request: Request) {
  const user = await requireApiSession();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Envio inválido." }, { status: 400 });
  }
  const phone = String(form.get("phone") ?? "");
  const text = String(form.get("text") ?? "").trim();
  const contactId = String(form.get("contactId") ?? "").trim() || null;
  const recipientName = String(form.get("recipientName") ?? "").trim();
  const origin = String(form.get("origin") ?? "").trim().slice(0, 40) || "Envio direto";
  const templateName = String(form.get("templateName") ?? "").trim();
  const templateLanguage = String(form.get("templateLanguage") ?? "pt_BR");
  let templateParams: string[] = [];
  let template: { name: string; language: string; params: string[]; category?: string } | null = null;
  let sentText = text;

  const record = (messageId: string | null, failure?: string) =>
    recordSingleSend({
      userId: user.id,
      userName: user.name ?? "Usuário",
      origin,
      phone,
      contactId,
      nome: recipientName,
      text: sentText || text || "(mensagem)",
      template,
      messageId,
      failure,
    }).catch((error) => console.error("[whatsapp/send] registrar envio:", error));

  try {
    await ensureInstance();
    const files = form.getAll("files").filter((item): item is File => item instanceof File);
    const mediaUrlsRaw = form.get("mediaUrls");

    let mediaUrls: { url: string; fileName: string; mimetype: string }[] = [];
    if (typeof mediaUrlsRaw === "string" && mediaUrlsRaw.trim()) {
      try {
        mediaUrls = JSON.parse(mediaUrlsRaw);
      } catch {
        return NextResponse.json({ error: "mediaUrls inválido." }, { status: 400 });
      }
    }

    if (templateName) {
      try {
        templateParams = (JSON.parse(String(form.get("templateParams") ?? "[]")) as unknown[]).map(String);
      } catch {
        return NextResponse.json({ error: "templateParams inválido." }, { status: 400 });
      }
      // Falha ao listar os modelos não impede o envio: só perde a prévia do texto e a checagem de variáveis.
      const metaTemplate = (await listTemplates().catch(() => [])).find((item) => item.name === templateName && item.language === templateLanguage);
      template = { name: templateName, language: templateLanguage, params: templateParams, category: metaTemplate?.category };
      sentText = renderTemplateText(metaTemplate, templateName, templateParams);
      // Variável vazia faz a Meta recusar o modelo (132000): avisa antes de enviar.
      const expected = Math.max(0, ...[...(metaTemplate?.body ?? "").matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1])));
      if (templateParams.length < expected || templateParams.slice(0, expected).some((value) => !value.trim())) {
        return NextResponse.json({ error: `Este modelo tem ${expected} variável(is): preencha todas antes de enviar.` }, { status: 400 });
      }

      const headerFile = form.get("headerImage");
      const headerImageUrl = String(form.get("headerImageUrl") ?? "").trim();
      let headerImage = headerFile instanceof File && headerFile.size > 0
        ? { mimetype: headerFile.type, fileName: headerFile.name, base64: Buffer.from(await headerFile.arrayBuffer()).toString("base64") }
        : headerImageUrl
          ? { mimetype: String(form.get("headerImageType") ?? "image/jpeg"), fileName: "header", url: headerImageUrl }
          : undefined;
      if (!headerImage && metaTemplate?.headerFormat === "IMAGE") {
        // Sem imagem informada: usa a imagem de exemplo que o modelo guarda na Meta.
        if (!metaTemplate.headerImageUrl) {
          return NextResponse.json({ error: "Este modelo exige uma imagem e a Meta não retornou a do modelo. Anexe uma imagem (JPG ou PNG)." }, { status: 400 });
        }
        const downloaded = await fetch(metaTemplate.headerImageUrl);
        if (!downloaded.ok) {
          return NextResponse.json({ error: "Não foi possível carregar a imagem do modelo. Anexe uma imagem (JPG ou PNG)." }, { status: 400 });
        }
        const mimetype = downloaded.headers.get("content-type")?.split(";")[0] || "image/jpeg";
        headerImage = { mimetype, fileName: "header", base64: Buffer.from(await downloaded.arrayBuffer()).toString("base64") };
      }
      const result = await sendTemplate(phone, templateName, templateLanguage, templateParams, headerImage);
      console.log("[whatsapp/send] modelo aceito pela Meta:", JSON.stringify(result));
      await record(firstId(result));
      return NextResponse.json({ ok: true, messageId: firstId(result) });
    }

    if (!text && files.length === 0 && mediaUrls.length === 0) {
      return NextResponse.json({ error: "Mensagem vazia." }, { status: 400 });
    }

    // Envio via URLs do MinIO (campanhas)
    if (mediaUrls.length > 0) {
      let messageId: string | null = null;
      for (const [index, media] of mediaUrls.entries()) {
        const result = await sendMedia(phone, { mimetype: media.mimetype, fileName: media.fileName, url: media.url }, index === 0 ? text : undefined);
        messageId ??= firstId(result);
      }
      sentText = [mediaUrls.map((media) => `📎 ${media.fileName}`).join("\n"), text].filter(Boolean).join("\n\n");
      await record(messageId);
      return NextResponse.json({ ok: true, messageId });
    }

    // Envio via upload direto (mensagens individuais)
    if (files.length > MAX_FILES) {
      return NextResponse.json({ error: `Máximo de ${MAX_FILES} arquivos.` }, { status: 400 });
    }
    for (const file of files) {
      if (!ALLOWED(file.type) || file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: `Arquivo não permitido: ${file.name}` }, { status: 400 });
      }
    }

    let messageId: string | null = null;
    if (files.length === 0) {
      const result = await sendText(phone, text);
      console.log("[whatsapp/send] texto aceito pela Meta:", JSON.stringify(result));
      messageId = firstId(result);
    } else {
      for (const [index, file] of files.entries()) {
        const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
        const result = await sendMedia(phone, { mimetype: file.type, fileName: file.name, base64 }, index === 0 ? text : undefined);
        messageId ??= firstId(result);
      }
      sentText = [files.map((file) => `📎 ${file.name}`).join("\n"), text].filter(Boolean).join("\n\n");
    }
    await record(messageId);
    return NextResponse.json({ ok: true, messageId });
  } catch (error) {
    console.error("[whatsapp/send] falha:", error);
    const message = error instanceof Error ? error.message : "Falha ao enviar.";
    const friendly = message.includes("#131058")
      ? "O modelo hello_world só pode ser enviado a partir dos números de teste públicos da Meta. Crie e aprove um modelo próprio para enviar deste número."
      : friendlyError(error);
    // Recusa da Meta também fica registrada, com o motivo, no envio individual.
    if (phone.replace(/\D/g, "").length >= 10) await record(null, friendly);
    // 502 é substituído pela página de erro do Cloudflare; 422 preserva a mensagem para o usuário.
    return NextResponse.json({ error: friendly }, { status: 422 });
  }
}
