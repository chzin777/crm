import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type ErrorLevel = "error" | "critical" | "warning";

const COOLDOWN_MS = 10 * 60 * 1000;
const globalForReporter = globalThis as typeof globalThis & { errorReporterSeen?: Map<string, number> };
const seen = (globalForReporter.errorReporterSeen ??= new Map());

function describe(error: unknown) {
  if (error instanceof Error) return { message: error.message || error.name, stack: error.stack?.split("\n").slice(0, 8).join("\n") ?? null };
  return { message: typeof error === "string" ? error : JSON.stringify(error) ?? String(error), stack: null };
}

/** true quando o mesmo erro (origem + mensagem) já foi registrado nos últimos 10 min. */
export function isDuplicate(key: string, now = Date.now(), cooldownMs = COOLDOWN_MS) {
  const last = seen.get(key);
  if (last !== undefined && now - last < cooldownMs) return true;
  seen.set(key, now);
  if (seen.size > 500) for (const [item, at] of seen) if (now - at >= cooldownMs) seen.delete(item);
  return false;
}

async function sendAlert(level: ErrorLevel, source: string, message: string) {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;
  const text = `🚨 CRM [${level}] ${source}: ${message}`.slice(0, 1800);
  // "text" (Slack/genérico) e "content" (Discord) no mesmo corpo.
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, content: text }),
    signal: AbortSignal.timeout(5_000),
  });
}

/**
 * Registro central de erros críticos: grava em SystemErrorLog e avisa ALERT_WEBHOOK_URL (se configurado).
 * O mesmo erro só é registrado de novo depois de 10 min. Nunca lança: monitorar não pode derrubar o fluxo.
 */
export async function reportError(source: string, error: unknown, context?: Record<string, unknown>, level: ErrorLevel = "error") {
  try {
    const { message, stack } = describe(error);
    if (isDuplicate(`${source}|${message.slice(0, 200)}`)) return;
    console.error(`[monitor] ${source}: ${message}`);
    await prisma.systemErrorLog.create({
      data: {
        level,
        source: source.slice(0, 100),
        message: message.slice(0, 2000),
        stack: stack?.slice(0, 4000) ?? null,
        ...(context ? { context: JSON.parse(JSON.stringify(context)) as Prisma.InputJsonValue } : {}),
      },
    }).catch((failure) => console.error("[monitor] gravar erro:", failure instanceof Error ? failure.message : failure));
    await sendAlert(level, source, message).catch((failure) => console.error("[monitor] alerta:", failure instanceof Error ? failure.message : failure));
  } catch {
    // ignora: o registro de erro é o último recurso.
  }
}
