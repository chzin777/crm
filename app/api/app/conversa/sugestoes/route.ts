import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { chatError, requireChatActor } from "@/lib/chat/access";
import { aiJson, AiError } from "@/lib/ai/openai";
import { listTemplates } from "@/lib/meta-whatsapp";
import { ownTemplates } from "@/lib/meta-sample-templates";
import { ownContactIds } from "@/lib/own-clients";

const body = z.object({ contactId: z.string().min(1) });

type Suggestion = { motivo: string; modelo: string; parametros: string[]; mensagens: string[] };

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["motivo", "modelo", "parametros", "mensagens"],
  properties: {
    motivo: { type: "string", description: "Por que vale chamar este cliente agora (1 frase curta para o vendedor)." },
    modelo: { type: "string", description: "Nome exato do modelo aprovado mais adequado, ou vazio se nenhum servir." },
    parametros: { type: "array", items: { type: "string" }, description: "Valores das variáveis {{1}}, {{2}}... do modelo escolhido, na ordem." },
    mensagens: { type: "array", items: { type: "string" }, description: "2 ou 3 mensagens curtas de abertura para WhatsApp (quando a janela de 24h estiver aberta)." },
  },
};

const varCount = (text: string) => new Set(text.match(/\{\{\d+\}\}/g) ?? []).size;

/**
 * Sugestões da IA para iniciar conversa no app (mesma IA e credenciais do CRM, sem enviar nada ao cliente):
 * motivo do contato, modelo aprovado mais adequado com as variáveis preenchidas e mensagens de abertura.
 */
export async function POST(request: Request) {
  const guard = await requireChatActor("chat.assume");
  if (guard.response) return guard.response;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return chatError("Informe o contato.", 400);
  const own = await ownContactIds(guard.actor.id);
  if (own && !own.has(parsed.data.contactId)) return chatError("Contato não encontrado.", 404);

  const contact = await prisma.contact.findUnique({
    where: { id: parsed.data.contactId },
    select: { name: true, sourceKey: true, category: true, segment: true, store: true, city: true, birthDate: true, lastPurchaseDate: true, prescriptionExpiry: true, purchases: true, totalSpent: true },
  });
  if (!contact) return chatError("Contato não encontrado.", 404);

  const [purchases, lastConversation, templates] = await Promise.all([
    prisma.vmsetSale.findMany({
      where: { sourceKey: contact.sourceKey, type: "Venda" },
      orderBy: { orderDate: "desc" },
      take: 8,
      select: { orderDate: true, description: true, brand: true, category: true, seller: true },
    }),
    prisma.chatConversation.findFirst({ where: { contactId: parsed.data.contactId }, orderBy: { lastInboundAt: "desc" }, select: { lastInboundAt: true, closedAt: true } }),
    listTemplates().then((list) => ownTemplates(list).filter((template) => template.status === "APPROVED")).catch(() => []),
  ]);

  const profile = {
    nome: contact.name,
    categoria: contact.category,
    segmento: contact.segment,
    loja: contact.store,
    cidade: contact.city,
    aniversario: contact.birthDate,
    ultimaCompra: contact.lastPurchaseDate,
    validadeReceita: contact.prescriptionExpiry,
    compras: contact.purchases,
    totalGasto: Number(contact.totalSpent),
    ultimasCompras: purchases.map((item) => ({ dia: item.orderDate?.toISOString().slice(0, 10) ?? null, produto: item.description, marca: item.brand, categoria: item.category })),
    ultimaConversa: lastConversation?.lastInboundAt?.toISOString().slice(0, 10) ?? null,
    hoje: new Date().toISOString().slice(0, 10),
    vendedor: guard.actor.name ?? null,
  };
  const options = templates.slice(0, 30).map((template) => ({ nome: template.name, categoria: template.category, variaveis: varCount(template.body), texto: template.body.slice(0, 500) }));

  try {
    const result = await aiJson<Suggestion>(
      [
        {
          role: "system",
          content:
            "Você é consultora de vendas de uma rede de óticas e ajuda o vendedor a puxar conversa com um cliente pelo WhatsApp. " +
            "Use só os dados fornecidos (nunca invente compras, preços ou promoções). Seja calorosa, natural e breve, em português do Brasil. " +
            "Escolha o modelo aprovado que melhor combina com o momento do cliente (aniversário, receita vencendo, compra recente, cliente inativo) " +
            "e preencha cada variável {{n}} com valores reais (primeiro nome do cliente, loja, nome do vendedor...). Sem modelo adequado, deixe modelo vazio e parametros vazio. " +
            "As mensagens de abertura não podem ter emojis em excesso (no máximo 1) e não podem pedir permissão para ajudar.",
        },
        { role: "user", content: JSON.stringify({ cliente: profile, modelos: options }) },
      ],
      { feature: "app-new-conversation", userId: guard.actor.id, maxTokens: 500, jsonSchema: { name: "sugestao_conversa", schema } },
    );
    const chosen = templates.find((template) => template.name === result.modelo) ?? null;
    const count = chosen ? varCount(chosen.body) : 0;
    return NextResponse.json({
      data: {
        reason: String(result.motivo ?? "").trim(),
        template: chosen ? { name: chosen.name, language: chosen.language, params: Array.from({ length: count }, (_, index) => String(result.parametros?.[index] ?? "").trim()) } : null,
        messages: (Array.isArray(result.mensagens) ? result.mensagens : []).map((text) => String(text).trim()).filter(Boolean).slice(0, 3),
      },
    });
  } catch (error) {
    if (error instanceof AiError) return chatError(error.message, error.status);
    console.error("[app/conversa/sugestoes] falha");
    return chatError("A IA não conseguiu sugerir agora.", 503);
  }
}
