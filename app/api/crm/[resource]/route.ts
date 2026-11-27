import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserAccess, requireApiSession } from "@/lib/api-auth";
import { allowsAny, CRM_RESOURCE_WRITE } from "@/lib/api-policy";
import { invalidateCache } from "@/lib/cache";
import { emitStageChanges } from "@/lib/automations/engine-db";
import { mergeOwnCards, ownCards, ownContactIds } from "@/lib/own-clients";

const allowedResources = new Set(["segments", "campaigns", "pipeline", "pipeline-stages", "pipeline-dismissed", "settings", "criteria", "nps"]);

const defaultValues: Record<string, Prisma.InputJsonValue> = {
  segments: [],
  campaigns: [],
  pipeline: [],
  "pipeline-dismissed": { novos: [], relacionamento: [] },
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
  // Vendedor com "Só os próprios clientes": o funil chega só com os cards dos clientes dele.
  const own = resource === "pipeline" ? await ownContactIds(user.id) : null;
  return Response.json({
    data: own && Array.isArray(stored?.value) ? ownCards(stored.value, own) : stored?.value ?? defaultValues[resource],
    revision: stored?.updatedAt.toISOString() ?? null,
  });
}

export async function PUT(request: Request, context: RouteContext<"/api/crm/[resource]">) {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });

  const { resource } = await context.params;
  if (!allowedResources.has(resource)) return Response.json({ error: "Recurso não encontrado." }, { status: 404 });
  // Gravar campanhas, configurações, pipeline etc. exige o módulo da lista (ler segue liberado às telas que usam).
  const access = await getUserAccess(user.id);
  if (!access || !allowsAny(access.modules, CRM_RESOURCE_WRITE[resource] ?? [])) {
    return Response.json({ error: "Sem permissão para alterar estes dados." }, { status: 403 });
  }

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

  // Quem vê só os próprios clientes salva só os cards deles; os dos outros ficam como estão.
  const own = resource === "pipeline" ? await ownContactIds(user.id) : null;
  if (own) {
    const current = await prisma.crmWorkspaceData.findUnique({ where: { key: resource }, select: { value: true } });
    body.data = mergeOwnCards(Array.isArray(current?.value) ? current.value : [], body.data as unknown[], own) as Prisma.InputJsonValue[];
  }

  if (body.revision === null) {
    try {
      const saved = await prisma.crmWorkspaceData.create({
        data: { key: resource, value: body.data as Prisma.InputJsonValue },
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
  // Kanban: cards antes do salvamento, para disparar as automações "Lead entrou na etapa" dos que mudaram de coluna.
  const previousPipeline = resource === "pipeline" ? await prisma.crmWorkspaceData.findUnique({ where: { key: "pipeline" }, select: { value: true } }) : null;
  const updateResult = await prisma.crmWorkspaceData.updateMany({
    where: { key: resource, updatedAt: revision },
    data: { value: body.data as Prisma.InputJsonValue },
  });
  if (updateResult.count === 0) {
    return Response.json({ error: "Estes dados foram alterados em outra sessão. Recarregue antes de salvar novamente." }, { status: 409 });
  }
  const saved = await prisma.crmWorkspaceData.findUniqueOrThrow({
    where: { key: resource },
    select: { value: true, updatedAt: true },
  });
  await invalidateCache("dashboard");
  if (previousPipeline && Array.isArray(previousPipeline.value) && Array.isArray(saved.value)) {
    emitStageChanges(previousPipeline.value as unknown as StageCard[], saved.value as unknown as StageCard[]);
  }
  return Response.json({ data: own && Array.isArray(saved.value) ? ownCards(saved.value, own) : saved.value, revision: saved.updatedAt.toISOString() });
}

type StageCard = { id: string; contactId?: string; coluna: string };
