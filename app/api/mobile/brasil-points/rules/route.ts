import { prisma } from "@/lib/prisma";
import { EVENT_LABELS, parseConditions, type EventKey } from "@/lib/brasil-points/rules";
import { noStore, requireMobileUser } from "@/lib/brasil-points/mobile";

/** Regras ativas, para transparência: "Como ganhar" e "O que faz perder pontos". */
export async function GET() {
  const guard = await requireMobileUser();
  if (guard.response) return guard.response;
  const rules = await prisma.brasilPointsRule.findMany({ where: { isActive: true }, orderBy: [{ pointsAmount: "desc" }, { title: "asc" }] });
  const view = (rule: (typeof rules)[number]) => ({
    id: rule.id,
    title: rule.title,
    description: rule.description,
    event: EVENT_LABELS[rule.eventKey as EventKey] ?? rule.eventKey,
    trigger: rule.triggerType,
    points: rule.pointsAmount,
    label: rule.pointsAmount > 0 ? `+${rule.pointsAmount}` : String(rule.pointsAmount),
    conditions: parseConditions(rule.conditionsJson),
  });
  return Response.json({ data: { earn: rules.filter((rule) => rule.type === "earn").map(view), penalty: rules.filter((rule) => rule.type === "penalty").map(view) } }, noStore);
}
