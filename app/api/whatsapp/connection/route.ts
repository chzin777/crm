import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { connectInstance, ensureInstance, getConnectedNumber, getConnectionState, logoutInstance } from "@/lib/evolution";

async function guard() {
  return (await requireApiSession()) ? null : NextResponse.json({ error: "Não autorizado" }, { status: 401 });
}

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  try {
    await ensureInstance();
    const state = await getConnectionState();
    const number = state === "open" ? await getConnectedNumber() : null;
    return NextResponse.json({ state, number });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao consultar a conexão." }, { status: 502 });
  }
}

// Gera o QR Code para parear o WhatsApp
export async function POST() {
  const denied = await guard();
  if (denied) return denied;
  try {
    await ensureInstance();
    const data = await connectInstance();
    return NextResponse.json({ qrcode: data.base64 ?? null, pairingCode: data.pairingCode ?? null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao conectar." }, { status: 502 });
  }
}

export async function DELETE() {
  const denied = await guard();
  if (denied) return denied;
  try {
    await logoutInstance();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao desconectar." }, { status: 502 });
  }
}
