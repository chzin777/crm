import "dotenv/config";
import { defineConfig } from "prisma/config";
import { createDatabaseUrl } from "./lib/database-url";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: createDatabaseUrl(process.env, { direct: true }),
  },
});
