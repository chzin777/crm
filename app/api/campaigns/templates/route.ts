import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireModule } from "@/lib/api-auth";
import { patchCampaign, upsertCampaign, type CampaignRecord } from "@/lib/campaigns";
import { createTemplate, type TemplateButton } from "@/lib/meta-whatsapp";

const CONTACT_FIELDS = new Set(["nome", "email", "telefone", "segmento", "data_nascimento", "nome_atendente", "primeiro_nome_atendente"]);

type RequestBody = {
  campaign?: Record<string, unknown>;
  template?: {
    category?: unknown;
    headerText?: unknown;
    body?: unknown;
    footer?: unknown;
    params?: unknown;
    examples?: unknown;
    buttons?: unknown;
  };
};

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Falha ao enviar o modelo para a Meta.";
}

export async function POST(request: Request) {
  const guard = await requireModule("campanhas");
  if (guard.response) return guard.response;
  const payload = await request.json().catch(() => null) as RequestBody | null;
  const campaign = payload?.campaign;
  const template = payload?.template;
  const id = typeof campaign?.id === "string" ? campaign.id : "";
  const name = typeof campaign?.nome === "string" ? campaign.nome.trim() : "";
  const audience = typeof campaign?.publico === "string" ? campaign.publico.trim() : "";
  const message = typeof template?.body === "string" ? template.body.trim() : "";
  const category = template?.category === "MARKETING" ? "MARKETING" : template?.category === "UTILITY" ? "UTILITY" : null;
  const params = Array.isArray(template?.params) ? template.params.filter((item): item is string => typeof item === "string") : [];
  const examples = Array.isArray(template?.examples) ? template.examples.filter((item): item is string => typeof item === "string") : [];
  const footer = typeof template?.footer === "string" ? template.footer.trim() : "";
  const headerText = typeof template?.headerText === "string" ? template.headerText.trim() : "";

  if (!/^camp-[a-zA-Z0-9_-]{1,120}$/.test(id) || !name || !audience || !message || message.length > 1024 || !category) {
    return NextResponse.json({ error: "Dados da campanha ou do template inválidos." }, { status: 400 });
  }
  if (footer.length > 60 || headerText.length > 60 || params.some((field) => !CONTACT_FIELDS.has(field))) {
    return NextResponse.json({ error: "Cabeçalho, rodapé ou variáveis fora do limite permitido pela Meta." }, { status: 400 });
  }
  const variableIndices = [...new Set(message.match(/\{\{\d+\}\}/g) ?? [])].map((item) => Number(item.slice(2, -2))).sort((a, b) => a - b);
  if (variableIndices.some((item, index) => item !== index + 1) || variableIndices.length !== params.length ||
    (variableIndices.length > 0 && (examples.length < variableIndices.length || examples.slice(0, variableIndices.length).some((item) => !item.trim())))) {
    return NextResponse.json({ error: "Cada variável do modelo precisa ter um campo e um exemplo na mesma ordem." }, { status: 400 });
  }
  const rawButtons = Array.isArray(template?.buttons) ? template.buttons : [];
  if (rawButtons.length > 3 || rawButtons.some((item) => typeof item !== "object" || item === null ||
    (item as { type?: unknown }).type !== "QUICK_REPLY" || typeof (item as { text?: unknown }).text !== "string" ||
    !(item as { text: string }).text.trim() || (item as { text: string }).text.length > 25)) {
    return NextResponse.json({ error: "Os botões de resposta rápida precisam ter até 25 caracteres." }, { status: 400 });
  }
  const buttons = rawButtons as TemplateButton[];
  const campaignData: CampaignRecord = {
    ...campaign,
    id,
    nome: name,
    mensagem: message,
    status: "Aguardando aprovação Meta",
    metaApprovalStatus: "PENDING",
    metaApprovalReason: "",
    metaTemplateId: "",
    metaTemplateDraft: {
      category,
      headerText,
      body: message,
      footer,
      params,
      examples: examples.slice(0, variableIndices.length),
      buttons,
    },
    dataAtualizacao: new Date().toISOString(),
  } as CampaignRecord;
  const suffix = randomBytes(4).toString("hex");
  const templateName = `camp_${id.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 100)}_${suffix}`;
  campaignData.modelo = { name: templateName, language: "pt_BR", body: message, hasImage: false, params };

  await upsertCampaign(campaignData);
  try {
    const created = await createTemplate({
      name: templateName,
      language: "pt_BR",
      category,
      body: message,
      examples: examples.slice(0, variableIndices.length),
      footer: footer || undefined,
      headerText: headerText || undefined,
      buttons,
    });
    const approvalStatus = created.status.toUpperCase();
    const status = approvalStatus === "APPROVED" ? "Pronta para envio"
      : approvalStatus === "REJECTED" ? "Rejeitada pela Meta"
        : "Aguardando aprovação Meta";
    await patchCampaign(id, { metaTemplateId: created.id, metaApprovalStatus: approvalStatus, status, dataAtualizacao: new Date().toISOString() });
    return NextResponse.json({ ok: true, id: created.id, name: templateName, status: approvalStatus, campaignStatus: status }, { status: 201 });
  } catch (error) {
    console.error("[campaigns/templates] falha ao submeter à Meta:", error);
    await patchCampaign(id, {
      status: "Falha na submissão",
      metaApprovalStatus: "SUBMISSION_FAILED",
      metaApprovalReason: messageOf(error),
      dataAtualizacao: new Date().toISOString(),
    });
    return NextResponse.json({ error: messageOf(error), campaignSaved: true }, { status: 422 });
  }
}
