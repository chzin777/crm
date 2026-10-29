import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  VMSET_DB_HOST: z.string().min(1),
  VMSET_DB_PORT: z.coerce.number().int().positive().default(5432),
  VMSET_DB_NAME: z.string().min(1),
  VMSET_DB_USER: z.string().min(1),
  VMSET_DB_PASSWORD: z.string(),
  REDIS_URL: z.string().url().optional(),
  CACHE_TTL_SECONDS: z.coerce.number().int().nonnegative().default(60),
  API_KEY: z.string().min(8, "API_KEY must be at least 8 characters"),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment configuration:");
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}