/**
 * Rede de segurança do processo Node: promessa rejeitada sem `.catch` ou exceção solta em tarefa de fundo
 * (relógio, disparos, webhooks) vira log estruturado + registro em /api/health?details=1, sem derrubar o container.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const flag = Symbol.for("crm.process-guards");
  const scope = globalThis as Record<symbol, unknown>;
  if (scope[flag]) return; // hot reload / import duplo: um único par de handlers
  scope[flag] = true;

  const { reportError } = await import("@/lib/monitoring/error-reporter");
  process.on("unhandledRejection", (reason) => {
    console.error("[process] unhandledRejection:", reason instanceof Error ? reason.stack ?? reason.message : reason);
    void reportError("process.unhandledRejection", reason).catch(() => undefined);
  });
  process.on("uncaughtException", (error) => {
    console.error("[process] uncaughtException:", error.stack ?? error.message);
    void reportError("process.uncaughtException", error).catch(() => undefined);
  });
}
