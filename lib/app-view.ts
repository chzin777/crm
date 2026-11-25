import { isAdminRole } from "@/lib/permissions";

/**
 * Visão do app de celular, definida em Permissões (cargo):
 * - admin: cargo admin ou "Visão geral" → app completo e vendas/metas de todas as lojas;
 * - gerente: "Visão de gerente" → vendas, vendedores e metas das lojas do usuário (cadastro em Usuários) e lança metas;
 * - vendedor: sem nenhuma das duas → só as próprias vendas e a própria meta (vendedor do VMSet ligado ao usuário).
 */
export const APP_VIEW_CAPABILITIES = [
  { key: "app.visaoGeral", label: "Visão geral no app", description: "Vendas e metas de todas as lojas (como administrador)" },
  { key: "app.visaoGerente", label: "Visão de gerente no app", description: "Vendas, vendedores e metas das lojas do usuário; lança metas" },
] as const;

export type AppView = "admin" | "gerente" | "vendedor";

export function resolveAppView(role: string | null | undefined, permissions: unknown): AppView {
  if (isAdminRole(role)) return "admin";
  const stored = typeof permissions === "object" && permissions !== null && !Array.isArray(permissions) ? (permissions as Record<string, unknown>) : {};
  if (stored["app.visaoGeral"] === true) return "admin";
  if (stored["app.visaoGerente"] === true) return "gerente";
  return "vendedor";
}
