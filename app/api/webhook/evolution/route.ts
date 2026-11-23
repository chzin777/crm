import { NextResponse } from "next/server";

// Webhook do Evolution API desativado: o WhatsApp do CRM é a Cloud API oficial (/api/whatsapp/webhook, com assinatura
// HMAC da Meta). A rota antiga aceitava qualquer chamada sem segredo e consultava contatos pelo telefone informado.
export async function POST() {
  return NextResponse.json({ error: "Rota descontinuada: o WhatsApp usa a Cloud API oficial." }, { status: 410 });
}
