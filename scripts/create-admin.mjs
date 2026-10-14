import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";

const required = ["INITIAL_ADMIN_NAME", "INITIAL_ADMIN_EMAIL", "INITIAL_ADMIN_PASSWORD"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  throw new Error(`Set ${missing.join(", ")} in .env before creating the initial administrator.`);
}
if (process.env.INITIAL_ADMIN_PASSWORD.length < 12) {
  throw new Error("INITIAL_ADMIN_PASSWORD must be at least 12 characters.");
}

const connectionUrl = new URL("postgresql://localhost");
connectionUrl.hostname = process.env.DB_HOST;
connectionUrl.port = process.env.DB_PORT;
connectionUrl.username = process.env.DB_USER;
connectionUrl.password = process.env.DB_PASSWORD;
connectionUrl.pathname = `/${process.env.DB_NAME}`;
connectionUrl.searchParams.set("schema", "public");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: connectionUrl.toString() }),
});

try {
  if (await prisma.user.count()) {
    throw new Error("Users already exist. Initial administrator setup is restricted to an empty user table.");
  }

  const id = randomUUID();
  const password = await hashPassword(process.env.INITIAL_ADMIN_PASSWORD);
  await prisma.user.create({
    data: {
      id,
      name: process.env.INITIAL_ADMIN_NAME.trim(),
      email: process.env.INITIAL_ADMIN_EMAIL.trim().toLocaleLowerCase("pt-BR"),
      emailVerified: true,
      role: "admin",
      accounts: {
        create: {
          id: randomUUID(),
          accountId: id,
          providerId: "credential",
          password,
        },
      },
    },
  });
  console.log("Initial administrator created. Remove INITIAL_ADMIN_PASSWORD from .env after confirming sign-in.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Failed to create the initial administrator.");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
