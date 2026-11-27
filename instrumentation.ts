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

  // Desligamento gracioso do deploy (docker stop = SIGTERM, 30 s de prazo): o disparo de campanha termina o envio em
  // andamento e fica marcado para a nova instância retomar sozinha. Com NEXT_MANUAL_SIG_HANDLE (Dockerfile) o Next
  // não sai antes disso.
  let closing = false;
  const shutdown = (signal: string) => {
    if (closing) return;
    closing = true;
    console.info(`[process] ${signal}: encerrando disparos de campanha antes de sair`);
    void import("@/lib/campaign-dispatch")
      .then(({ shutdownDispatches }) => shutdownDispatches(SHUTDOWN_DISPATCH_MS))
      .then((campaigns) => { if (campaigns.length) console.info(`[process] ${campaigns.length} disparo(s) marcado(s) para retomar na nova instância`); })
      .catch((error) => console.error("[process] desligamento dos disparos:", error))
      .finally(() => process.exit(0));
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Boot: depois que o servidor estabiliza, retoma os disparos interrompidos pelo deploy/queda (o relógio do chat
  // repete a verificação a cada minuto; a trava no banco garante uma instância por disparo).
  setTimeout(() => {
    void import("@/lib/campaign-dispatch")
      .then(({ listDispatchJobs }) => listDispatchJobs())
      .catch((error) => console.error("[process] retomada automática dos disparos:", error));
  }, BOOT_RESUME_DELAY_MS).unref();
}

/** Espera máxima pelo envio em andamento no SIGTERM (o docker dá 30 s antes de matar o processo). */
const SHUTDOWN_DISPATCH_MS = 20_000;
/** Espera depois do boot antes de retomar disparos (banco, Meta e healthcheck estáveis). */
const BOOT_RESUME_DELAY_MS = 8_000;
