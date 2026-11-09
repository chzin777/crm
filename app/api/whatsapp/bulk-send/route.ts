import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { ensureInstance } from "@/lib/meta-whatsapp";
import { ensureBucket, uploadFile } from "@/lib/minio";
import { friendlyError, listBulkJobs, startBulkJob, toView, type BulkAttachment, type BulkParamSource, type BulkTemplateParam } from "@/lib/bulk-dispatch";

const MAX_FILES = 5;
const MAX_FILE_SIZE = 16 * 1024 * 1024;
const ALLOWED = (type: string) => type.startsWith("image/") || type.startsWith("video/") || type === "application/pdf";
const SOURCES: BulkParamSource[] = ["primeiro_nome", "nome", "telefone", "manual"];

function parseTemplateParams(raw: FormDataEntryValue | null): BulkTemplateParam[] | null {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return null;
    // Aceita também o formato antigo (lista de textos fixos).
    return parsed.map((item) => typeof item === "string"
      ? { source: "manual" as const, value: item }
      : { source: SOURCES.includes(item?.source) ? item.source : "manual", value: String(item?.value ?? "") });
  } catch {
    return null;
  }
}

/** Lotes do usuário logado, para o indicador global de progresso. */
export async function GET() {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const jobs = await listBulkJobs(user.id);
  return Response.json({ data: jobs.map(toView) });
}

/** Cria o lote e responde na hora; os envios seguem em fila no servidor. */
export async function POST(request: Request) {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });

  const formData = await request.formData();
  const contactIdsRaw = formData.get("contactIds");
  const stageName = String(formData.get("stageName") ?? "Pipeline");
  const text = String(formData.get("text") ?? "");
  const templateName = String(formData.get("templateName") ?? "").trim();
  const templateLanguage = String(formData.get("templateLanguage") ?? "pt_BR");
  const templateParams = parseTemplateParams(formData.get("templateParams"));
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);

  let contactIds: string[];
  try {
    contactIds = JSON.parse(contactIdsRaw as string);
  } catch {
    return Response.json({ error: "Lista de contatos inválida." }, { status: 400 });
  }

  if (!Array.isArray(contactIds) || contactIds.length === 0) {
    return Response.json({ error: "Nenhum contato selecionado." }, { status: 400 });
  }
  if (!templateParams) return Response.json({ error: "Variáveis do modelo inválidas." }, { status: 400 });
  if (!templateName && !text.trim() && files.length === 0) return Response.json({ error: "Mensagem vazia." }, { status: 400 });
  if (files.length > MAX_FILES) return Response.json({ error: `Máximo de ${MAX_FILES} arquivos.` }, { status: 400 });
  const invalidFile = files.find((file) => !ALLOWED(file.type) || file.size > MAX_FILE_SIZE);
  if (invalidFile) return Response.json({ error: `Arquivo não permitido: ${invalidFile.name}` }, { status: 400 });

  const contacts = await prisma.contact.findMany({
    where: { id: { in: contactIds } },
    select: { id: true, phone: true, name: true },
  });
  if (contacts.length === 0) return Response.json({ error: "Nenhum contato encontrado." }, { status: 400 });

  try {
    await ensureInstance();
    // Anexos ficam no armazenamento para o envio continuar mesmo se o servidor reiniciar.
    let attachments: BulkAttachment[] = [];
    if (!templateName && files.length > 0) {
      await ensureBucket();
      attachments = await Promise.all(files.map(async (file) => {
        const { key } = await uploadFile(Buffer.from(await file.arrayBuffer()), file.name, file.type, "bulk");
        return { key, fileName: file.name, mimetype: file.type };
      }));
    }
    const job = await startBulkJob({
      userId: user.id,
      stageName,
      contacts,
      text,
      template: templateName ? { name: templateName, language: templateLanguage, params: templateParams } : null,
      attachments,
    });
    return Response.json({ data: toView(job) }, { status: 202 });
  } catch (error) {
    console.error("[whatsapp/bulk-send] falha ao criar o lote:", error);
    return Response.json({ error: friendlyError(error) }, { status: 422 });
  }
}
