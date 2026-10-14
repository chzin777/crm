import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { sendMedia, sendText } from "@/lib/evolution";

const MAX_FILES = 5;
const MAX_FILE_SIZE = 16 * 1024 * 1024;
const ALLOWED = (type: string) => type.startsWith("image/") || type.startsWith("video/") || type === "application/pdf";

export async function POST(request: Request) {
  if (!(await requireApiSession())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  try {
    const form = await request.formData();
    const phone = String(form.get("phone") ?? "");
    const text = String(form.get("text") ?? "").trim();
    const files = form.getAll("files").filter((item): item is File => item instanceof File);

    if (!text && files.length === 0) return NextResponse.json({ error: "Mensagem vazia." }, { status: 400 });
    if (files.length > MAX_FILES) return NextResponse.json({ error: `Máximo de ${MAX_FILES} arquivos.` }, { status: 400 });
    for (const file of files) {
      if (!ALLOWED(file.type) || file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: `Arquivo não permitido: ${file.name}` }, { status: 400 });
      }
    }

    if (files.length === 0) {
      await sendText(phone, text);
    } else {
      for (const [index, file] of files.entries()) {
        const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
        await sendMedia(phone, { mimetype: file.type, fileName: file.name, base64 }, index === 0 ? text : undefined);
      }
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao enviar." }, { status: 502 });
  }
}
