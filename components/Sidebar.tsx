"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { motion } from "motion/react";
import {
  Kanban,
  LayoutDashboard,
  Users,
  Tags,
  MessageSquare,
  Award,
  UserCog,
  Settings,
  ChevronRight,
  TrendingUp,
} from "lucide-react";

export function Sidebar() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);

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
      badge: "8",
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
      title: "Campanhas",
      href: "/campanhas",
      icon: MessageSquare,
      badge: "Novo",
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
      <div className={`h-16 flex items-center border-b border-slate-200 dark:border-slate-800/80 ${isCollapsed ? "justify-center px-0" : "px-5"}`}>
        <Link href="/" aria-label="Óticas Brasil" className="flex items-center gap-2.5 cursor-pointer hover:cursor-pointer">
          {isCollapsed ? (
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[#051647] text-xs font-bold text-white dark:bg-[#C4D600] dark:text-[#051647]">OB</span>
          ) : (
            <>
              <img
                src="/logos/logo-oticas-brasil.png"
                alt="Óticas Brasil"
                className="h-7 w-auto object-contain dark:hidden"
              />
              <img
                src="/logos/logo-oticas-brasil-branca.png"
                alt="Óticas Brasil"
                className="hidden h-7 w-auto object-contain dark:block"
              />
            </>
          )}
        </Link>
      </div>

      {/* Navegação */}
      <div className="flex-1 py-5 px-3 space-y-1 overflow-y-auto">
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
              className={`relative flex items-center py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ease-out cursor-pointer hover:cursor-pointer ${isCollapsed ? "justify-center px-0" : "justify-between px-3"} ${
                isActive
                  ? "text-white dark:text-[#051647]"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="sidebar-active-link"
                  className="pointer-events-none absolute inset-0 rounded-xl bg-[#051647] shadow-xs dark:bg-[#C4D600]"
                  initial={{ opacity: 0, scale: 0.96, y: 3 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <div className={`relative z-10 flex items-center ${isCollapsed ? "justify-center" : "gap-3"}`}>
                <Icon className={`w-4 h-4 ${isActive ? "text-[#C4D600] dark:text-[#051647]" : "text-slate-400 dark:text-slate-400"}`} />
                {!isCollapsed && <span>{item.title}</span>}
              </div>
              {item.badge && !isCollapsed && (
                <span
                  className={`relative z-10 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    isActive
                      ? "bg-white/20 text-white dark:bg-[#051647]/20 dark:text-[#051647]"
                      : "bg-[#C4D600]/20 text-[#051647] dark:text-[#C4D600]"
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* Rodapé da Sidebar com Card de Perfil */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800/80">
        <div className={`flex items-center p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 ${isCollapsed ? "justify-center" : "gap-3"}`}>
          <div title={isCollapsed ? "Gestor de Marketing" : undefined} className="w-9 h-9 rounded-full bg-[#051647] dark:bg-[#C4D600] text-white dark:text-[#051647] flex items-center justify-center font-bold text-xs shrink-0">
            OB
          </div>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-800 dark:text-white truncate leading-tight">
                Gestor de Marketing
              </p>
              <p className="text-[11px] text-slate-400 truncate">Óticas Brasil CRM</p>
            </div>
          )}
        </div>
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
