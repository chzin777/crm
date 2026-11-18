import { NextResponse } from "next/server";
import { z } from "zod";
import { requireModule } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { AiError, aiJson } from "@/lib/ai/openai";
import { RFVP_SEGMENTS } from "@/lib/rfvp";
import { resolveStageConfigs, STAGE_DEFINITIONS } from "@/lib/pipeline-stages";
import { ruleSchema, splitRuleList, validateRule } from "@/lib/segment-rules";
import { listTemplates } from "@/lib/meta-whatsapp";

const strictObject = (properties: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});

const tiers = ["DIAMANTE", "OURO", "PRATA", "BRONZE"] as const;
const filterFields = ["tier", "rfvpSegment", "tag", "pipelineStage", "lastPurchase"] as const;
const campaignFilterSchema = z.object({
  id: z.string().max(200),
  nome: z.string().max(300),
  tipo: z.enum(["geral", "loja"]),
  regras: z.array(ruleSchema).max(10).optional(),
  combinar: z.enum(["all", "any"]).optional(),
});
const quickReplySchema = strictObject({
  type: { type: "string", enum: ["QUICK_REPLY"] },
  text: { type: "string" },
});
const campaignSchema = strictObject({
  name: { type: "string" },
  objective: { type: "string" },
  category: { type: "string", enum: ["MARKETING", "UTILITY"] },
  segmentIds: { type: "array", items: { type: "string" } },
  audienceDescription: { type: "string" },
  audienceRules: {
    type: "array",
    items: strictObject({
      campo: { type: "string", enum: filterFields },
      operador: { type: "string", enum: ["eq", "in", "older_days"] },
      valor: { type: "string" },
      valor2: { type: "string" },
    }),
  },
  body: { type: "string" },
  params: { type: "array", items: { type: "string", enum: ["nome", "email", "telefone", "segmento", "data_nascimento"] } },
  headerFormat: { type: "string", enum: ["NONE", "TEXT"] },
  headerText: { type: "string" },
  footer: { type: "string" },
  examples: { type: "array", items: { type: "string" } },
  buttons: { type: "array", items: quickReplySchema },
});

const templateSchema = strictObject({
  category: { type: "string", enum: ["MARKETING", "UTILITY"] },
  headerFormat: { type: "string", enum: ["NONE", "TEXT"] },
  headerText: { type: "string" },
  body: { type: "string" },
  footer: { type: "string" },
  params: { type: "array", items: { type: "string", enum: ["nome", "email", "telefone", "segmento", "data_nascimento"] } },
  examples: { type: "array", items: { type: "string" } },
  buttons: { type: "array", items: quickReplySchema },
});

type AudienceSegment = { id: string; nome: string; modoPublico?: string; criterios?: string[] };
type GeneratedRule = { campo: string; operador: string; valor: string; valor2: string };
type CampaignDraft = {
  name: string;
  objective: string;
  category: "MARKETING" | "UTILITY";
  segmentIds: string[];
  audienceDescription: string;
  audienceRules: GeneratedRule[];
  body: string;
  params: string[];
  headerFormat: "NONE" | "TEXT";
  headerText: string;
  footer: string;
  examples: string[];
  buttons: { type: "QUICK_REPLY"; text: string }[];
};
type GeneratedTemplate = {
  category: "MARKETING" | "UTILITY";
  headerFormat: "NONE" | "TEXT";
  headerText: string;
  body: string;
  footer: string;
  params: string[];
  examples: string[];
  buttons: { type: "QUICK_REPLY"; text: string }[];
};

function readArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null) : [];
}

function makeAudienceFilters(rules: GeneratedRule[], tags: string[]) {
  const allowedTiers = new Set<string>(tiers);
  const allowedRfvp = new Set(RFVP_SEGMENTS.map((segment) => segment.key));
  const allowedTags = new Set(tags.map((tag) => tag.toLocaleLowerCase("pt-BR")));
  const allowedStages = new Set<string>(STAGE_DEFINITIONS.map((stage) => stage.id));
  const parsedRules = rules.map((rule) => {
    if (!filterFields.includes(rule.campo as typeof filterFields[number])) throw new Error("A IA sugeriu um campo de público não suportado.");
    if (rule.campo === "lastPurchase" && rule.operador !== "older_days") throw new Error("A IA sugeriu uma condição de compra inválida.");
    if (rule.campo !== "lastPurchase" && !["eq", "in"].includes(rule.operador)) throw new Error("A IA sugeriu um operador de público inválido.");
    const parsed = ruleSchema.safeParse({ campo: rule.campo, operador: rule.operador, valor: rule.valor, valor2: rule.valor2 || undefined });
    if (!parsed.success || validateRule(parsed.data)) throw new Error("A IA gerou um filtro de público inválido. Gere novamente ou ajuste a descrição.");
    const values = rule.operador === "in" ? splitRuleList(rule.valor) : [rule.valor];
    if (values.length === 0 || values.some((value) => {
      if (rule.campo === "tier") return !allowedTiers.has(value);
      if (rule.campo === "rfvpSegment") return !allowedRfvp.has(value);
      if (rule.campo === "tag") return !allowedTags.has(value.toLocaleLowerCase("pt-BR"));
      if (rule.campo === "pipelineStage") return !allowedStages.has(value);
      return false;
    })) throw new Error("A IA sugeriu um valor de filtro que não existe neste workspace.");
    return parsed.data;
  });
  if (parsedRules.length === 0) return [];
  return [{
    id: "ai-campaign-filters",
    nome: "Filtros de público gerados por IA",
    tipo: "geral",
    combinar: "all",
    regras: parsedRules,
  }];
}

export async function POST(request: Request) {
  const guard = await requireModule("campanhas");
  if (guard.response) return guard.response;
  const body = await request.json().catch(() => null) as {
    mode?: unknown;
    prompt?: unknown;
    campaignName?: unknown;
    segmentIds?: unknown;
    campaignObjective?: unknown;
    audienceDescription?: unknown;
    audienceFilters?: unknown;
  } | null;
  const mode = body?.mode === "template" ? "template" : body?.mode === "campaign" ? "campaign" : null;
  const prompt = String(body?.prompt ?? "").trim().slice(0, 2000);
  if (!mode) return NextResponse.json({ error: "Modo de geração inválido." }, { status: 400 });
  if (prompt.length < 10) return NextResponse.json({ error: "Descreva a campanha com um pouco mais de detalhe." }, { status: 400 });

  try {
    const [segmentsRow, criteriaRow, pipelineStagesRow, tiersInUse, tagRows, templates] = await Promise.all([
      prisma.crmWorkspaceData.findUnique({ where: { key: "segments" }, select: { value: true } }),
      prisma.crmWorkspaceData.findUnique({ where: { key: "criteria" }, select: { value: true } }),
      prisma.crmWorkspaceData.findUnique({ where: { key: "pipeline-stages" }, select: { value: true } }),
      prisma.contact.findMany({ distinct: ["tier"], select: { tier: true }, orderBy: { tier: "asc" }, take: 20 }),
      prisma.$queryRaw<{ tag: string }[]>`SELECT DISTINCT btrim(entry.tag) AS tag FROM "ChatConversation" cc CROSS JOIN LATERAL unnest(cc.tags) AS entry(tag) WHERE btrim(entry.tag) <> '' ORDER BY tag LIMIT 500`,
      listTemplates(),
    ]);
    const segments = readArray(segmentsRow?.value) as unknown as AudienceSegment[];
    const savedCriteria = readArray(criteriaRow?.value);
    const tags = tagRows.map((item) => item.tag).sort((a, b) => a.localeCompare(b, "pt-BR"));
    const stageConfigs = resolveStageConfigs(pipelineStagesRow?.value);
    const segmentIds = Array.isArray(body?.segmentIds) ? body.segmentIds.filter((item): item is string => typeof item === "string") : [];
    const selectedSegments = segments.filter((segment) => segmentIds.includes(segment.id));
    const audienceFilters = mode === "template"
      ? z.array(campaignFilterSchema).max(10).safeParse(body?.audienceFilters ?? [])
      : null;
    if (mode === "template" && !audienceFilters?.success) {
      return NextResponse.json({ error: "Os filtros selecionados para o público são inválidos." }, { status: 400 });
    }
    const metadata = {
      segments: segments.map((segment) => ({
        id: segment.id,
        name: segment.nome,
        mode: segment.modoPublico ?? "criteria",
        criteria: (segment.criterios ?? []).map((id) => savedCriteria.find((item) => item.id === id || item.nome === id)?.nome ?? id),
      })),
      rfvpSegments: RFVP_SEGMENTS.map(({ key, label, description }) => ({ key, label, description })),
      tiers: [...new Set([...tiers.map((tier) => tier), ...tiersInUse.map((item) => item.tier)])],
      tags,
      pipelineStages: STAGE_DEFINITIONS.map(({ id }) => ({ id, name: stageConfigs[id].titulo })),
      approvedTemplates: templates.filter((template) => template.status === "APPROVED").map(({ name, language, category, body: text }) => ({ name, language, category, body: text })),
    };
    const system = [
      "Você cria campanhas para a Óticas Brasil. Responda somente no JSON Schema estrito solicitado.",
      "Use português brasileiro, tom acolhedor, sem alegações médicas ou promessas não autorizadas.",
      "Nunca invente IDs, segmentos, tags, etapas ou templates; use somente os metadados reais fornecidos.",
      "Para filtros de público, use apenas valores existentes nos metadados. Campos aceitos: tier (eq/in, valor em DIAMANTE,OURO,PRATA,BRONZE), rfvpSegment (eq/in, chaves RFV-P), tag (eq/in, tags existentes), pipelineStage (eq, id existente), lastPurchase (older_days, dias numéricos). Não invente regras adicionais.",
      "A audiência selecionada corresponde à união dos segmentos salvos e, em seguida, os filtros gerados são aplicados em conjunto (E).",
      mode === "campaign"
        ? "Gere campanha completa e uma proposta de template Meta: nome curto, objetivo, categoria MARKETING para divulgação/oferta ou UTILITY para mensagens transacionais, segmentIds existentes, filtros aplicáveis, descrição do público, corpo com variáveis {{1}}, {{2}} em ordem e params e examples correspondentes. Cabeçalho apenas NONE ou TEXT; rodapé até 60 caracteres; botões QUICK_REPLY curtos (até 25 caracteres), apenas se úteis."
        : "Gere um template WhatsApp Cloud API revisável. Use variáveis {{1}}, {{2}} em ordem e params com os campos correspondentes. Cabeçalho apenas NONE ou TEXT; rodapé até 60 caracteres; corpo até 1024; botões QUICK_REPLY curtos (até 25 caracteres), apenas se úteis. Escolha MARKETING para promoção e UTILITY para serviço transacional.",
      `Metadados reais do workspace: ${JSON.stringify(metadata)}`,
      ...(mode === "template" ? [`Campanha atual: ${String(body?.campaignName ?? "").slice(0, 200)}`, `Segmentos selecionados: ${JSON.stringify(selectedSegments.map(({ id, nome }) => ({ id, nome })))}`] : []),
      ...(mode === "template" ? [
        `Objetivo da campanha: ${String(body?.campaignObjective ?? "").slice(0, 500)}`,
        `Descrição do público: ${String(body?.audienceDescription ?? "").slice(0, 500)}`,
        `Filtros adicionais ativos: ${JSON.stringify(audienceFilters?.success ? audienceFilters.data : [])}`,
      ] : []),
    ].join("\n");
    const messages = [{ role: "system" as const, content: system }, { role: "user" as const, content: prompt }];

    if (mode === "campaign") {
      const draft = await aiJson<CampaignDraft>(messages, {
        feature: "campaign_builder",
        userId: guard.user.id,
        maxTokens: 1800,
        jsonSchema: { name: "campanha", schema: campaignSchema },
      });
      const variableIndices = [...new Set(draft.body.match(/\{\{\d+\}\}/g) ?? [])].map((item) => Number(item.slice(2, -2))).sort((a, b) => a - b);
      if (!draft.name.trim() || draft.name.length > 120 || !draft.body.trim() || draft.body.length > 1024 || draft.footer.length > 60 ||
        variableIndices.some((item, index) => item !== index + 1) || variableIndices.length !== draft.params.length ||
        (variableIndices.length > 0 && (draft.examples.length < variableIndices.length || draft.examples.slice(0, variableIndices.length).some((item) => !item.trim()))) ||
        draft.buttons.length > 3 || draft.buttons.some((button) => !button.text.trim() || button.text.length > 25) ||
        (draft.headerFormat === "TEXT" && (!draft.headerText.trim() || draft.headerText.length > 60))) {
        return NextResponse.json({ error: "A IA gerou uma campanha incompleta. Tente reformular o pedido." }, { status: 422 });
      }
      if (draft.segmentIds.some((id) => !segments.some((segment) => segment.id === id))) {
        return NextResponse.json({ error: "A IA selecionou um segmento que não existe mais. Atualize os dados e tente novamente." }, { status: 422 });
      }
      const audienceFilters = makeAudienceFilters(draft.audienceRules, tags);
      return NextResponse.json({
        campaign: {
          ...draft,
          name: draft.name.trim(),
          segmentIds: [...new Set(draft.segmentIds)],
          audienceFilters,
        },
      });
    }

    const draft = await aiJson<GeneratedTemplate>(messages, {
      feature: "campaign_template",
      userId: guard.user.id,
      maxTokens: 1400,
      jsonSchema: { name: "template_whatsapp", schema: templateSchema },
    });
    const variableIndices = [...new Set(draft.body.match(/\{\{\d+\}\}/g) ?? [])].map((item) => Number(item.slice(2, -2))).sort((a, b) => a - b);
    if (!draft.body.trim() || draft.body.length > 1024 || draft.footer.length > 60 ||
      variableIndices.some((item, index) => item !== index + 1) || variableIndices.length !== draft.params.length ||
      (variableIndices.length > 0 && draft.examples.length < variableIndices.length) ||
      draft.buttons.some((button) => !button.text.trim() || button.text.length > 25) || draft.buttons.length > 3 ||
      (draft.headerFormat === "TEXT" && (!draft.headerText.trim() || draft.headerText.length > 60))) {
      return NextResponse.json({ error: "A IA gerou um template inválido para as regras da Meta. Gere novamente ou ajuste o pedido." }, { status: 422 });
    }
    return NextResponse.json({ template: draft });
  } catch (error) {
    console.error("[campaigns/gerar-ia] falha:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível gerar a campanha." },
      { status: error instanceof AiError ? error.status : 502 },
    );
  }
}
