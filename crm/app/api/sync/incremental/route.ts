import { NextResponse } from "next/server";

// O CRM não consulta mais o Oracle. A API do VMSet é a única que lê o Oracle e alimenta o banco do CRM.
export async function POST() {
  return NextResponse.json(
    { error: "Rota descontinuada: a sincronização é feita pela API do VMSet, não pelo CRM." },
    { status: 410 },
  );
}
