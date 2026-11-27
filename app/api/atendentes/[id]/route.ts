import { requireModule } from "@/lib/api-auth";
import { canManageAttendanceAttributions } from "@/lib/attendants/access";
import { prisma } from "@/lib/prisma";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const guard = await requireModule("metricas");
  if (guard.response) return guard.response;
  if (!(await canManageAttendanceAttributions(guard.user.id))) {
    return Response.json({ error: "Apenas gestores podem abrir a auditoria detalhada." }, { status: 403 });
  }

  const { id } = await context.params;
  const row = await prisma.attendanceSaleAttribution.findUnique({
    where: { id },
    select: {
      id: true,
      conversationId: true,
      saleKey: true,
      sourceKey: true,
      orderNumber: true,
      invoiceNumber: true,
      attendanceAt: true,
      orderDate: true,
      saleDate: true,
      store: true,
      seller: true,
      customerName: true,
      netAmount: true,
      aiStatus: true,
      aiQualified: true,
      aiConfidence: true,
      aiSummary: true,
      targetStore: true,
      manualDecision: true,
      reviewNote: true,
      conversation: {
        select: {
          phone: true,
          contact: { select: { name: true } },
          messages: {
            where: { internal: false, deletedAt: null },
            orderBy: { createdAt: "asc" },
            select: { id: true, author: true, authorUserId: true, authorName: true, text: true, transcription: true, attachment: true, createdAt: true },
          },
        },
      },
    },
  });
  if (!row) return Response.json({ error: "Atribuição não encontrada." }, { status: 404 });

  const orderLines = row.saleKey && row.store && row.orderNumber
    ? await prisma.vmsetSale.findMany({
      where: {
        store: row.store,
        orderNumber: row.orderNumber,
        ...(row.orderDate ? { orderDate: row.orderDate } : {}),
        type: { in: ["Venda", "Devolucao Cliente"] },
        ...(row.sourceKey ? { sourceKey: row.sourceKey } : { customerName: row.customerName ?? undefined }),
      },
      orderBy: [{ type: "asc" }, { description: "asc" }],
      select: { type: true, productCode: true, description: true, brand: true, category: true, quantity: true, amount: true, discount: true, invoiceNumber: true },
    })
    : [];

  return Response.json({
    data: {
      id: row.id,
      saleKey: row.saleKey,
      customerName: row.customerName ?? row.conversation.contact.name,
      phone: row.conversation.phone,
      orderNumber: row.orderNumber,
      invoiceNumber: row.invoiceNumber,
      attendanceAt: row.attendanceAt.toISOString(),
      orderDate: row.orderDate?.toISOString().slice(0, 10) ?? null,
      saleDate: row.saleDate?.toISOString().slice(0, 10) ?? null,
      store: row.store,
      seller: row.seller,
      netAmount: row.netAmount === null ? null : Number(row.netAmount),
      aiStatus: row.aiStatus,
      aiQualified: row.aiQualified,
      aiConfidence: row.aiConfidence,
      aiSummary: row.aiSummary,
      targetStore: row.targetStore,
      manualDecision: row.manualDecision,
      reviewNote: row.reviewNote,
      messages: row.conversation.messages.map((message) => ({
        id: message.id,
        author: message.author,
        attendant: message.author === "agent" && !!message.authorUserId,
        authorName: message.authorName,
        text: message.text,
        transcription: message.transcription,
        hasAttachment: message.attachment !== null,
        createdAt: message.createdAt.toISOString(),
      })),
      orderLines: orderLines.map((line) => ({
        ...line,
        quantity: line.quantity === null ? null : Number(line.quantity),
        amount: line.amount === null ? null : Number(line.amount),
        discount: line.discount === null ? null : Number(line.discount),
      })),
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request, context: Context) {
  const guard = await requireModule("metricas");
  if (guard.response) return guard.response;
  if (!(await canManageAttendanceAttributions(guard.user.id))) {
    return Response.json({ error: "Apenas gestores podem revisar a auditoria." }, { status: 403 });
  }

  let body: { approved?: unknown; note?: unknown };
  try {
    body = await request.json() as { approved?: unknown; note?: unknown };
  } catch {
    return Response.json({ error: "Corpo da solicitação inválido." }, { status: 400 });
  }
  if (typeof body.approved !== "boolean" || (body.note !== undefined && typeof body.note !== "string")) {
    return Response.json({ error: "Informe se o atendimento está aprovado ou reprovado." }, { status: 400 });
  }
  const approved = body.approved;
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (note.length > 500) return Response.json({ error: "A justificativa deve ter até 500 caracteres." }, { status: 400 });

  const { id } = await context.params;
  try {
    const row = await prisma.attendanceSaleAttribution.findUnique({ where: { id }, select: { id: true, saleKey: true, manualDecision: true } });
    if (!row || !row.saleKey) return Response.json({ error: "Venda atribuída não encontrada." }, { status: 404 });
    const updated = await prisma.$transaction(async (tx) => {
      const attribution = await tx.attendanceSaleAttribution.update({
        where: { id },
        data: { manualDecision: approved, reviewNote: note || null, reviewedById: guard.user.id, reviewedAt: new Date() },
        select: { id: true, manualDecision: true, reviewNote: true, reviewedAt: true },
      });
      await tx.attendanceSaleAttributionAudit.create({
        data: {
          attributionId: id,
          actorId: guard.user.id,
          previousDecision: row.manualDecision,
          decision: approved,
          note: note || null,
        },
      });
      return attribution;
    });
    return Response.json({ data: { ...updated, reviewedAt: updated.reviewedAt?.toISOString() ?? null } });
  } catch (error) {
    console.error("[atendentes] falha ao registrar revisão:", error);
    return Response.json({ error: "Não foi possível salvar a revisão manual." }, { status: 500 });
  }
}
