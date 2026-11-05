export const MODULES = [
  { key: "painel", label: "Painel", href: "/painel", group: "Geral" },
  { key: "pipelines", label: "Pipelines", href: "/", group: "Vendas" },
  { key: "contatos", label: "Contatos & Clientes", href: "/contatos", group: "Vendas" },
  { key: "segmentos", label: "Segmentos", href: "/segmentos", group: "Vendas" },
  { key: "campanhas", label: "Campanhas", href: "/campanhas", group: "Marketing" },
  { key: "modelos", label: "Modelos WhatsApp", href: "/modelos", group: "Marketing" },
  { key: "nps", label: "Pesquisas NPS", href: "/nps", group: "Marketing" },
  { key: "lojas", label: "Lojas", href: "/lojas", group: "Gestão" },
  { key: "usuarios", label: "Usuários", href: "/usuarios", group: "Gestão" },
  { key: "cargos", label: "Cargos", href: "/cargos", group: "Gestão" },
  { key: "permissoes", label: "Permissões", href: "/permissoes", group: "Gestão" },
  { key: "chat", label: "Atendimento", href: "/chat", group: "Vendas" },
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

export function moduleForPath(pathname: string): ModuleKey | null {
  const match = MODULES.find((module) => (module.href === "/" ? pathname === "/" : pathname === module.href || pathname.startsWith(`${module.href}/`)));
  return match?.key ?? null;
}
