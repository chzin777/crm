import "server-only";
import { PrismaClient } from "@/generated/prisma/client";
import { createDatabaseUrl } from "@/lib/database-url";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

const createPrismaClient = () => {
  // Conexão nativa do Prisma: respeita @@map/@map corretamente.
  // O @prisma/adapter-pg v7.x tem incompatibilidade conhecida com o
  // prismaAdapter do Better Auth (P2022 ColumnNotFound "(not available)").
  // Prisma v7 com output customizado exige DATABASE_URL como env var.
  process.env.DATABASE_URL = createDatabaseUrl(process.env);
  return new PrismaClient();
};

let instance: PrismaClient | undefined;

const getPrisma = () => {
  instance ??= globalForPrisma.prisma ?? createPrismaClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = instance;
  }
  return instance;
};

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrisma();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
