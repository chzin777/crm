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
  Award,
  UserCog,
  Settings,
  ChevronRight,
  LogOut,
  User as UserIcon,
  MoreVertical,
} from "lucide-react";

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
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
    {
      title: "Painel",
      href: "/painel",
      icon: LayoutDashboard,
    },
    {
      title: "Pipelines",
      href: "/",
      icon: Kanban,
    },
    {
      title: "Contatos & Clientes",
      href: "/contatos",
      icon: Users,
    },
    {
      title: "Segmentos",
      href: "/segmentos",
      icon: Tags,
    },
    {
      title: "Lojas",
      href: "/lojas",
      icon: Store,
    },
    {
      title: "Campanhas",
      href: "/campanhas",
      icon: MessageSquare,
    },
    {
      title: "Pesquisas NPS",
      href: "/nps",
      icon: Award,
    },
    {
      title: "Usuários",
      href: "/usuarios",
      icon: UserCog,
    },
    {
      title: "Configurações",
      href: "/configuracoes",
      icon: Settings,
    },
  ];

  return (
    <aside className={`relative sticky top-4 my-4 ml-4 h-[calc(100vh-2rem)] shrink-0 rounded-2xl border border-slate-200 bg-white shadow-sm transition-[width,background-color] duration-200 ease-out dark:border-slate-800 dark:bg-[#051647] flex flex-col ${isCollapsed ? "w-20" : "w-64"}`}>
      {/* Topo da Sidebar com Logo Oficial */}
      <div className={`h-28 flex items-center border-b border-slate-200 dark:border-slate-800/80 ${isCollapsed ? "justify-center px-0" : "px-5"}`}>
        <Link href="/" aria-label="Óticas Brasil" className="flex items-center gap-2.5 cursor-pointer hover:cursor-pointer">
          {isCollapsed ? (
            <span className="grid h-14 w-14 place-items-center rounded-full bg-[#051647] text-base font-bold text-white dark:bg-[#C4D600] dark:text-[#051647]">OB</span>
          ) : (
            <>
              <img
                src="/logos/logo-login-oticas-brasil-light.png"
                alt="Óticas Brasil"
                className="h-16 w-auto object-contain dark:hidden"
              />
              <img
                src="/logos/logo-login-oticas-brasil.png"
                alt="Óticas Brasil"
                className="hidden h-16 w-auto object-contain dark:block"
              />
            </>
          )}
        </Link>
      </div>

      {/* Navegação */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
        {!isCollapsed && (
          <div className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">
            Marketing & Vendas
          </div>
        )}
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              aria-label={isCollapsed ? item.title : undefined}
              title={isCollapsed ? item.title : undefined}
              className={`group relative flex items-center rounded-xl py-2.5 text-sm font-semibold transition-colors duration-200 ease-out cursor-pointer hover:cursor-pointer ${isCollapsed ? "justify-center px-0" : "gap-3 px-3"} ${
                isActive
                  ? "text-white dark:text-[#051647]"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              {isActive && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#051647]/90 to-[#002187]/80 shadow-lg shadow-blue-900/30 dark:from-[#C4D600]/90 dark:to-[#C4D600]/80 dark:shadow-[#C4D600]/20"
                />
              )}
              <Icon className={`relative z-10 w-4 h-4 shrink-0 ${isActive ? "text-[#C4D600] dark:text-[#051647]" : "text-slate-400 dark:text-slate-400"}`} />
              {!isCollapsed && <span className="relative z-10">{item.title}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Rodapé da Sidebar com Card de Perfil */}
      <div className="relative p-4 border-t border-slate-200 dark:border-slate-800/80" ref={profileMenuRef}>
        <button
          type="button"
          onClick={() => setIsProfileMenuOpen((prev) => !prev)}
          className={`w-full flex items-center p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors cursor-pointer ${isCollapsed ? "justify-center" : "gap-3"}`}
          aria-haspopup="true"
          aria-expanded={isProfileMenuOpen}
          title={isCollapsed ? userName : undefined}
        >
          <div className="w-9 h-9 rounded-full bg-[#051647] dark:bg-[#C4D600] text-white dark:text-[#051647] flex items-center justify-center font-bold text-xs shrink-0">
            {userInitials}
          </div>
          {!isCollapsed && (
            <>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-xs font-bold text-slate-800 dark:text-white truncate leading-tight">
                  {userName}
                </p>
                <p className="text-[11px] text-slate-400 truncate">{userEmail || "Óticas Brasil CRM"}</p>
              </div>
              <MoreVertical className="w-4 h-4 text-slate-400 shrink-0" />
            </>
          )}
        </button>

        <AnimatePresence>
          {isProfileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className={`absolute z-50 mb-2 w-56 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl overflow-hidden ${isCollapsed ? "left-full bottom-0 ml-2" : "left-4 right-4 bottom-full"}`}
            >
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                <p className="text-xs font-bold text-slate-800 dark:text-white truncate">{userName}</p>
                <p className="text-[11px] text-slate-400 truncate">{userEmail}</p>
              </div>
              <div className="py-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    router.push("/perfil");
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <UserIcon className="w-4 h-4 text-slate-400" />
                  Meu Perfil
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    router.push("/configuracoes");
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <Settings className="w-4 h-4 text-slate-400" />
                  Configurações
                </button>
              </div>
              <div className="border-t border-slate-100 dark:border-slate-800 py-1">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  Sair
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <button
        type="button"
        onClick={() => setIsCollapsed((collapsed) => !collapsed)}
        aria-label={isCollapsed ? "Expandir menu" : "Recolher menu"}
        aria-expanded={!isCollapsed}
        title={isCollapsed ? "Expandir menu" : "Recolher menu"}
        className="absolute right-[-14px] top-8 z-20 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-[#07194f] dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer hover:cursor-pointer"
      >
        <ChevronRight className={`h-4 w-4 transition-transform duration-200 ${isCollapsed ? "" : "rotate-180"}`} />
      </button>
    </aside>
  );
}
