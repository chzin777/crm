import "server-only";
import { z } from "zod";
import { requireModule } from "@/lib/api-auth";
import { PointsError } from "@/lib/brasil-points/engine";
import { AUTOMATIC_EVENTS, EVENT_KEYS, parseConditions, signedPoints } from "@/lib/brasil-points/rules";

/** Gestão do Brasil Points: módulo próprio ou quem já administra metas/usuários. */
export const requirePointsAdmin = () => requireModule("brasil_points", "metas", "usuarios");

export const adminName = (user: { name?: string | null; email?: string | null; id: string }) => user.name || user.email || user.id;

export function pointsErrorResponse(error: unknown, scope: string) {
  if (error instanceof PointsError) return Response.json({ error: error.message }, { status: error.status });
  console.error(`[brasil-points] ${scope}:`, error);
  return Response.json({ error: "Não foi possível concluir agora." }, { status: 500 });
}

const conditions = z.object({
  minOrderAmount: z.number().min(0).optional(),
  maxOrderAmount: z.number().min(0).optional(),
  brands: z.array(z.string().max(80)).max(50).optional(),
  categories: z.array(z.string().max(80)).max(50).optional(),
  pointsPerAmount: z.number().positive().optional(),
  withinDays: z.number().int().min(1).max(365).optional(),
  minScore: z.number().int().min(0).max(10).optional(),
  maxScore: z.number().int().min(0).max(10).optional(),
}).partial();

export const ruleBody = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(600).default(""),
  type: z.enum(["earn", "penalty"]),
  triggerType: z.enum(["automatic", "manual"]),
  eventKey: z.enum(EVENT_KEYS),
  pointsAmount: z.number().int().refine((value) => value !== 0 && Math.abs(value) <= 1_000_000, "Pontos inválidos."),
  conditions: conditions.default({}),
  isActive: z.boolean().default(false),
}).superRefine((rule, context) => {
  if (rule.triggerType === "automatic" && !AUTOMATIC_EVENTS.includes(rule.eventKey as (typeof AUTOMATIC_EVENTS)[number])) {
    context.addIssue({ code: "custom", path: ["eventKey"], message: "Este evento ainda não é processado automaticamente." });
  }
  if (rule.triggerType === "manual" && rule.eventKey !== (rule.type === "earn" ? "manual_bonus" : "manual_penalty")) {
    context.addIssue({ code: "custom", path: ["eventKey"], message: "O evento manual deve corresponder ao tipo de pontos." });
  }
});

/** Dados para gravar: pontos com o sinal do tipo, condições normalizadas e vigência ao ativar (sem retroativo). */
export function ruleData(input: z.infer<typeof ruleBody>, previous?: { isActive: boolean; activeSince: Date | null }) {
  const turningOn = input.isActive && !previous?.isActive;
  return {
    title: input.title,
    description: input.description,
    type: input.type,
    triggerType: input.triggerType,
    eventKey: input.eventKey,
    pointsAmount: signedPoints(input.type, input.pointsAmount),
    conditionsJson: parseConditions(input.conditions),
    isActive: input.isActive,
    activeSince: turningOn ? new Date() : input.isActive ? previous?.activeSince ?? new Date() : previous?.activeSince ?? null,
  };
}

export const rewardBody = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(600).default(""),
  imageUrl: z.string().trim().url().max(500).nullable().optional(),
  pointsCost: z.number().int().positive().max(10_000_000),
  stockQuantity: z.number().int().min(0).max(1_000_000).nullable().default(null),
  isActive: z.boolean().default(true),
});
