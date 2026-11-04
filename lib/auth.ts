import "server-only";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { Resend } from "resend";
import { createDatabaseUrl } from "@/lib/database-url";

async function sendResetEmail(to: string, url: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) throw new Error("RESEND_API_KEY e RESEND_FROM devem estar configurados para enviar e-mails.");
  const { error } = await new Resend(apiKey).emails.send({
    from,
    to,
    subject: "Redefinição de senha - CRM Óticas Brasil",
    html: `<p>Recebemos um pedido para redefinir a senha da sua conta no CRM Óticas Brasil.</p><p><a href="${url}">Clique aqui para criar uma nova senha</a>. O link vale por 1 hora.</p><p>Se você não fez esse pedido, ignore este e-mail.</p>`,
  });
  if (error) throw new Error(error.message);
}

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
  database: createDatabaseUrl(process.env),
  session: {
    expiresIn: 60 * 60 * 24, // 24 hours in seconds
    updateAge: 60 * 60 * 24, // refresh only at the end of the 24h window (no sliding expiry)
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    sendResetPassword: async ({ user, url }) => {
      // Sem await: evita revelar por tempo de resposta se o e-mail existe.
      void sendResetEmail(user.email, url).catch((error) => console.error("[auth] enviar e-mail de redefinição:", error));
    },
  },
  user: {
    additionalFields: {
      jobTitle: { type: "string", required: false },
      teamLevel: { type: "string", required: false, defaultValue: "Operador" },
      roleId: { type: "string", required: false },
    },
  },
  plugins: [admin()],
});
