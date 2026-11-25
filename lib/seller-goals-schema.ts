import { z } from "zod";

/** Validação do PUT /api/vendas/metas: meta em R$ (até 2 casas) e/ou em quantidade (inteiro); 0 zera aquele tipo. */
const amount = z.number().finite().min(0).max(999_999_999.99).transform((value) => Math.round(value * 100) / 100);
const quantity = z.number().int("A quantidade precisa ser um número inteiro.").min(0).max(9_999_999);

export const goalsPayloadSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Informe o mês (AAAA-MM)."),
  goals: z
    .array(z.object({ sellerId: z.string().min(1).max(64), amount: amount.optional(), quantity: quantity.optional() }))
    .max(2000)
    .default([]),
  company: z
    .object({
      global: amount.optional(),
      brands: z
        .array(z.object({ key: z.string().trim().min(1).max(120), label: z.string().max(120), amount: amount.optional(), quantity: quantity.optional() }))
        .max(500)
        .default([]),
    })
    .optional(),
});

export type GoalsPayload = z.infer<typeof goalsPayloadSchema>;

/** Corpo validado ou a primeira mensagem de erro em português. */
export function parseGoalsPayload(body: unknown): { data: GoalsPayload } | { error: string } {
  const result = goalsPayloadSchema.safeParse(body);
  if (result.success) return { data: result.data };
  const issue = result.error.issues[0];
  return { error: issue?.code === "invalid_type" && issue.path.at(-1) === "month" ? "Informe o mês (AAAA-MM)." : issue?.message && !issue.message.startsWith("Invalid") && !issue.message.startsWith("Too") ? issue.message : "Metas inválidas: use só números (R$ com até 2 casas, quantidade inteira)." };
}
