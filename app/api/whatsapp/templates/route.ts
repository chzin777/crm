import { NextResponse } from "next/server";
import { requireApiSession, requireModule } from "@/lib/api-auth";
import { addAudit } from "@/lib/chat/conversation";
import { createTemplate, deleteTemplate, downloadTemplateImage, editTemplate, listTemplates, type TemplateButton, type TemplateContent } from "@/lib/meta-whatsapp";
import { prisma } from "@/lib/prisma";
import { templateEditUsage, templateEditWindowStart, templateNameAvailableAt, type ReservedTemplateName } from "@/lib/template-edit-limits";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const EDITABLE_STATUS = ["APPROVED", "REJECTED", "PAUSED"];

/** A Meta não informa quantas edições restam: a conta vem da auditoria, só das feitas com o modelo aprovado. */
async function approvedEditsByTemplate(ids: string[]) {
  const rows = await prisma.chatAudit.findMany({
    where: { action: "template.edit", targetId: { in: ids }, createdAt: { gte: templateEditWindowStart() } },
    select: { targetId: true, createdAt: true, before: true },
  });
  const edits = new Map<string, Date[]>();
  for (const row of rows) {
    if ((row.before as { status?: string } | null)?.status !== "APPROVED") continue;
    edits.set(row.targetId, [...(edits.get(row.targetId) ?? []), row.createdAt]);
  }
  return edits;
}

/** Só a exclusão feita pelo CRM fica registrada; a mais recente de cada nome define a liberação. */
async function reservedTemplateNames(): Promise<ReservedTemplateName[]> {
  const rows = await prisma.chatAudit.findMany({
    where: { action: "template.delete", createdAt: { gte: templateEditWindowStart() } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true, before: true },
  });
  const reserved = new Map<string, string>();
  for (const row of rows) {
    const before = row.before as { name?: string; status?: string } | null;
    if (before?.name && before.status === "APPROVED") reserved.set(before.name, templateNameAvailableAt(row.createdAt));
  }
  return [...reserved].map(([name, availableAt]) => ({ name, availableAt }));
}

/** Validação comum a criar e editar: o conteúdo segue as mesmas regras nos dois casos. */
async function readTemplateContent(form: FormData): Promise<{ error: string; content?: undefined } | { content: TemplateContent; error?: undefined }> {
  const body = String(form.get("body") ?? "").trim();
  const footer = String(form.get("footer") ?? "").trim();
  const image = form.get("headerImage");

  if (!body || body.length > 1024) return { error: "O texto do modelo é obrigatório e deve ter até 1024 caracteres." };
  if (footer.length > 60) return { error: "O rodapé deve ter até 60 caracteres." };

  let examples: string[] = [];
  try {
    examples = (JSON.parse(String(form.get("examples") ?? "[]")) as unknown[]).map((item) => String(item).trim());
  } catch {
    return { error: "Exemplos inválidos." };
  }
  const variables = new Set(body.match(/\{\{\d+\}\}/g) ?? []);
  if (variables.size > 0 && (examples.length < variables.size || examples.slice(0, variables.size).some((item) => !item))) {
    return { error: "Informe um exemplo para cada variável do texto." };
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
    return { error: error instanceof Error ? error.message : "Botões inválidos." };
  }
  if (buttons.length > 10 || buttons.filter((b) => b.type === "URL").length > 2 || buttons.filter((b) => b.type === "PHONE_NUMBER").length > 1) {
    return { error: "Limite: 10 botões no total, até 2 de link e 1 de ligação." };
  }

  let headerImage: TemplateContent["headerImage"];
  if (image instanceof File && image.size > 0) {
    if (!["image/jpeg", "image/png"].includes(image.type)) return { error: "A imagem do cabeçalho deve ser JPG ou PNG." };
    if (image.size > MAX_IMAGE_SIZE) return { error: "A imagem do cabeçalho deve ter até 5 MB." };
    headerImage = { mimetype: image.type, fileName: image.name, buffer: Buffer.from(await image.arrayBuffer()) };
  }

  return { content: { body, footer: footer || undefined, buttons, examples: examples.slice(0, variables.size), headerImage } };
}

export async function GET() {
  if (!(await requireApiSession())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const templates = await listTemplates();
    const [edits, reservedNames] = await Promise.all([approvedEditsByTemplate(templates.map((template) => template.id)), reservedTemplateNames()]);
    return NextResponse.json({ data: templates.map((template) => ({ ...template, editUsage: templateEditUsage(template.status, edits.get(template.id) ?? []) })), reservedNames });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao listar modelos." }, { status: 422 });
  }
}

export async function DELETE(request: Request) {
  const guard = await requireModule("modelos");
  if (guard.response) return guard.response;
  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  const name = url.searchParams.get("name") ?? "";
  if (!/^\d+$/.test(id) || !/^[a-z0-9_]{1,512}$/.test(name)) {
    return NextResponse.json({ error: "Modelo inválido." }, { status: 400 });
  }
  try {
    const status = (await listTemplates()).find((template) => template.id === id)?.status;
    await deleteTemplate(id, name);
    await addAudit({ userId: guard.user.id, action: "template.delete", targetId: id, before: { name, status } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[whatsapp/templates] falha ao excluir:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao excluir modelo." }, { status: 422 });
  }
}

export async function POST(request: Request) {
  if (!(await requireApiSession())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const form = await request.formData();
    const name = String(form.get("name") ?? "").trim();
    const language = String(form.get("language") ?? "pt_BR");
    const category = form.get("category") === "MARKETING" ? "MARKETING" : "UTILITY";

    if (!/^[a-z0-9_]{1,512}$/.test(name)) {
      return NextResponse.json({ error: "Nome inválido: use apenas letras minúsculas, números e underscore." }, { status: 400 });
    }
    const reserved = (await reservedTemplateNames()).find((item) => item.name === name);
    if (reserved) {
      return NextResponse.json({ error: "Este nome é de um modelo aprovado excluído nos últimos 30 dias.", availableAt: reserved.availableAt }, { status: 409 });
    }
    const { content, error } = await readTemplateContent(form);
    if (!content) return NextResponse.json({ error }, { status: 400 });

    const created = await createTemplate({ ...content, name, language, category });
    return NextResponse.json({ ok: true, id: created.id, status: created.status });
  } catch (error) {
    console.error("[whatsapp/templates] falha ao criar:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao criar modelo." }, { status: 422 });
  }
}

export async function PUT(request: Request) {
  const guard = await requireModule("modelos");
  if (guard.response) return guard.response;
  try {
    const form = await request.formData();
    const id = String(form.get("id") ?? "");
    const current = (await listTemplates()).find((template) => template.id === id);
    if (!current) return NextResponse.json({ error: "Modelo não encontrado." }, { status: 404 });
    if (!EDITABLE_STATUS.includes(current.status)) {
      return NextResponse.json({ error: "A Meta só permite editar modelos aprovados, rejeitados ou pausados." }, { status: 409 });
    }
    if (current.headerFormat && !["IMAGE", "TEXT"].includes(current.headerFormat)) {
      return NextResponse.json({ error: "Este modelo tem cabeçalho de vídeo ou documento. Edite no WhatsApp Manager." }, { status: 409 });
    }
    const usage = templateEditUsage(current.status, (await approvedEditsByTemplate([id])).get(id) ?? []);
    if (usage.availableAt) {
      return NextResponse.json({ error: "Limite de edições da Meta atingido para este modelo.", availableAt: usage.availableAt }, { status: 429 });
    }

    const { content, error } = await readTemplateContent(form);
    if (!content) return NextResponse.json({ error }, { status: 400 });

    const keepImage = form.get("keepHeaderImage") === "1" && current.headerFormat === "IMAGE" && current.headerImageUrl;
    await editTemplate(id, {
      ...content,
      headerImage: content.headerImage ?? (keepImage ? await downloadTemplateImage(current.headerImageUrl as string) : undefined),
      headerText: current.headerFormat === "TEXT" ? current.headerText : undefined,
    });
    await addAudit({ userId: guard.user.id, action: "template.edit", targetId: id, before: { name: current.name, status: current.status, body: current.body, footer: current.footer, buttons: current.buttons }, after: { body: content.body, footer: content.footer, buttons: content.buttons } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[whatsapp/templates] falha ao editar:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao editar modelo." }, { status: 422 });
  }
}
