import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { invalidateCache } from "@/lib/cache";

const allowedResources = new Set(["segments", "campaigns", "pipeline", "pipeline-stages", "settings", "criteria", "nps"]);

const defaultValues: Record<string, Prisma.InputJsonValue> = {
  segments: [],
  campaigns: [],
  pipeline: [],
  "pipeline-stages": { stages: {} },
  criteria: [],
  settings: {
    storeName: "Óticas Brasil",
    contactEmail: "",
    timezone: "America/Sao_Paulo",
    language: "pt-BR",
    currency: "BRL",
    npsServiceDelay: "30",
    npsProductDelay: "30",
    inactiveCustomerDays: "180",
    defaultCampaignDuration: "7",
    defaultCampaignUnit: "dias",
    campaignDurationIndefinite: true,
    notifyNewContacts: true,
    notifyCampaigns: true,
    notifyLowNps: true,
      },
  nps: {
    messages: {
      atendimento: "Olá, {{nome}}! Como foi sua experiência com nosso atendimento? De 0 a 10, quanto você recomendaria nossa loja? Sua opinião nos ajuda a melhorar.",
      produto: "Olá, {{nome}}! Já faz 30 dias que está usando suas lentes. Como está sendo a adaptação? De 0 a 10, como avalia sua experiência?",
    },
  },
};

function isValidResourceValue(resource: string, value: unknown): value is Prisma.InputJsonValue {
  if (resource === "segments" || resource === "campaigns" || resource === "pipeline" || resource === "criteria") {
    return Array.isArray(value);
  }
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET(_request: Request, context: RouteContext<"/api/crm/[resource]">) {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });

  const { resource } = await context.params;
  if (!allowedResources.has(resource)) return Response.json({ error: "Recurso não encontrado." }, { status: 404 });

  const stored = await prisma.crmWorkspaceData.findUnique({ where: { key: resource }, select: { value: true, updatedAt: true } });
  return Response.json({
    data: stored?.value ?? defaultValues[resource],
    revision: stored?.updatedAt.toISOString() ?? null,
  });
}

export async function PUT(request: Request, context: RouteContext<"/api/crm/[resource]">) {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });

  const { resource } = await context.params;
  if (!allowedResources.has(resource)) return Response.json({ error: "Recurso não encontrado." }, { status: 404 });

  const rawBody = await request.text();
  const payloadSize = new TextEncoder().encode(rawBody).byteLength;
  const maxPayloadSize = resource === "pipeline" ? 20_000_000 : 2_000_000;
  if (payloadSize > maxPayloadSize) {
    return Response.json({ error: "Os dados excedem o tamanho permitido." }, { status: 413 });
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Formato JSON inválido." }, { status: 400 });
  }
  if (typeof parsedBody !== "object" || parsedBody === null || Array.isArray(parsedBody)) {
    return Response.json({ error: "Formato de dados inválido para este recurso." }, { status: 400 });
  }
  const body = parsedBody as { data?: unknown; revision?: unknown };
  if (!isValidResourceValue(resource, body.data) || !("revision" in body) || (body.revision !== null && typeof body.revision !== "string")) {
    return Response.json({ error: "Formato de dados inválido para este recurso." }, { status: 400 });
  }

  if (body.revision === null) {
    try {
      const saved = await prisma.crmWorkspaceData.create({
        data: { key: resource, value: body.data },
        select: { value: true, updatedAt: true },
      });
      await invalidateCache("dashboard");
      return Response.json({ data: saved.value, revision: saved.updatedAt.toISOString() });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return Response.json({ error: "Estes dados foram alterados em outra sessão. Recarregue antes de salvar novamente." }, { status: 409 });
      }
      throw error;
    }
  }

  const revision = new Date(body.revision);
  if (Number.isNaN(revision.getTime())) return Response.json({ error: "Versão dos dados inválida." }, { status: 400 });
  const updateResult = await prisma.crmWorkspaceData.updateMany({
    where: { key: resource, updatedAt: revision },
    data: { value: body.data },
  });
  if (updateResult.count === 0) {
    return Response.json({ error: "Estes dados foram alterados em outra sessão. Recarregue antes de salvar novamente." }, { status: 409 });
  }
  const saved = await prisma.crmWorkspaceData.findUniqueOrThrow({
    where: { key: resource },
    select: { value: true, updatedAt: true },
  });
  await invalidateCache("dashboard");
  return Response.json({ data: saved.value, revision: saved.updatedAt.toISOString() });
}
