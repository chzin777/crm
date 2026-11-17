import { timingSafeEqual } from "node:crypto";
import { connection, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";

const STARTED_AT = new Date().toISOString();
/** Gravado por scripts/backup-db.sh ao fim de cada backup válido. */
const LAST_BACKUP_KEY = "system:last-backup";
const BACKUP_MAX_AGE_H = 26;
const VMSET_MAX_AGE_H = 26;

function validToken(request: Request) {
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return [process.env.HEALTH_TOKEN, process.env.SYNC_API_TOKEN].some(
    (expected) => !!expected && provided.length === expected.length && timingSafeEqual(Buffer.from(provided), Buffer.from(expected)),
  );
}

const hoursSince = (date: Date | null) => (date ? Math.round(((Date.now() - date.getTime()) / 3_600_000) * 10) / 10 : null);

async function check<T>(action: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await action() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message.slice(0, 200) : "falhou" };
  }
}

/** Situação detalhada (banco, sync do VMSet, último backup, erros recentes): só com sessão ou token. */
async function details() {
  const database = await check(() => prisma.$queryRaw`SELECT 1`);
  const vmset = await check(async () => (await prisma.vmsetSale.aggregate({ _max: { syncedAt: true } }))._max.syncedAt);
  const backup = await check(async () => {
    const row = await prisma.crmWorkspaceData.findUnique({ where: { key: LAST_BACKUP_KEY } });
    return (row?.value ?? null) as { file?: string; sizeBytes?: number; at?: string } | null;
  });
  const errors = await check(() => prisma.systemErrorLog.count({ where: { createdAt: { gte: new Date(Date.now() - 24 * 3_600_000) } } }));

  const vmsetAt = vmset.ok ? vmset.value : null;
  const backupAt = backup.ok && backup.value?.at ? new Date(backup.value.at) : null;
  const checks = {
    database: database.ok ? { ok: true } : { ok: false, error: database.error },
    vmsetSync: vmset.ok
      ? { ok: !!vmsetAt && (hoursSince(vmsetAt) ?? Infinity) <= VMSET_MAX_AGE_H, lastSyncAt: vmsetAt?.toISOString() ?? null, ageHours: hoursSince(vmsetAt) }
      : { ok: false, error: vmset.error },
    backup: backup.ok
      ? { ok: !!backupAt && (hoursSince(backupAt) ?? Infinity) <= BACKUP_MAX_AGE_H, lastBackupAt: backupAt?.toISOString() ?? null, ageHours: hoursSince(backupAt), file: backup.value?.file ?? null, sizeBytes: backup.value?.sizeBytes ?? null }
      : { ok: false, error: backup.error },
    errorsLast24h: errors.ok ? { ok: true, count: errors.value } : { ok: false, error: errors.error },
  };
  return { healthy: Object.values(checks).every((item) => item.ok), checks };
}

/**
 * Público: versão no ar (o deploy automático confirma a subida por aqui), sem dados sensíveis.
 * ?details=1 com sessão ou Bearer HEALTH_TOKEN/SYNC_API_TOKEN: verificações completas (503 se algo falhar).
 */
export async function GET(request: Request) {
  // Sempre na hora do pedido: a versão vem das variáveis do container, não do build.
  await connection();
  const base = { ok: true, service: "crm", version: process.env.APP_VERSION ?? "dev", commit: process.env.GIT_COMMIT ?? "dev", startedAt: STARTED_AT };
  const headers = { "Cache-Control": "no-store" };
  if (new URL(request.url).searchParams.get("details") !== "1") return NextResponse.json(base, { headers });
  if (!validToken(request) && !(await requireApiSession())) return NextResponse.json({ error: "Não autenticado." }, { status: 401, headers });
  const result = await details();
  return NextResponse.json({ ...base, ...result }, { status: result.healthy ? 200 : 503, headers });
}
