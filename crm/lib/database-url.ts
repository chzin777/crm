/**
 * Builds the connection URL from DB_* variables. With `direct`, DIRECT_DB_HOST / DIRECT_DB_PORT
 * (the real PostgreSQL, bypassing PgBouncer) take precedence; they are needed for schema changes.
 */
export function createDatabaseUrl(environment: NodeJS.ProcessEnv, options: { direct?: boolean } = {}): string {
  if (options.direct && (environment.DIRECT_DB_HOST || environment.DIRECT_DB_PORT)) {
    environment = {
      ...environment,
      DB_HOST: environment.DIRECT_DB_HOST || environment.DB_HOST,
      DB_PORT: environment.DIRECT_DB_PORT || environment.DB_PORT,
    };
  }
  const required = ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD"] as const;
  const missing = required.filter((key) => !environment[key]);
  if (missing.length) {
    throw new Error(`Database configuration is incomplete. Set: ${missing.join(", ")}.`);
  }

  const port = Number(environment.DB_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("DB_PORT must be a valid TCP port.");
  }

  const url = new URL("postgresql://localhost");
  url.hostname = environment.DB_HOST!;
  url.port = String(port);
  url.username = environment.DB_USER!;
  url.password = environment.DB_PASSWORD!;
  url.pathname = `/${environment.DB_NAME!}`;
  url.searchParams.set("schema", "public");
  return url.toString();
}
