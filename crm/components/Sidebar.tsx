"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { authClient } from "@/lib/auth-client";
import {
  Kanban,
  LayoutDashboard,
  Users,
  Tags,
  Store,
  MessageSquare,
  FileText,
  Award,
  UserCog,
  Settings,
  ChevronDown,
  Megaphone,
  LogOut,
  User as UserIcon,
  Shield,
} from "lucide-react";

export function Sidebar({ collapsed }: { collapsed?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const isCollapsed = collapsed ?? false;
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const { data: session } = authClient.useSession();

  const userName = session?.user?.name ?? "Usuário";
  const userEmail = session?.user?.email ?? "";
  const userInitials = userName
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    }
    if (isProfileMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isProfileMenuOpen]);

  async function handleLogout() {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push("/login");
        },
      },
    });
  }

  const menuItems = [
    { title: "Painel", href: "/painel", icon: LayoutDashboard },
    { title: "Pipelines", href: "/", icon: Kanban },
    { title: "Contatos & Clientes", href: "/contatos", icon: Users },
    { title: "Segmentos", href: "/segmentos", icon: Tags },
    { title: "Lojas", href: "/lojas", icon: Store },
    { title: "Campanhas", href: "/campanhas", icon: MessageSquare },
    { title: "Modelos WhatsApp", href: "/modelos", icon: FileText },
    { title: "Pesquisas NPS", href: "/nps", icon: Award },
    { title: "Usuários", href: "/usuarios", icon: UserCog },
    { title: "Cargos", href: "/cargos", icon: Shield },
    { title: "Configurações", href: "/configuracoes", icon: Settings },
  ];

  const byHref = (href: string) => menuItems.find((item) => item.href === href)!;

  const navGroups = [
    { id: "vendas", label: "Vendas", icon: Kanban, items: [byHref("/"), byHref("/contatos"), byHref("/segmentos")] },
    { id: "marketing", label: "Marketing", icon: Megaphone, items: [byHref("/campanhas"), byHref("/modelos"), byHref("/nps")] },
    { id: "gestao", label: "Gestão", icon: Store, items: [byHref("/lojas"), byHref("/usuarios"), byHref("/cargos")] },
  ];

  const activeGroupId = navGroups.find((group) => group.items.some((item) => item.href === pathname))?.id;
  const isGroupExpanded = (id: string) => expandedGroups[id] ?? id === activeGroupId;
  const toggleGroup = (id: string) => setExpandedGroups((groups) => ({ ...groups, [id]: !isGroupExpanded(id) }));

  return (
    <aside
      className={`sticky top-4 relative z-30 hidden h-[calc(100vh-2rem)] shrink-0 flex-col overflow-visible rounded-2xl border border-[#e2e6ee] bg-white shadow-sm transition-[width] duration-200 ease-out lg:flex dark:border-slate-800 dark:bg-[#051647] ${isCollapsed ? "w-20" : "w-64"}`}
    >
      <div className="flex h-full flex-col text-[#47536a] dark:text-slate-300">
        {/* Header da logo — igual ao ecommerce */}
        <div className={`relative z-10 flex h-24 shrink-0 items-center justify-center border-b border-[#e2e6ee] dark:border-slate-800 ${isCollapsed ? "px-0" : "px-5"}`}>
          {isCollapsed ? (
            <img src="/logos/logo-no-text.png" alt="Óticas Brasil" className="h-20 w-20 rounded-full object-contain" />
          ) : (
            <img src="/logos/admin-logo.png" alt="Óticas Brasil" className="h-[180px] w-auto object-contain" />
          )}
        </div>

        {!isCollapsed && (
          <div className="px-5 pb-2 pt-6 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#a0a8b6] dark:text-slate-500">Workspace</div>
        )}

        <nav aria-label="Navegação principal" className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {/* Painel (overview) */}
          {(() => {
            const item = byHref("/painel");
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                href={item.href}
                title={isCollapsed ? item.title : undefined}
                aria-label={isCollapsed ? item.title : undefined}
                className={`group flex w-full items-center rounded-lg py-2.5 text-[13px] font-medium transition-colors cursor-pointer hover:cursor-pointer ${
                  isCollapsed ? "justify-center px-0" : "gap-3 px-3"
                } ${
                  isActive ? "bg-[#f1f3f8] text-[#142344] dark:bg-white/10 dark:text-white" : "text-[#68748a] hover:bg-[#f7f8fa] hover:text-[#142344] dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"
                }`}
              >
                <Icon className={`h-[19px] w-[19px] shrink-0 ${isActive ? "text-[#4156b8] dark:text-[#C4D600]" : "text-[#8992a4] group-hover:text-[#58657c] dark:text-slate-500 dark:group-hover:text-slate-300"}`} />
                <span className={`truncate transition-opacity duration-200 ${isCollapsed ? "w-0 opacity-0" : "opacity-100"}`}>{item.title}</span>
              </Link>
            );
          })()}

          {/* Grupos de navegação */}
          {navGroups.map((group) => {
            const expanded = isGroupExpanded(group.id);
            const groupActive = group.items.some((item) => item.href === pathname);
            const GroupIcon = group.icon;
            return (
              <div key={group.id} className="pt-1">
                <button
                  type="button"
                  aria-expanded={expanded}
                  title={isCollapsed ? group.label : undefined}
                  onClick={() => toggleGroup(group.id)}
                  className={`group flex w-full items-center justify-start rounded-lg py-2.5 text-[13px] font-medium transition-colors cursor-pointer hover:cursor-pointer ${
                    isCollapsed ? "justify-center px-0" : "gap-3 px-3"
                  } ${
                    groupActive ? "text-[#142344] dark:text-white" : "text-[#68748a] hover:bg-[#f7f8fa] hover:text-[#142344] dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"
                  }`}
                >
                  <GroupIcon className={`h-[19px] w-[19px] shrink-0 ${groupActive ? "text-[#4156b8] dark:text-[#C4D600]" : "text-[#8992a4] group-hover:text-[#58657c] dark:text-slate-500 dark:group-hover:text-slate-300"}`} />
                  <span className={`truncate text-left transition-[opacity,width,flex] duration-200 ${isCollapsed ? "w-0 flex-none overflow-hidden opacity-0" : "min-w-0 flex-1 opacity-100"}`}>{group.label}</span>
                  <ChevronDown className={`h-[17px] w-[17px] text-[#929bad] transition-[transform,opacity,width] duration-200 ${expanded ? "rotate-180" : ""} ${isCollapsed ? "w-0 overflow-hidden opacity-0" : "opacity-100"}`} />
                </button>
                {!isCollapsed && (
                  <div
                    aria-hidden={!expanded}
                    className={`grid transition-[grid-template-rows] duration-300 ease-in-out motion-reduce:transition-none ${
                      expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                    }`}
                  >
                    <div className="min-h-0 overflow-hidden">
                      <div className={`ml-8 transition-[opacity,transform,margin] duration-200 ease-out motion-reduce:transition-none ${
                        expanded ? "mt-0.5 translate-y-0 pb-0 opacity-100" : "-translate-y-1 pb-0 opacity-0"
                      }`}>
                        <div className="relative space-y-0.5">
                          <span aria-hidden="true" className="pointer-events-none absolute bottom-[18px] left-0 top-[18px] border-l border-[#d8dee8] dark:border-slate-700" />
                          {group.items.map((item) => {
                            const Icon = item.icon;
                            const itemActive = pathname === item.href;
                            return (
                              <div key={item.href} className="relative pl-3">
                                <span
                                  aria-hidden="true"
                                  className="pointer-events-none absolute -left-0 top-[calc(50%-8px)] h-2 w-3 rounded-bl-[7px] border-b border-l border-[#d8dee8] dark:border-slate-700"
                                />
                                <Link
                                  href={item.href}
                                  className={`flex w-full items-center rounded-lg px-3 py-2 text-[12px] text-left font-medium transition-colors duration-150 cursor-pointer hover:cursor-pointer ${
                                    itemActive
                                      ? "bg-[#f1f3f8] text-[#34415e] dark:bg-white/10 dark:text-white"
                                      : "text-[#818b9d] hover:bg-[#f7f8fa] hover:text-[#34415e] dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"
                                  }`}
                                >
                                  {item.title}
                                </Link>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Configurações */}
          {(() => {
            const item = byHref("/configuracoes");
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                href={item.href}
                title={isCollapsed ? item.title : undefined}
                aria-label={isCollapsed ? item.title : undefined}
                className={`group mt-1 flex w-full items-center rounded-lg py-2.5 text-[13px] font-medium transition-colors cursor-pointer hover:cursor-pointer ${
                  isCollapsed ? "justify-center px-0" : "gap-3 px-3"
                } ${
                  isActive ? "bg-[#f1f3f8] text-[#142344] dark:bg-white/10 dark:text-white" : "text-[#68748a] hover:bg-[#f7f8fa] hover:text-[#142344] dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"
                }`}
              >
                <Icon className={`h-[19px] w-[19px] shrink-0 ${isActive ? "text-[#4156b8] dark:text-[#C4D600]" : "text-[#8992a4] group-hover:text-[#58657c] dark:text-slate-500 dark:group-hover:text-slate-300"}`} />
                <span className={`truncate transition-opacity duration-200 ${isCollapsed ? "w-0 opacity-0" : "opacity-100"}`}>{item.title}</span>
              </Link>
            );
          })()}
        </nav>

        {/* Footer: perfil + ver site */}
        <div className={`border-t border-[#e2e6ee] p-4 dark:border-slate-800 ${isCollapsed ? "space-y-3" : "space-y-2"}`}>
          <div ref={profileMenuRef} className="relative">
            {isProfileMenuOpen && (
              <div
                role="menu"
                aria-label="Menu do usuário"
                className={`absolute z-40 mb-2 min-w-[200px] rounded-xl border border-[#e5e8ee] bg-white p-1.5 shadow-[0_8px_24px_rgba(20,35,68,0.14)] dark:border-slate-700 dark:bg-[#07194f] ${
                  isCollapsed ? "bottom-0 left-full ml-2" : "bottom-full left-0 right-0"
                }`}
              >
                <div className="px-3 py-2">
                  <p className="truncate text-[12px] font-bold text-[#34415e] dark:text-white">{userName}</p>
                  <p className="truncate text-[11px] text-[#929bad] dark:text-slate-400">{userEmail}</p>
                </div>
                <div className="my-1 border-t border-[#edf0f5] dark:border-slate-700" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    router.push("/perfil");
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12px] text-left font-medium text-[#47536a] transition hover:cursor-pointer hover:bg-[#f5f7fb] hover:text-[#142344] dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  <UserIcon className="h-[17px] w-[17px] text-[#8992a4]" />
                  Meu Perfil
                </button>
                <div className="my-1 border-t border-[#edf0f5] dark:border-slate-700" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12px] text-left font-medium text-[#b54747] transition hover:cursor-pointer hover:bg-red-50 dark:hover:bg-red-950/30"
                >
                  <LogOut className="h-[17px] w-[17px]" />
                  Sair
                </button>
              </div>
            )}
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={isProfileMenuOpen}
              title={isCollapsed ? userName : undefined}
              onClick={() => setIsProfileMenuOpen((open) => !open)}
              className={`flex w-full items-center rounded-lg px-2 py-2 transition hover:cursor-pointer hover:bg-[#f7f8fa] dark:hover:bg-white/5 ${
                isCollapsed ? "justify-center" : "gap-3 text-left"
              }`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#061748] text-xs font-bold text-white dark:bg-[#C4D600] dark:text-[#051647]">
                {userInitials}
              </span>
              {!isCollapsed && (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-bold text-[#34415e] leading-tight dark:text-white">{userName}</span>
                    <span className="block truncate text-[11px] text-[#929bad] dark:text-slate-400">{userEmail}</span>
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}