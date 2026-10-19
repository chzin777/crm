import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { createDatabaseUrl } from "@/lib/database-url";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

const createPrismaClient = () => {
  const max = Number(process.env.DB_POOL_MAX);
  // Behind PgBouncer each app instance only needs a small pool; the bouncer multiplexes into the real connections.
  const adapter = new PrismaPg({
    connectionString: createDatabaseUrl(process.env),
    max: Number.isInteger(max) && max > 0 ? max : 10,
  });
  return new PrismaClient({ adapter });
};

let instance: PrismaClient | undefined;

const getPrisma = () => {
  instance ??= globalForPrisma.prisma ?? createPrismaClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = instance;
  }
  return instance;
};

// Lazy proxy: the client (and DB env validation) is only created on first use, so builds without DB vars succeed.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrisma();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
