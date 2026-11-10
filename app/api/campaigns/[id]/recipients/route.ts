import { NextResponse } from "next/server";
import type { CampaignMessageStatus, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/api-auth";

const PAGE_SIZE = 25;
const STATUSES: CampaignMessageStatus[] = ["queued", "sent", "delivered", "read", "replied", "failed"];

/** Destinatários de um disparo com o status individual, paginados e com busca por nome ou telefone. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireModule("campanhas", "disparos");
  if (guard.response) return guard.response;
  const { id } = await context.params;
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const q = (url.searchParams.get("q") ?? "").trim();
  const statusParam = url.searchParams.get("status") as CampaignMessageStatus | null;

  const where: Prisma.CampaignMessageWhereInput = { campaignId: id };
  if (statusParam && STATUSES.includes(statusParam)) where.status = statusParam;
  if (q) {
    const digits = q.replace(/\D/g, "");
    const contacts = await prisma.contact.findMany({ where: { name: { contains: q, mode: "insensitive" } }, select: { id: true }, take: 500 });
    where.OR = [
      ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
      ...(contacts.length > 0 ? [{ contactId: { in: contacts.map((contact) => contact.id) } }] : []),
    ];
    if (where.OR.length === 0) return NextResponse.json({ data: [], total: 0, page, pageSize: PAGE_SIZE });
  }

  const [total, rows] = await Promise.all([
    prisma.campaignMessage.count({ where }),
    prisma.campaignMessage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, contactId: true, phone: true, status: true, sentAt: true, deliveredAt: true, readAt: true, repliedAt: true, failedAt: true, failureReason: true, createdAt: true },
    }),
  ]);
  const contactIds = rows.map((row) => row.contactId).filter((value): value is string => Boolean(value));
  const names = new Map(
    (contactIds.length ? await prisma.contact.findMany({ where: { id: { in: contactIds } }, select: { id: true, name: true } }) : []).map((contact) => [contact.id, contact.name]),
  );

  return NextResponse.json({
    data: rows.map((row) => ({
      id: row.id,
      name: row.contactId ? names.get(row.contactId) ?? "" : "",
      phone: row.phone,
      status: row.status,
      at: (row.repliedAt ?? row.readAt ?? row.deliveredAt ?? row.sentAt ?? row.failedAt ?? row.createdAt).toISOString(),
      failureReason: row.failureReason,
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
  }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
