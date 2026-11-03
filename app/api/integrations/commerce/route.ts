import { requireApiSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });

  const url = new URL(request.url);
  const customerId = url.searchParams.get("customerId") || "";
  if (!/^[0-9a-f-]{36}$/i.test(customerId)) {
    return Response.json({ error: "Identificador de cliente inválido." }, { status: 400 });
  }

  const customerSourceId = `ecommerce:${customerId}`;
  const records = await prisma.commerceSyncRecord.findMany({
    where: { customerSourceId },
    orderBy: { updatedAt: "desc" },
    take: 51,
    select: { recordType: true, sourceId: true, payload: true, updatedAt: true },
  });
  return Response.json({
    data: {
      cart: records.find((record) => record.recordType === "cart") ?? null,
      orders: records.filter((record) => record.recordType === "order").slice(0, 50),
    },
  });
}
