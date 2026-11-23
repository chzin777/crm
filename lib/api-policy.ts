import type { ModuleKey } from "@/lib/permissions";

/**
 * Quais módulos (cargo em /permissoes) liberam cada API que antes só exigia sessão.
 * Sem banco: usado pelas rotas (requireModule) e pelos testes de segurança.
 */
const READ_CONTACT: ModuleKey[] = ["contatos", "chat", "pipelines", "segmentos", "nps", "painel", "campanhas", "automacoes"];
const WRITE_CONTACT: ModuleKey[] = ["contatos", "chat", "pipelines"];
const CAMPAIGN: ModuleKey[] = ["campanhas", "disparos"];

export const API_POLICY = {
  "campaigns/dispatch": { GET: CAMPAIGN, POST: CAMPAIGN },
  contacts: { GET: READ_CONTACT, POST: ["contatos", "chat", "pipelines", "segmentos"] },
  "contacts/search": { GET: READ_CONTACT, POST: READ_CONTACT },
  "contacts/[id]": { GET: READ_CONTACT, PATCH: WRITE_CONTACT },
  "contacts/[id]/communications": { GET: READ_CONTACT },
  "contacts/[id]/marketing": { GET: READ_CONTACT, PATCH: [...WRITE_CONTACT, "campanhas"] },
  "contacts/[id]/opportunity": { GET: READ_CONTACT, POST: WRITE_CONTACT, PATCH: WRITE_CONTACT, DELETE: WRITE_CONTACT },
  "contacts/[id]/prescriptions": { GET: READ_CONTACT, POST: WRITE_CONTACT },
  "contacts/[id]/prescriptions/[prescriptionId]": { GET: READ_CONTACT, PATCH: WRITE_CONTACT, DELETE: WRITE_CONTACT },
  "contacts/[id]/purchases": { GET: READ_CONTACT },
  dashboard: { GET: ["painel", "metricas"] },
  "metrics/campaign": { GET: [...CAMPAIGN, "metricas", "painel"] },
  nps: { GET: ["nps"], POST: ["nps"] },
  "nps/whatsapp": { GET: ["nps"] },
  "pipeline/sync": { POST: ["pipelines"] },
  "segments/audience": { GET: ["segmentos", ...CAMPAIGN, "lojas"], POST: ["segmentos", ...CAMPAIGN, "lojas"] },
  "segments/campaigns": { GET: ["segmentos", ...CAMPAIGN] },
  "segments/import": { POST: ["segmentos", "campanhas"] },
  stores: { POST: ["lojas"], PATCH: ["lojas"], DELETE: ["lojas"] },
  "stores/geocode": { POST: ["lojas"] },
  "whatsapp/bulk-send": { GET: CAMPAIGN, POST: CAMPAIGN },
  "whatsapp/bulk-send/[id]": { GET: CAMPAIGN, PATCH: CAMPAIGN },
  "whatsapp/bulk-send/[id]/retry": { POST: CAMPAIGN },
  "whatsapp/connection": { POST: ["configuracoes"], DELETE: ["configuracoes"] },
  "whatsapp/send": { POST: ["pipelines", "modelos", "contatos", ...CAMPAIGN] },
  "integrations/ecommerce/promotions": { POST: ["configuracoes", "campanhas", "produtos"] },
} as const satisfies Record<string, Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", readonly ModuleKey[]>>>;

export type PolicyRoute = keyof typeof API_POLICY;

/** Módulos que liberam o método; vazio = basta a sessão (leituras usadas por várias telas). */
export function modulesFor(route: PolicyRoute, method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"): ModuleKey[] {
  const entry = API_POLICY[route] as Partial<Record<string, readonly ModuleKey[]>>;
  return [...(entry[method] ?? [])];
}

/** Escrita em /api/crm/[resource] (dados do workspace): cada lista só por quem tem o módulo dela. */
export const CRM_RESOURCE_WRITE: Record<string, ModuleKey[]> = {
  // Telas que gravam cada lista: /segmentos, /campanhas e /contatos (segmentos); /campanhas e /segmentos (campanhas).
  segments: ["segmentos", "campanhas", "disparos", "contatos"],
  campaigns: ["campanhas", "disparos", "segmentos"],
  pipeline: ["pipelines"],
  "pipeline-stages": ["pipelines"],
  "pipeline-dismissed": ["pipelines"],
  settings: ["configuracoes"],
  criteria: ["pontuacao", "segmentos", "campanhas", "disparos"],
  nps: ["nps"],
};

/** Usuário com acesso a algum dos módulos (lista vazia = só sessão). */
export const allowsAny = (access: Partial<Record<ModuleKey, boolean>>, modules: readonly ModuleKey[]) =>
  modules.length === 0 || modules.some((module) => access[module] === true);
