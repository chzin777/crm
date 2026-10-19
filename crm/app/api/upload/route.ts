import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { uploadFile, ensureBucket } from "@/lib/minio";

const MAX_FILES = 5;
const MAX_FILE_SIZE = 16 * 1024 * 1024;
const ALLOWED = (type: string) =>
  type.startsWith("image/") ||
  type.startsWith("video/") ||
  type === "application/pdf";

let bucketReady = false;

export async function POST(request: Request) {
  if (!(await requireApiSession())) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    if (!bucketReady) {
      await ensureBucket();
      bucketReady = true;
    }

    const form = await request.formData();
    const files = form
      .getAll("files")
      .filter((item): item is File => item instanceof File);

    if (files.length === 0) {
      return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { error: `Máximo de ${MAX_FILES} arquivos.` },
        { status: 400 }
      );
    }

    for (const file of files) {
      if (!ALLOWED(file.type) || file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `Arquivo não permitido: ${file.name}` },
          { status: 400 }
        );
      }
    }

    const results = [];
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const { key, url } = await uploadFile(buffer, file.name, file.type);
      results.push({
        key,
        url,
        name: file.name,
        size: file.size,
        type: file.type,
      });
    }

    return NextResponse.json({ ok: true, files: results });
  } catch (error) {
    console.error("[upload]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha no upload." },
      { status: 500 }
    );
  }
}
