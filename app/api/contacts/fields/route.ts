import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/api-auth";
import { fieldKey, isFieldType, MAX_FIELDS } from "@/lib/contact-fields";
import { listFieldDefinitions } from "@/lib/contact-fields-db";

/** Definições dos campos personalizados do contato. */
export async function GET() {
  const guard = await requireModule("contatos", "chat", "automacoes", "pontuacao");
  if (guard.response) return guard.response;
  return Response.json({ definitions: await listFieldDefinitions() });
}

/** Novo campo: rótulo, tipo e (seleção) opções; a chave sai do rótulo se não vier. */
export async function POST(request: Request) {
  const guard = await requireModule("contatos");
  if (guard.response) return guard.response;
  const body = (await request.json().catch(() => null)) as { label?: unknown; key?: unknown; type?: unknown; options?: unknown } | null;
  const label = String(body?.label ?? "").trim().slice(0, 80);
  const key = fieldKey(String(body?.key ?? "") || label);
  const type = isFieldType(body?.type) ? body.type : "text";
  const options = Array.isArray(body?.options) ? [...new Set(body.options.map((item) => String(item).trim().slice(0, 80)).filter(Boolean))].slice(0, 50) : [];
  if (!label || !key) return Response.json({ error: "Informe o nome do campo." }, { status: 400 });
  if (type === "select" && options.length < 2) return Response.json({ error: "Campo de seleção precisa de ao menos 2 opções." }, { status: 400 });
  if ((await prisma.contactFieldDef.count()) >= MAX_FIELDS) return Response.json({ error: `Limite de ${MAX_FIELDS} campos.` }, { status: 400 });
  if (await prisma.contactFieldDef.findUnique({ where: { key } })) return Response.json({ error: `Já existe um campo com a chave ${key}.` }, { status: 409 });
  const order = (await prisma.contactFieldDef.aggregate({ _max: { order: true } }))._max.order ?? 0;
  const created = await prisma.contactFieldDef.create({ data: { key, label, type, options, order: order + 1 } });
  return Response.json({ definition: created }, { status: 201 });
}
