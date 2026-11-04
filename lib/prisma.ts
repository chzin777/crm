import "server-only";
import { PrismaClient } from "@/generated/prisma/client";
import { createDatabaseUrl } from "@/lib/database-url";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

const createPrismaClient = () => {
  // Native Prisma connection respects @@map/@map directives correctly.
  // The @prisma/adapter-pg driver adapter has a known incompatibility with
  // Better Auth's prisma adapter (P2022 ColumnNotFound "(not available)").
  const url = createDatabaseUrl(process.env);
  return new PrismaClient({ datasourceUrl: url });
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
