import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/cache";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { number, name, address, addressNumber, complement, postalCode, city, state, neighborhoods, active, kind, unitIds } = body;

    if (typeof number !== "number" || !name) {
      return NextResponse.json({ error: "number and name are required" }, { status: 400 });
    }

    const store = await prisma.store.upsert({
      where: { number },
      update: {
        name,
        address: address ?? null,
        addressNumber: addressNumber ?? null,
        complement: complement ?? null,
        postalCode: postalCode ?? null,
        city: city ?? null,
        state: state ?? null,
        neighborhoods: neighborhoods ?? [],
        active: active ?? true,
        kind: kind ?? null,
        unitIds: unitIds ?? [],
      },
      create: {
        number,
        name,
        address: address ?? null,
        addressNumber: addressNumber ?? null,
        complement: complement ?? null,
        postalCode: postalCode ?? null,
        city: city ?? null,
        state: state ?? null,
        neighborhoods: neighborhoods ?? [],
        active: active ?? true,
        kind: kind ?? null,
        unitIds: unitIds ?? [],
      },
    });

    await invalidateCache("stores", "audience:store:");
    return NextResponse.json({ ok: true, id: store.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[stores/sync]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}