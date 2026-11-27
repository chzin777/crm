import { z } from "zod";

export type VmsetLine = {
  sourceKey: string | null;
  customerName: string | null;
  store: string | null;
  seller: string | null;
  orderNumber: string | null;
  invoiceNumber: string | null;
  orderDay: string | null;
  invoiceDay: string | null;
  type: string | null;
  productCode: string | null;
  description: string | null;
  category: string | null;
  amount: number | null;
  syncedAt: Date | null;
};

export type AttributableOrder = {
  saleKey: string;
  sourceKey: string | null;
  customerName: string;
  store: string;
  seller: string;
  orderNumber: string;
  invoiceNumber: string;
  orderDay: string;
  invoiceDay: string;
  firstSeen: Date | null;
  netAmount: number;
  descriptions: string[];
};

const cents = (value: number) => Math.round(value * 100);
export const normalizeAttributionName = (value: string | null | undefined) =>
  (value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");

const itemKey = (row: VmsetLine) =>
  [row.sourceKey ?? "", row.store ?? "", row.orderNumber ?? "", row.orderDay ?? "", row.productCode ?? ""].join("|");

/** Agrupa linhas faturadas e remove itens devolvidos, mantendo o líquido dos itens ainda válidos. */
export function buildAttributableOrders(rows: VmsetLine[]): AttributableOrder[] {
  const returned = new Set(rows.filter((row) => row.type === "Devolucao Cliente").map(itemKey));
  const groups = new Map<string, { firstSeen: Date | null; totalCents: number; descriptions: Set<string>; row: VmsetLine }>();

  for (const row of rows) {
    if (row.type !== "Venda" || !row.invoiceDay || !row.orderDay || !row.orderNumber || !row.store || returned.has(itemKey(row))) continue;
    const key = `${row.sourceKey ?? normalizeAttributionName(row.customerName)}|${row.store}|${row.orderNumber}|${row.orderDay}|${row.invoiceDay}`;
    const group = groups.get(key) ?? { firstSeen: null, totalCents: 0, descriptions: new Set<string>(), row };
    group.totalCents += cents(row.amount ?? 0);
    if (row.description?.trim()) group.descriptions.add(row.description.trim());
    if (row.syncedAt && (!group.firstSeen || row.syncedAt < group.firstSeen)) group.firstSeen = row.syncedAt;
    groups.set(key, group);
  }

  return [...groups.entries()].flatMap(([key, group]) => {
    if (group.totalCents <= 0) return [];
    const row = group.row;
    return [{
      saleKey: key,
      sourceKey: row.sourceKey,
      customerName: row.customerName?.trim() || "Cliente VMSET",
      store: row.store!,
      seller: row.seller?.trim() || "Não informado",
      orderNumber: row.orderNumber!,
      invoiceNumber: row.invoiceNumber?.trim() || "",
      orderDay: row.orderDay!,
      invoiceDay: row.invoiceDay!,
      firstSeen: group.firstSeen,
      netAmount: group.totalCents / 100,
      descriptions: [...group.descriptions].sort(),
    }];
  });
}

const shiftDay = (day: string, count: number) => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
};

export function isWithinAttributionWindow(input: {
  attendanceDay: string;
  attendanceAt: Date;
  saleDay: string;
  firstSeen: Date | null;
  windowDays: number;
}) {
  if (input.saleDay < input.attendanceDay || input.saleDay > shiftDay(input.attendanceDay, input.windowDays)) return false;
  return !(input.saleDay === input.attendanceDay && input.firstSeen && input.firstSeen < input.attendanceAt);
}

export type AttendanceCandidate = {
  id: string;
  attendanceAt: Date;
  attendanceDay: string;
  contactKeys: string[];
  contactName: string;
};

/** Cada pedido pertence ao atendimento elegível mais recente, evitando atribuição duplicada. */
export function matchOrderToConversation<T extends AttendanceCandidate>(
  order: Pick<AttributableOrder, "sourceKey" | "customerName" | "invoiceDay" | "firstSeen">,
  conversations: T[],
  windowDays: number,
  uniqueContactNames: ReadonlySet<string> = new Set(),
): T | null {
  const nameKey = normalizeAttributionName(order.customerName);
  return [...conversations]
    .filter((conversation) => {
      const bySourceKey = !!order.sourceKey && conversation.contactKeys.includes(order.sourceKey);
      const byUniqueName = !order.sourceKey && uniqueContactNames.has(nameKey) && normalizeAttributionName(conversation.contactName) === nameKey;
      return (bySourceKey || byUniqueName) && isWithinAttributionWindow({
        attendanceDay: conversation.attendanceDay,
        attendanceAt: conversation.attendanceAt,
        saleDay: order.invoiceDay,
        firstSeen: order.firstSeen,
        windowDays,
      });
    })
    .sort((a, b) => b.attendanceAt.getTime() - a.attendanceAt.getTime() || a.id.localeCompare(b.id))[0] ?? null;
}

const attendanceVerdictSchema = z.object({
  is_qualified_attendance: z.boolean(),
  confidence_score: z.number().int().min(0).max(100),
  ai_summary: z.string().trim().min(1).max(500),
  target_store_indicated: z.string().trim().max(120).nullable(),
}).strict();

export type AttendanceVerdict = z.infer<typeof attendanceVerdictSchema>;

export function parseAttendanceVerdict(value: unknown): AttendanceVerdict {
  return attendanceVerdictSchema.parse(value);
}

export type AttendanceAuditFact = {
  conversationId: string;
  saleKey: string | null;
  aiStatus: string;
  aiQualified: boolean | null;
  manualDecision: boolean | null;
  netAmount: number | null;
};

export function isAttendanceEligible(record: Pick<AttendanceAuditFact, "aiStatus" | "aiQualified" | "manualDecision">) {
  return record.manualDecision ?? (record.aiStatus === "completed" && record.aiQualified === true);
}

export function attendantKpis(records: AttendanceAuditFact[], commission: { mode: "sale" | "percentage"; value: number }) {
  const validSales = new Map(
    records
      .filter((row) => row.saleKey !== null && isAttendanceEligible(row))
      .map((row) => [row.saleKey!, row]),
  );
  const qualifiedConversations = new Set([
    ...records.filter((row) => row.saleKey === null && isAttendanceEligible(row)).map((row) => row.conversationId),
    ...[...validSales.values()].filter((row) => row.manualDecision === true).map((row) => row.conversationId),
  ]);
  const convertedConversations = new Set(
    [...validSales.values()].map((row) => row.conversationId).filter((id) => qualifiedConversations.has(id)),
  );
  const revenueCents = [...validSales.values()].reduce((sum, row) => sum + cents(row.netAmount ?? 0), 0);
  const revenue = revenueCents / 100;
  const commissionValue = commission.mode === "sale"
    ? Math.round(commission.value * validSales.size * 100) / 100
    : Math.round(revenueCents * commission.value / 100) / 100;
  return {
    qualifiedAttendances: qualifiedConversations.size,
    validSales: validSales.size,
    revenue,
    conversionRate: qualifiedConversations.size ? convertedConversations.size / qualifiedConversations.size * 100 : null,
    averageTicket: validSales.size ? revenue / validSales.size : null,
    commissionForecast: commissionValue,
  };
}

export const attendanceModelSchema = {
  type: "object",
  properties: {
    is_qualified_attendance: { type: "boolean" },
    confidence_score: { type: "integer", minimum: 0, maximum: 100 },
    ai_summary: { type: "string" },
    target_store_indicated: { type: ["string", "null"] },
  },
  required: ["is_qualified_attendance", "confidence_score", "ai_summary", "target_store_indicated"],
  additionalProperties: false,
};
