import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { allowsAny, API_POLICY, CRM_RESOURCE_WRITE, modulesFor } from "@/lib/api-policy";
import { resolveAccess } from "@/lib/permissions";

// ---- Sessão e banco simulados para as guardas reais de lib/api-auth ----
const state = vi.hoisted(() => ({
  session: null as null | { user: { id: string; mustChangePassword?: boolean; banned?: boolean } },
  user: null as null | { role: string | null; banned: boolean; roleRef: { permissions: unknown } | null },
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: async () => state.session } } }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: async () => state.user } } }));

const { forbidUnless, requireApiSession, requireSessionOrSyncToken } = await import("@/lib/api-auth");

/** Cargo com só estes módulos ligados. */
const roleWith = (...modules: string[]) => ({ role: "user", banned: false, roleRef: { permissions: Object.fromEntries(modules.map((key) => [key, true])) } });

beforeEach(() => {
  state.session = { user: { id: "u1" } };
  state.user = roleWith("chat");
  delete process.env.SYNC_API_TOKEN;
});

describe("sessão", () => {
  it("sem sessão: 401 em rota protegida", async () => {
    state.session = null;
    expect((await forbidUnless("campaigns/dispatch", "POST"))?.status).toBe(401);
  });

  it("senha provisória (mustChangePassword) não acessa nenhuma API de negócio", async () => {
    state.session = { user: { id: "u1", mustChangePassword: true } };
    expect(await requireApiSession()).toBeNull();
    expect((await forbidUnless("contacts", "GET"))?.status).toBe(401);
  });

  it("usuário bloqueado (inativo) perde o acesso na hora, mesmo com sessão aberta", async () => {
    state.session = { user: { id: "u1", banned: true } };
    expect(await requireApiSession()).toBeNull();
    state.session = { user: { id: "u1" } };
    state.user = { ...roleWith("campanhas"), banned: true };
    expect((await forbidUnless("campaigns/dispatch", "POST"))?.status).toBe(403);
  });
});

describe("controle de acesso por cargo (RBAC)", () => {
  it("operador só de atendimento não dispara campanha, envio em massa nem importa planilha", async () => {
    for (const [route, method] of [["campaigns/dispatch", "POST"], ["whatsapp/bulk-send", "POST"], ["segments/import", "POST"], ["whatsapp/connection", "DELETE"], ["stores", "DELETE"]] as const) {
      expect((await forbidUnless(route, method))?.status, `${method} ${route}`).toBe(403);
    }
  });

  it("operador de atendimento continua lendo e editando o contato do /chat", async () => {
    expect(await forbidUnless("contacts/[id]", "GET")).toBeNull();
    expect(await forbidUnless("contacts/[id]", "PATCH")).toBeNull();
    expect(await forbidUnless("contacts/[id]/prescriptions", "POST")).toBeNull();
  });

  it("quem tem o módulo de campanhas dispara; administrador acessa tudo", async () => {
    state.user = roleWith("campanhas");
    expect(await forbidUnless("campaigns/dispatch", "POST")).toBeNull();
    state.user = { role: "admin", banned: false, roleRef: null };
    expect(await forbidUnless("whatsapp/connection", "DELETE")).toBeNull();
  });

  it("gravar configurações e campanhas do workspace exige o módulo da lista", () => {
    const chatOnly = resolveAccess("user", { chat: true });
    expect(allowsAny(chatOnly, CRM_RESOURCE_WRITE.settings)).toBe(false);
    expect(allowsAny(chatOnly, CRM_RESOURCE_WRITE.campaigns)).toBe(false);
    expect(allowsAny(resolveAccess("user", { configuracoes: true }), CRM_RESOURCE_WRITE.settings)).toBe(true);
    expect(allowsAny(resolveAccess("admin", null), CRM_RESOURCE_WRITE.pipeline)).toBe(true);
  });

  it("importação de contatos/lojas por sessão exige o módulo (token de serviço segue aceito)", async () => {
    const request = new Request("http://crm/api/contacts/sync", { method: "POST" });
    expect((await requireSessionOrSyncToken(request, ["contatos"]))?.status).toBe(403);
    process.env.SYNC_API_TOKEN = "token-de-servico-com-32-caracteres";
    const service = new Request("http://crm/api/contacts/sync", { method: "POST", headers: { authorization: "Bearer token-de-servico-com-32-caracteres" } });
    state.session = null;
    expect(await requireSessionOrSyncToken(service, ["contatos"])).toBeNull();
  });

  it("toda rota protegida pela tabela tem módulos definidos para os métodos usados", () => {
    expect(modulesFor("campaigns/dispatch", "POST")).toEqual(["campanhas", "disparos"]);
    expect(modulesFor("stores", "GET")).toEqual([]);
  });
});

// ---- Varredura estática das rotas ----
const API_DIR = join(process.cwd(), "app", "api");
const routeFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? routeFiles(path) : name === "route.ts" ? [path] : [];
  });
const relative = (path: string) => path.slice(API_DIR.length + 1).replace(/\\/g, "/").replace(/\/route\.ts$/, "");

/** Rotas públicas de propósito, cada uma com a própria proteção (assinatura, token ou rota desativada). */
const PUBLIC_ROUTES: Record<string, RegExp> = {
  "whatsapp/webhook": /x-hub-signature-256/,
  "chat/clock": /timingSafeEqual/,
  "automations/webhook/[id]": /timingSafeEqual/,
  "webhooks/automacoes/[token]": /token\.length >= 16/,
  "integrations/ecommerce/events": /INTEGRATION_SHARED_SECRET/,
  "db/refresh-materialized-view": /process\.env\.SYNC_API_TOKEN;/,
  "sync/incremental": /status: 410/,
  "webhook/evolution": /status: 410/,
};
const GUARD = /requireApiSession|requireModule|requireChatActor|forbidUnless|requireSessionOrSyncToken|getAuthSession|require[A-Z]\w*\(/;

describe("varredura das rotas da API", () => {
  const files = routeFiles(API_DIR);

  it("nenhuma rota privada sem verificação de sessão/permissão", () => {
    const exposed = files.filter((file) => {
      const name = relative(file);
      const source = readFileSync(file, "utf8");
      if (name.startsWith("auth/")) return false; // Better Auth (login, sessão)
      const publicCheck = PUBLIC_ROUTES[name];
      return publicCheck ? !publicCheck.test(source) : !GUARD.test(source);
    });
    expect(exposed.map(relative)).toEqual([]);
  });

  it("rotas públicas não aceitam segredo padrão escrito no código", () => {
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, relative(file)).not.toMatch(/process\.env\.\w*(TOKEN|SECRET|KEY)\w*\s*\|\|\s*["'`]/);
      expect(source, relative(file)).not.toContain("vmset-sync-token-2026");
    }
  });

  it("toda rota que usa forbidUnless está na tabela de políticas com o método certo", () => {
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/forbidUnless\("([^"]+)", "(\w+)"\)/g)) {
        expect(Object.keys(API_POLICY), relative(file)).toContain(match[1]);
        expect(match[1]).toBe(relative(file));
        expect(modulesFor(match[1] as keyof typeof API_POLICY, match[2] as "GET").length, `${match[2]} ${match[1]}`).toBeGreaterThan(0);
        expect(source).toContain(`export async function ${match[2]}(`);
      }
    }
  });
});
