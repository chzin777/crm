import { NextResponse } from "next/server";
import { requireModule } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { AiError } from "@/lib/ai/openai";
import { extractPdfText, indexKnowledgeDocument } from "@/lib/ai/studio-db";
import { readAiSettings } from "@/lib/ai/store";

const MAX_FILE = 10 * 1024 * 1024;
const MAX_TEXT = 400_000;
const select = { id: true, title: true, source: true, fileName: true, active: true, status: true, error: true, chunkCount: true, systemKey: true, createdAt: true, updatedAt: true } as const;

/** Base de conhecimento (RAG): lista de documentos com o status da indexação. */
export async function GET() {
  const guard = await requireModule("ia", "configuracoes");
  if (guard.response) return guard.response;
  // Garante os documentos das fontes automáticas (criados a partir dos antigos toggles da aba Geral).
  await readAiSettings();
  return NextResponse.json({ documents: await prisma.knowledgeDocument.findMany({ orderBy: [{ systemKey: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }], select }) });
}

/** Novo documento: JSON { title, content } ou multipart com "file" (.pdf, .txt, .md) e "title" opcional. */
export async function POST(request: Request) {
  const guard = await requireModule("ia", "configuracoes");
  if (guard.response) return guard.response;
  let title = "";
  let content = "";
  let source = "texto";
  let fileName: string | null = null;
  try {
    if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return NextResponse.json({ error: "Envie um arquivo." }, { status: 400 });
      if (file.size > MAX_FILE) return NextResponse.json({ error: "Arquivo acima de 10 MB." }, { status: 413 });
      const extension = file.name.toLowerCase().split(".").pop() ?? "";
      if (!["pdf", "txt", "md"].includes(extension)) return NextResponse.json({ error: "Formato aceito: .pdf, .txt ou .md." }, { status: 400 });
      fileName = file.name;
      source = extension;
      title = String(form.get("title") ?? "").trim() || file.name.replace(/\.[^.]+$/, "");
      const data = new Uint8Array(await file.arrayBuffer());
      content = extension === "pdf" ? await extractPdfText({ name: file.name, data }, guard.user.id) : new TextDecoder("utf-8").decode(data);
    } else {
      const body = (await request.json().catch(() => null)) as { title?: unknown; content?: unknown } | null;
      title = String(body?.title ?? "").trim();
      content = String(body?.content ?? "");
    }
  } catch (cause) {
    const message = cause instanceof AiError ? cause.message : "Não foi possível ler o arquivo.";
    return NextResponse.json({ error: message }, { status: cause instanceof AiError ? cause.status : 400 });
  }
  title = title.slice(0, 160);
  content = content.replace(/\r\n/g, "\n").trim().slice(0, MAX_TEXT);
  if (!title) return NextResponse.json({ error: "Informe o título." }, { status: 400 });
  if (!content) return NextResponse.json({ error: "O documento está sem texto." }, { status: 400 });
  const document = await prisma.knowledgeDocument.create({ data: { title, content, source, fileName } });
  await indexKnowledgeDocument(document.id, guard.user.id);
  return NextResponse.json({ document: await prisma.knowledgeDocument.findUnique({ where: { id: document.id }, select }) }, { status: 201 });
}
