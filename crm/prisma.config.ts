import "dotenv/config";
import { defineConfig } from "prisma/config";
import { createDatabaseUrl } from "./lib/database-url";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // `prisma generate` (e.g. Vercel build) doesn't connect, so env vars may be absent.
    url: process.env.DB_HOST
      ? createDatabaseUrl(process.env, { direct: true })
      : "postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public",
  },
});
