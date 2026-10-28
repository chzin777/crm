import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { createTemplate, listTemplates, type TemplateButton } from "@/lib/meta-whatsapp";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

export async function GET() {
  if (!(await requireApiSession())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    return NextResponse.json({ data: await listTemplates() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao listar modelos." }, { status: 422 });
  }
}

export async function POST(request: Request) {
  if (!(await requireApiSession())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const form = await request.formData();
    const name = String(form.get("name") ?? "").trim();
    const body = String(form.get("body") ?? "").trim();
    const footer = String(form.get("footer") ?? "").trim();
    const language = String(form.get("language") ?? "pt_BR");
    const category = form.get("category") === "MARKETING" ? "MARKETING" : "UTILITY";
    const image = form.get("headerImage");

    if (!/^[a-z0-9_]{1,512}$/.test(name)) {
      return NextResponse.json({ error: "Nome inválido: use apenas letras minúsculas, números e underscore." }, { status: 400 });
    }
    if (!body || body.length > 1024) {
      return NextResponse.json({ error: "O texto do modelo é obrigatório e deve ter até 1024 caracteres." }, { status: 400 });
    }
    if (footer.length > 60) {
      return NextResponse.json({ error: "O rodapé deve ter até 60 caracteres." }, { status: 400 });
    }

    let examples: string[] = [];
    try {
      examples = (JSON.parse(String(form.get("examples") ?? "[]")) as unknown[]).map((item) => String(item).trim());
    } catch {
      return NextResponse.json({ error: "Exemplos inválidos." }, { status: 400 });
    }
    const variables = new Set(body.match(/\{\{\d+\}\}/g) ?? []);
    if (variables.size > 0 && (examples.length < variables.size || examples.slice(0, variables.size).some((item) => !item))) {
      return NextResponse.json({ error: "Informe um exemplo para cada variável do texto." }, { status: 400 });
    }

    let buttons: TemplateButton[] = [];
    try {
      const raw = JSON.parse(String(form.get("buttons") ?? "[]")) as { type?: string; text?: string; url?: string; phone?: string }[];
      buttons = raw.map((item) => {
        const text = String(item.text ?? "").trim();
        if (!text || text.length > 25) throw new Error("O texto de cada botão é obrigatório e deve ter até 25 caracteres.");
        if (item.type === "URL") {
          const url = String(item.url ?? "").trim();
          if (!/^https?:\/\/\S+$/i.test(url) || url.includes("{{")) throw new Error(`Link inválido no botão "${text}". Use uma URL completa começando com http:// ou https://.`);
          return { type: "URL" as const, text, url };
        }
        if (item.type === "PHONE_NUMBER") {
          const phone = String(item.phone ?? "").replace(/[^\d+]/g, "");
          if (phone.replace(/\D/g, "").length < 10) throw new Error(`Telefone inválido no botão "${text}". Inclua DDI e DDD.`);
          return { type: "PHONE_NUMBER" as const, text, phone_number: phone.startsWith("+") ? phone : `+${phone}` };
        }
        return { type: "QUICK_REPLY" as const, text };
      });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Botões inválidos." }, { status: 400 });
    }
    if (buttons.length > 10 || buttons.filter((b) => b.type === "URL").length > 2 || buttons.filter((b) => b.type === "PHONE_NUMBER").length > 1) {
      return NextResponse.json({ error: "Limite: 10 botões no total, até 2 de link e 1 de ligação." }, { status: 400 });
    }

    let headerImage: { mimetype: string; fileName: string; buffer: Buffer } | undefined;
    if (image instanceof File && image.size > 0) {
      if (!["image/jpeg", "image/png"].includes(image.type)) {
        return NextResponse.json({ error: "A imagem do cabeçalho deve ser JPG ou PNG." }, { status: 400 });
      }
      if (image.size > MAX_IMAGE_SIZE) {
        return NextResponse.json({ error: "A imagem do cabeçalho deve ter até 5 MB." }, { status: 400 });
      }
      headerImage = { mimetype: image.type, fileName: image.name, buffer: Buffer.from(await image.arrayBuffer()) };
    }

    const created = await createTemplate({ name, language, category, body, footer: footer || undefined, buttons, examples: examples.slice(0, variables.size), headerImage });
    return NextResponse.json({ ok: true, id: created.id, status: created.status });
  } catch (error) {
    console.error("[whatsapp/templates] falha ao criar:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao criar modelo." }, { status: 422 });
  }
}
