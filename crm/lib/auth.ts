import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { admin } from "better-auth/plugins";
import { prisma } from "@/lib/prisma";

const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
// Build-time page data collection imports this module without runtime secrets; validation stays strict at runtime.
const secret = process.env.BETTER_AUTH_SECRET || (isBuildPhase ? "build-phase-placeholder-secret-not-for-runtime" : undefined);
if (!secret || secret.length < 32) {
  throw new Error("BETTER_AUTH_SECRET must be configured with at least 32 characters.");
}

export const auth = betterAuth({
  appName: "Óticas Brasil CRM",
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  trustedOrigins: ["https://crm.oticasbrasil.com.br"],
  secret,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  session: {
    expiresIn: 60 * 60 * 24, // 24 hours in seconds
    updateAge: 60 * 60 * 24, // refresh only at the end of the 24h window (no sliding expiry)
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
  },
  user: {
    additionalFields: {
      jobTitle: { type: "string", required: false },
      teamLevel: { type: "string", required: false, defaultValue: "Operador" },
    },
  },
  plugins: [admin()],
});
