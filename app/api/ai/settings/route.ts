import { NextResponse } from "next/server";
import { requireModule } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { readAiSettings, saveAiSettings } from "@/lib/ai/store";
import { aiConfigured } from "@/lib/ai/openai";
import { imageSearchStatus } from "@/lib/ai/product-image-db";
import { IMAGE_PROVIDER_LABELS } from "@/lib/ai/product-image";

/** Parâmetros da IA (página /ia): o que responde, onde atende, quando transfere e custos. */
export async function GET() {
  const guard = await requireModule("ia", "configuracoes");
  if (guard.response) return guard.response;
  const [settings, queues] = await Promise.all([
    readAiSettings(),
    prisma.chatQueue.findMany({ where: { archivedAt: null }, orderBy: [{ order: "asc" }, { name: "asc" }], select: { id: true, name: true, description: true } }),
  ]);
  const imageSearch = imageSearchStatus();
  return NextResponse.json({ settings, queues, configured: aiConfigured(), imageSearch: IMAGE_PROVIDER_LABELS[imageSearch.provider], imageSearchFree: imageSearch.provider === "free" });
}

export async function PUT(request: Request) {
  const guard = await requireModule("ia", "configuracoes");
  if (guard.response) return guard.response;
  const body = (await request.json().catch(() => null)) as { settings?: unknown } | null;
  if (!body?.settings) return NextResponse.json({ error: "Envie as configurações da IA." }, { status: 400 });
  const settings = await saveAiSettings(body.settings);
  return NextResponse.json({ settings });
}
