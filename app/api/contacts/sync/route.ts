import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      sourceKey,
      name,
      phone,
      email,
      birthDate,
      gender,
      occupation,
      city,
      neighborhood,
      state,
      store,
      category,
      purchases,
      totalSpent,
      lastPurchaseDate,
    } = body;

    if (!sourceKey || !name) {
      return NextResponse.json(
        { error: "sourceKey and name are required" },
        { status: 400 }
      );
    }

    const contact = await prisma.contact.upsert({
      where: { sourceKey },
      update: {
        name,
        phone: phone ?? null,
        email: email ?? null,
        birthDate: birthDate ?? null,
        gender: gender ?? null,
        occupation: occupation ?? null,
        city: city ?? null,
        neighborhood: neighborhood ?? null,
        state: state ?? null,
        store: store ?? null,
        category: category ?? "cliente",
        purchases: purchases ?? 0,
        totalSpent: totalSpent ?? 0,
        lastPurchaseDate: lastPurchaseDate ?? null,
      },
      create: {
        sourceKey,
        name,
        phone: phone ?? null,
        email: email ?? null,
        birthDate: birthDate ?? null,
        gender: gender ?? null,
        occupation: occupation ?? null,
        city: city ?? null,
        neighborhood: neighborhood ?? null,
        state: state ?? null,
        store: store ?? null,
        category: category ?? "cliente",
        purchases: purchases ?? 0,
        totalSpent: totalSpent ?? 0,
        lastPurchaseDate: lastPurchaseDate ?? null,
      },
    });

    return NextResponse.json({ ok: true, id: contact.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[contacts/sync]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}