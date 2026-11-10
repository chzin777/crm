export const MODULES = [
  { key: "painel", label: "Painel", href: "/painel", group: "Geral" },
  { key: "pipelines", label: "Pipelines", href: "/", group: "Vendas" },
  { key: "contatos", label: "Contatos & Clientes", href: "/contatos", group: "Vendas" },
  { key: "segmentos", label: "Segmentos", href: "/segmentos", group: "Vendas" },
  { key: "campanhas", label: "Campanhas", href: "/campanhas", group: "Marketing" },
  { key: "disparos", label: "Disparos pelo pipeline", href: "/campanhas", group: "Marketing" },
  { key: "modelos", label: "Modelos WhatsApp", href: "/modelos", group: "Marketing" },
  { key: "nps", label: "Pesquisas NPS", href: "/nps", group: "Marketing" },
  { key: "lojas", label: "Lojas", href: "/lojas", group: "Gestão" },
  { key: "usuarios", label: "Usuários", href: "/usuarios", group: "Gestão" },
  { key: "cargos", label: "Cargos", href: "/cargos", group: "Gestão" },
  { key: "permissoes", label: "Permissões", href: "/permissoes", group: "Gestão" },
  { key: "chat", label: "Atendimento", href: "/chat", group: "Vendas" },
  { key: "filas", label: "Filas de Atendimento", href: "/filas", group: "Vendas" },
  { key: "metricas", label: "Métricas de Atendimento", href: "/metricas-atendimento", group: "Vendas" },
  { key: "configuracoes", label: "Configurações", href: "/configuracoes", group: "Geral" },
] as const;

export type ModuleKey = (typeof MODULES)[number]["key"];
export type ModuleAccess = Record<ModuleKey, boolean>;

export const isAdminRole = (role: string | null | undefined) => (role ?? "").split(",").map((item) => item.trim()).includes("admin");

export function resolveAccess(role: string | null | undefined, permissions: unknown): ModuleAccess {
  const stored = typeof permissions === "object" && permissions !== null && !Array.isArray(permissions) ? (permissions as Record<string, unknown>) : {};
  const admin = isAdminRole(role);
  return Object.fromEntries(MODULES.map((module) => [module.key, admin || stored[module.key] === true])) as ModuleAccess;
}

export const CHAT_CAPABILITIES = [
  { key: "chat.viewAll", label: "Ver todas as conversas", description: "Supervisão de todas as filas" },
  { key: "chat.assume", label: "Assumir e responder", description: "Assumir conversas e escrever ao cliente" },
  { key: "chat.transfer", label: "Transferir", description: "Passar conversas para outra fila ou pessoa" },
  { key: "chat.close", label: "Encerrar", description: "Encerrar e reabrir conversas" },
  { key: "chat.queues", label: "Gerenciar filas", description: "Filas, equipe, menu e respostas prontas" },
] as const;

export type ChatCapability = (typeof CHAT_CAPABILITIES)[number]["key"];
export type ChatCapabilities = Record<ChatCapability, boolean>;

export function resolveChatCapabilities(role: string | null | undefined, permissions: unknown): ChatCapabilities {
  const stored = typeof permissions === "object" && permissions !== null && !Array.isArray(permissions) ? (permissions as Record<string, unknown>) : {};
  const admin = isAdminRole(role);
  return Object.fromEntries(CHAT_CAPABILITIES.map((capability) => [capability.key, admin || stored[capability.key] === true])) as ChatCapabilities;
}

/** /campanhas é a tela única de disparos: quem tem campanhas ou disparos pelo pipeline abre a tela. */
export function canAccessModule(key: ModuleKey | null, modules: Partial<ModuleAccess> | null | undefined): boolean {
  if (key === null) return true;
  if (modules?.[key] === true) return true;
  return key === "campanhas" && modules?.disparos === true;
}

export function moduleForPath(pathname: string): ModuleKey | null {
  const match = MODULES.find((module) => (module.href === "/" ? pathname === "/" : pathname === module.href || pathname.startsWith(`${module.href}/`)));
  return match?.key ?? null;
}
