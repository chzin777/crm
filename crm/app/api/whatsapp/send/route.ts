import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { ensureInstance, listTemplates, sendMedia, sendTemplate, sendText } from "@/lib/meta-whatsapp";

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

    let mediaUrls: { url: string; fileName: string; mimetype: string }[] = [];
    if (typeof mediaUrlsRaw === "string" && mediaUrlsRaw.trim()) {
      try {
        mediaUrls = JSON.parse(mediaUrlsRaw);
      } catch {
        return NextResponse.json({ error: "mediaUrls inválido." }, { status: 400 });
      }
    }

    const templateName = String(form.get("templateName") ?? "").trim();
    if (templateName) {
      const templateLanguage = String(form.get("templateLanguage") ?? "pt_BR");
      let templateParams: string[] = [];
      try {
        templateParams = JSON.parse(String(form.get("templateParams") ?? "[]"));
      } catch {
        return NextResponse.json({ error: "templateParams inválido." }, { status: 400 });
      }
      const headerFile = form.get("headerImage");
      const headerImageUrl = String(form.get("headerImageUrl") ?? "").trim();
      let headerImage = headerFile instanceof File && headerFile.size > 0
        ? { mimetype: headerFile.type, fileName: headerFile.name, base64: Buffer.from(await headerFile.arrayBuffer()).toString("base64") }
        : headerImageUrl
          ? { mimetype: String(form.get("headerImageType") ?? "image/jpeg"), fileName: "header", url: headerImageUrl }
          : undefined;
      if (!headerImage) {
        // Sem imagem informada: usa a imagem de exemplo que o modelo guarda na Meta.
        const template = (await listTemplates()).find((item) => item.name === templateName && item.language === templateLanguage);
        if (template?.headerFormat === "IMAGE") {
          if (!template.headerImageUrl) {
            return NextResponse.json({ error: "Este modelo exige uma imagem e a Meta não retornou a do modelo. Anexe uma imagem (JPG ou PNG)." }, { status: 400 });
          }
          const downloaded = await fetch(template.headerImageUrl);
          if (!downloaded.ok) {
            return NextResponse.json({ error: "Não foi possível carregar a imagem do modelo. Anexe uma imagem (JPG ou PNG)." }, { status: 400 });
          }
          const mimetype = downloaded.headers.get("content-type")?.split(";")[0] || "image/jpeg";
          headerImage = { mimetype, fileName: "header", base64: Buffer.from(await downloaded.arrayBuffer()).toString("base64") };
        }
      }
      const result = await sendTemplate(phone, templateName, templateLanguage, templateParams.map(String), headerImage);
      console.log("[whatsapp/send] modelo aceito pela Meta:", JSON.stringify(result));
      return NextResponse.json({ ok: true });
    }

    if (!text && files.length === 0 && mediaUrls.length === 0) {
      return NextResponse.json({ error: "Mensagem vazia." }, { status: 400 });
    }

    // Envio via URLs do MinIO (campanhas)
    if (mediaUrls.length > 0) {
      for (const [index, media] of mediaUrls.entries()) {
        await sendMedia(
          phone,
          { mimetype: media.mimetype, fileName: media.fileName, url: media.url },
          index === 0 ? text : undefined
        );
      }
      return NextResponse.json({ ok: true });
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

    if (files.length === 0) {
      const result = await sendText(phone, text);
      console.log("[whatsapp/send] texto aceito pela Meta:", JSON.stringify(result));
    } else {
      for (const [index, file] of files.entries()) {
        const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
        await sendMedia(phone, { mimetype: file.type, fileName: file.name, base64 }, index === 0 ? text : undefined);
      }
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[whatsapp/send] falha:", error);
    const message = error instanceof Error ? error.message : "Falha ao enviar.";
    const friendly = message.includes("#131058")
      ? "O modelo hello_world só pode ser enviado a partir dos números de teste públicos da Meta. Crie e aprove um modelo próprio para enviar deste número."
      : message;
    // 502 é substituído pela página de erro do Cloudflare; 422 preserva a mensagem para o usuário.
    return NextResponse.json({ error: friendly }, { status: 422 });
  }
}
