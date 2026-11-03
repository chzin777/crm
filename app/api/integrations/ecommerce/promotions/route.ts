import { z } from "zod";
import { requireApiSession } from "@/lib/api-auth";
import { sendEcommerceIntegrationEvent } from "@/lib/ecommerce-integration";

const promotionSchema = z.object({
  campaignId: z.string().trim().min(1).max(120),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,40}$/),
  description: z.string().trim().min(1).max(120),
  discountPercent: z.number().positive().max(100).optional(),
  discountAmount: z.number().positive().max(100_000).optional(),
  minSubtotal: z.number().nonnegative().optional(),
  expiresAt: z.string().datetime().optional(),
  active: z.boolean(),
}).refine((promotion) => Boolean(promotion.discountPercent) !== Boolean(promotion.discountAmount), {
  message: "Informe apenas um tipo de desconto.",
});

export async function POST(request: Request) {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const parsed = promotionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Revise os dados do cupom promocional." }, { status: 400 });

  try {
    await sendEcommerceIntegrationEvent("promotion.upsert", {
      ...parsed.data,
      updatedAt: new Date().toISOString(),
    });
    return Response.json({ accepted: true });
  } catch (error) {
    console.error("[integration:ecommerce-promotion]", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Não foi possível sincronizar o cupom com a loja." },
      { status: 502 },
    );
  }
}
