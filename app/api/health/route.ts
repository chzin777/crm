import { connection, NextResponse } from "next/server";

const STARTED_AT = new Date().toISOString();

/** Versão no ar (público, sem dados sensíveis): o deploy automático confirma a subida por aqui. */
export async function GET() {
  // Sempre na hora do pedido: a versão vem das variáveis do container, não do build.
  await connection();
  return NextResponse.json(
    { ok: true, service: "crm", version: process.env.APP_VERSION ?? "dev", commit: process.env.GIT_COMMIT ?? "dev", startedAt: STARTED_AT },
    { headers: { "Cache-Control": "no-store" } },
  );
}
