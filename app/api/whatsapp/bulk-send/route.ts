import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { ensureInstance, listTemplates, MetaApiError, sendMedia, sendTemplate, sendText, uploadMedia } from "@/lib/meta-whatsapp";

const MAX_FILES = 5;
const MAX_FILE_SIZE = 16 * 1024 * 1024;
const ALLOWED = (type: string) => type.startsWith("image/") || type.startsWith("video/") || type === "application/pdf";
// Pausa entre contatos para não estourar o limite de envio da Meta.
const SEND_DELAY_MS = 300;

type ParamSource = "primeiro_nome" | "nome" | "telefone" | "manual";
type TemplateParam = { source: ParamSource; value: string };

function parseTemplateParams(raw: FormDataEntryValue | null): TemplateParam[] | null {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return null;
    // Aceita também o formato antigo (lista de textos fixos).
    return parsed.map((item) => typeof item === "string"
      ? { source: "manual" as const, value: item }
      : { source: (item?.source ?? "manual") as ParamSource, value: String(item?.value ?? "") });
  } catch {
    return null;
  }
}

function resolveParam(param: TemplateParam, contact: { name: string; phone: string }) {
  if (param.source === "primeiro_nome") return contact.name.trim().split(/\s+/)[0] || "-";
  if (param.source === "nome") return contact.name.trim() || "-";
  if (param.source === "telefone") return contact.phone;
  return param.value.trim() || "-";
}

/** Traduz o erro da Meta (ou de rede) num motivo claro para a lista de falhas. */
function friendlyError(error: unknown) {
  if (error instanceof MetaApiError) {
    const code = error.code;
    if (code === 190) return "Token da Meta inválido ou expirado.";
    if (code === 131026 || code === 131030 || (code === 100 && /phone|recipient/i.test(error.message))) return "Telefone inválido ou sem WhatsApp.";
    if (code === 132000 || code === 132001 || code === 132005 || code === 132007 || code === 132012) return `Modelo incompatível: ${error.message.replace(/^Meta WhatsApp API: /, "")}`;
    if (code === 131047) return "Fora da janela de 24h: use um modelo aprovado.";
    if (code === 131056 || code === 130429 || code === 80007) return "Limite de envios da Meta atingido. Tente novamente em alguns minutos.";
    if (code === 131058) return "O modelo hello_world só funciona com números de teste da Meta.";
    return error.message.replace(/^Meta WhatsApp API: /, "");
  }
  return error instanceof Error ? error.message : "Erro desconhecido";
}

async function resolveTemplateHeader(templateName: string, templateLanguage: string) {
  const template = (await listTemplates()).find((item) => item.name === templateName && item.language === templateLanguage);
  if (template?.headerFormat !== "IMAGE") return undefined;
  if (!template.headerImageUrl) throw new Error("Este modelo exige uma imagem e a Meta não retornou a do modelo.");
  const downloaded = await fetch(template.headerImageUrl);
  if (!downloaded.ok) throw new Error("Não foi possível carregar a imagem do modelo.");
  const mimetype = downloaded.headers.get("content-type")?.split(";")[0] || "image/jpeg";
  const base64 = Buffer.from(await downloaded.arrayBuffer()).toString("base64");
  // Sobe a imagem uma vez e reaproveita o id em todos os envios do lote.
  const mediaId = await uploadMedia({ mimetype, fileName: "header", base64 });
  return { mimetype, fileName: "header", mediaId };
}

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

  // Prepara uma vez o que é igual para todos: imagem do modelo (enviada à Meta) e anexos lidos.
  let header: Awaited<ReturnType<typeof resolveTemplateHeader>>;
  let uploadedFiles: { mimetype: string; fileName: string; base64: string }[] = [];
  try {
    await ensureInstance();
    if (templateName) {
      header = await resolveTemplateHeader(templateName, templateLanguage);
    } else {
      uploadedFiles = await Promise.all(files.map(async (file) => ({
        mimetype: file.type,
        fileName: file.name,
        base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
      })));
    }
  } catch (error) {
    console.error("[whatsapp/bulk-send] falha ao preparar o envio:", error);
    return Response.json({ error: friendlyError(error) }, { status: 422 });
  }

  const results: { contactId: string; status: "sent" | "failed"; error?: string }[] = [];

  for (const [index, contact] of contacts.entries()) {
    const phone = contact.phone ?? "";
    if (phone.replace(/\D/g, "").length < 10) {
      results.push({ contactId: contact.id, status: "failed", error: "Telefone inválido" });
      continue;
    }
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, SEND_DELAY_MS));

    try {
      if (templateName) {
        const params = templateParams.map((param) => resolveParam(param, { name: contact.name, phone }));
        await sendTemplate(phone, templateName, templateLanguage, params, header);
      } else {
        // Substitui variáveis no texto livre
        const personalizedText = text
          .replace(/\{\{nome\}\}/gi, contact.name)
          .replace(/\{\{etapa\}\}/gi, stageName)
          .replace(/\{\{telefone\}\}/gi, phone)
          .trim();
        if (uploadedFiles.length === 0) {
          await sendText(phone, personalizedText);
        } else {
          for (const [fileIndex, file] of uploadedFiles.entries()) {
            await sendMedia(phone, file, fileIndex === 0 && personalizedText ? personalizedText : undefined);
          }
        }
      }
      results.push({ contactId: contact.id, status: "sent" });
    } catch (error) {
      console.error(`[whatsapp/bulk-send] falha para ${contact.id} (${phone}):`, error instanceof MetaApiError ? JSON.stringify(error.details) : error);
      results.push({ contactId: contact.id, status: "failed", error: friendlyError(error) });
    }
  }

  return Response.json({ data: results });
}
