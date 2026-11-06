import { timingSafeEqual } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/cache";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function authorized(request: Request) {
  const secret = process.env.INTEGRATION_SHARED_SECRET;
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.match(/^Bearer (.+)$/i)?.[1];
  if (!secret || !token) return false;
  const received = Buffer.from(token);
  const expected = Buffer.from(secret);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function dateValue(value: string | null) {
  if (!value) return Number.NaN;
  const brazilian = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return Date.parse(brazilian ? `${brazilian[3]}-${brazilian[2]}-${brazilian[1]}` : value);
}

const contactFields = {
  id: true,
  name: true,
  email: true,
  phone: true,
  cpf: true,
  city: true,
  state: true,
  ecommerceCustomerId: true,
  ecommerceUpdatedAt: true,
} as const;

// O ERP grava CPF sem zeros à esquerda, então os dois formatos precisam ser procurados.
async function findContactByCpf(tx: Prisma.TransactionClient, cpf: string) {
  const unpadded = cpf.replace(/^0+/, "");
  if (!unpadded) return null;
  const matches = await tx.contact.findMany({
    where: { cpf: { in: [cpf, unpadded] } },
    select: { id: true, ecommerceCustomerId: true },
    take: 2,
  });
  return matches.length === 1 ? matches[0] : null;
}

// Comparação exata: e-mail compartilhado por mais de um contato nunca gera vínculo.
async function findContactByEmail(tx: Prisma.TransactionClient, email: string) {
  const matches = await tx.$queryRaw<{ id: string; ecommerceCustomerId: string | null }[]>`
    SELECT "id", "ecommerceCustomerId" FROM "Contact" WHERE lower("email") = lower(${email}) LIMIT 2
  `;
  return matches.length === 1 ? matches[0] : null;
}

function isEmpty(value: string | null | undefined) {
  return !value?.trim();
}

async function upsertCustomer(tx: Prisma.TransactionClient, customer: Record<string, unknown>) {
  const customerId = String(customer.customerId || "");
  const name = typeof customer.name === "string" ? customer.name.trim().slice(0, 200) : "";
  const sourceUpdatedAt = typeof customer.sourceUpdatedAt === "string" ? new Date(customer.sourceUpdatedAt) : null;
  const address = object(customer.address) || {};
  if (!uuid.test(customerId) || name.length < 2 || !sourceUpdatedAt || Number.isNaN(sourceUpdatedAt.getTime())) {
    throw new Error("Dados de cliente do e-commerce inválidos.");
  }

  const customerSourceId = `ecommerce:${customerId}`;
  let current = await tx.contact.findUnique({
    where: { ecommerceCustomerId: customerId },
    select: contactFields,
  });
  if (!current) {
    const cpf = typeof customer.cpf === "string" ? customer.cpf.replace(/\D/g, "").slice(0, 11) : "";
    const email = typeof customer.email === "string" ? customer.email.trim() : "";
    const matched = cpf.length === 11
      ? await findContactByCpf(tx, cpf)
      : email
        ? await findContactByEmail(tx, email)
        : null;
    if (matched && !matched.ecommerceCustomerId) {
      current = await tx.contact.update({
        where: { id: matched.id },
        data: { ecommerceCustomerId: customerId },
        select: contactFields,
      });
    }
  }
  const canApplyProfile = !current?.ecommerceUpdatedAt || sourceUpdatedAt >= current.ecommerceUpdatedAt;
  const profile = {
    name,
    ...(typeof customer.email === "string" && customer.email.trim()
      ? { email: customer.email.trim().slice(0, 254) }
      : {}),
    ...(typeof customer.phone === "string" && customer.phone.trim()
      ? { phone: customer.phone.trim().slice(0, 40) }
      : {}),
    ...(typeof customer.cpf === "string" && customer.cpf.replace(/\D/g, "").length === 11
      ? { cpf: customer.cpf.replace(/\D/g, "") }
      : {}),
    ...(typeof address.city === "string" && address.city.trim()
      ? { city: address.city.trim().slice(0, 120) }
      : {}),
    ...(typeof address.state === "string" && address.state.trim()
      ? { state: address.state.trim().slice(0, 2).toUpperCase() }
      : {}),
  };

  if (current && canApplyProfile) {
    const existing = current;
    // A loja só completa o cadastro: o que já veio do ERP nunca é sobrescrito.
    const missing = Object.fromEntries(
      Object.entries(profile).filter(([field]) => isEmpty(existing[field as keyof typeof profile])),
    );
    await tx.contact.update({
      where: { id: existing.id },
      data: { ...missing, ecommerceUpdatedAt: sourceUpdatedAt },
    });
    return { contactId: existing.id, customerSourceId };
  }
  if (current) return { contactId: current.id, customerSourceId };

  const created = await tx.contact.create({
    data: {
      sourceKey: customerSourceId,
      ecommerceCustomerId: customerId,
      category: "cliente",
      ...profile,
      ecommerceUpdatedAt: sourceUpdatedAt,
    },
    select: { id: true },
  });
  return { contactId: created.id, customerSourceId };
}

async function updatePurchaseTotals(tx: Prisma.TransactionClient, contactId: string, customerSourceId: string) {
  const [contact, orders] = await Promise.all([
    tx.contact.findUnique({
      where: { id: contactId },
      select: {
        id: true,
        purchases: true,
        totalSpent: true,
        ecommercePurchases: true,
        ecommerceTotalSpent: true,
        ecommerceLastPurchaseDate: true,
        lastPurchaseDate: true,
      },
    }),
    tx.commerceSyncRecord.findMany({
      where: { recordType: "order", customerSourceId },
      select: { payload: true },
    }),
  ]);
  if (!contact) return;

  const purchases = orders.flatMap((record) => {
    const order = object(record.payload);
    return order && order.status !== "canceled" ? [order] : [];
  });
  const totalSpent = purchases.reduce((sum, order) => sum + (Number(order.total) || 0), 0);
  const lastPurchase = purchases
    .map((order) => typeof order.createdAt === "string" ? order.createdAt : "")
    .filter(Boolean)
    .sort()
    .at(-1) || null;
  const previousLastPurchase = contact.lastPurchaseDate === contact.ecommerceLastPurchaseDate
    ? null
    : contact.lastPurchaseDate;
  const lastPurchaseDate = [previousLastPurchase, lastPurchase]
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => dateValue(left) - dateValue(right))
    .at(-1) || null;

  await tx.contact.update({
    where: { id: contact.id },
    data: {
      purchases: contact.purchases + purchases.length - contact.ecommercePurchases,
      totalSpent: Number(contact.totalSpent) + totalSpent - Number(contact.ecommerceTotalSpent),
      ecommercePurchases: purchases.length,
      ecommerceTotalSpent: totalSpent,
      ecommerceLastPurchaseDate: lastPurchase,
      lastPurchaseDate,
    },
  });
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "Integração não autenticada ou não configurada." }, { status: 401 });
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > 1_000_000) {
    return Response.json({ error: "O evento excede o tamanho permitido." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }
  const event = object(body);
  const data = object(event?.data);
  const eventId = String(event?.eventId || "");
  const type = String(event?.type || "");
  if (!uuid.test(eventId) || !data || !["customer.upsert", "cart.upsert", "order.upsert", "promotions.snapshot"].includes(type)) {
    return Response.json({ error: "Evento de integração inválido." }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const receipt = await tx.integrationEvent.createMany({
        data: { eventId, source: "ecommerce", eventType: type },
        skipDuplicates: true,
      });
      if (!receipt.count) return { duplicate: true };

      if (type === "customer.upsert") {
        await upsertCustomer(tx, data);
      } else if (type === "cart.upsert") {
        const customer = object(data.customer);
        if (!customer) throw new Error("O evento de carrinho não contém cliente.");
        const { customerSourceId } = await upsertCustomer(tx, customer);
        await tx.commerceSyncRecord.upsert({
          where: { recordType_sourceId: { recordType: "cart", sourceId: customerSourceId } },
          create: { recordType: "cart", sourceId: customerSourceId, customerSourceId, payload: jsonValue(data) },
          update: { customerSourceId, payload: jsonValue(data) },
        });
      } else if (type === "order.upsert") {
        const order = object(data.order);
        const customer = object(data.customer);
        const orderId = String(order?.id || "");
        if (!order || !customer || !uuid.test(orderId)) throw new Error("O evento de pedido é inválido.");
        const { contactId, customerSourceId } = await upsertCustomer(tx, customer);
        await tx.commerceSyncRecord.upsert({
          where: { recordType_sourceId: { recordType: "order", sourceId: orderId } },
          create: { recordType: "order", sourceId: orderId, customerSourceId, payload: jsonValue(order) },
          update: { customerSourceId, payload: jsonValue(order) },
        });
        await updatePurchaseTotals(tx, contactId, customerSourceId);
      } else {
        await tx.commerceSyncRecord.upsert({
          where: { recordType_sourceId: { recordType: "promotions", sourceId: "ecommerce:current" } },
          create: { recordType: "promotions", sourceId: "ecommerce:current", payload: jsonValue(data) },
          update: { payload: jsonValue(data) },
        });
      }
      return { duplicate: false };
    });
    if (!result.duplicate) await invalidateCache("dashboard", "audience:store:");
    return Response.json({ accepted: true, duplicate: result.duplicate });
  } catch (error) {
    console.error("[integration:ecommerce]", error);
    return Response.json({ error: error instanceof Error ? error.message : "Falha ao processar evento." }, { status: 500 });
  }
}
