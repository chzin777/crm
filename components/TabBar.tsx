"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { useCrmTheme } from "@/hooks/useCrmTheme";

interface TabItem {
  href: string;
  label: string;
}

const TABS: TabItem[] = [
  { href: "/painel", label: "Painel" },
  { href: "/", label: "Pipelines" },
  { href: "/contatos", label: "Contatos" },
  { href: "/segmentos", label: "Segmentos" },
  { href: "/lojas", label: "Lojas" },
  { href: "/campanhas", label: "Campanhas" },
  { href: "/modelos", label: "Modelos" },
  { href: "/nps", label: "NPS" },
  { href: "/usuarios", label: "Usuários" },
  { href: "/cargos", label: "Cargos" },
  { href: "/configuracoes", label: "Configurações" },
];

export function TabBar() {
  const pathname = usePathname();
  const { isDark, toggleTheme } = useCrmTheme();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <header className="mx-4 mt-4 flex h-14 items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-4 shadow-sm dark:border-slate-800 dark:bg-[#051647]">
      <nav className="flex flex-1 items-center gap-1 overflow-x-auto scrollbar-hide" aria-label="Navegação principal">
        {TABS.map((tab) => {
          const active = isActive(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`relative whitespace-nowrap rounded-lg px-3 py-2 text-[13px] font-medium transition-colors cursor-pointer hover:cursor-pointer ${
                active
                  ? "bg-[#051647]/10 text-[#051647] dark:bg-[#C4D600]/15 dark:text-[#C4D600]"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"
              }`}
            >
              {tab.label}
              {active && (
                <span className="absolute bottom-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-[#002187] dark:bg-[#C4D600]" />
              )}
            </Link>
          );
        })}
      </nav>
      <div className="flex shrink-0 items-center gap-2 border-l border-slate-200 pl-3 dark:border-slate-700">
        <ThemeSwitch isDark={isDark} onToggle={toggleTheme} />
        <button
          type="button"
          aria-label="Alertas"
          title="Alertas"
          className="topbar-icon-button flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700 cursor-pointer hover:cursor-pointer"
        >
          <Bell className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}