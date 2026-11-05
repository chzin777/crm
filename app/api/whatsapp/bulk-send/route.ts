import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";

export async function POST(request: Request) {
 const user = await requireApiSession();
 if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });

 const formData = await request.formData();
 const contactIdsRaw = formData.get("contactIds");
 const stageName = formData.get("stageName") ?? "Pipeline";
 const text = formData.get("text") ?? "";
 const templateName = formData.get("templateName");
 const templateLanguage = formData.get("templateLanguage");
 const templateParamsRaw = formData.get("templateParams");
 const files = formData.getAll("files").filter((f): f is File => f instanceof File);

 let contactIds: string[];
 try {
 contactIds = JSON.parse(contactIdsRaw as string);
 } catch {
 return Response.json({ error: "Lista de contatos inválida." }, { status: 400 });
 }

 if (!Array.isArray(contactIds) || contactIds.length === 0) {
 return Response.json({ error: "Nenhum contato selecionado." }, { status: 400 });
 }

 const contacts = await prisma.contact.findMany({
 where: { id: { in: contactIds } },
 select: { id: true, phone: true, name: true },
 });

 const results: { contactId: string; status: "sent" | "failed"; error?: string }[] = [];

 for (const contact of contacts) {
 if (!contact.phone || contact.phone.replace(/\D/g, "").length < 10) {
 results.push({ contactId: contact.id, status: "failed", error: "Telefone inválido" });
 continue;
 }

 try {
 const body = new FormData();
 body.set("phone", contact.phone);
 if (templateName) {
 body.set("templateName", templateName as string);
 if (templateLanguage) body.set("templateLanguage", templateLanguage as string);
 if (templateParamsRaw) body.set("templateParams", templateParamsRaw as string);
 } else {
 // Substitui variáveis no texto livre
 const personalizedText = (text as string)
 .replace(/\{\{nome\}\}/gi, contact.name)
 .replace(/\{\{etapa\}\}/gi, stageName as string)
 .replace(/\{\{telefone\}\}/gi, contact.phone);
 body.set("text", personalizedText);
 files.forEach((f) => body.append("files", f));
 }

 const origin = new URL(request.url).origin;
 const sendResponse = await fetch(`${origin}/api/whatsapp/send`, {
 method: "POST",
 body,
 headers: { cookie: request.headers.get("cookie") ?? "" },
 });

 if (!sendResponse.ok) {
 const errData = await sendResponse.json().catch(() => ({}));
 results.push({ contactId: contact.id, status: "failed", error: errData?.error ?? "Falha no envio" });
 } else {
 results.push({ contactId: contact.id, status: "sent" });
 }
 } catch (err) {
 results.push({ contactId: contact.id, status: "failed", error: err instanceof Error ? err.message : "Erro desconhecido" });
 }
 }

 return Response.json({ data: results });
}