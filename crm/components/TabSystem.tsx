"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Kanban,
  Users,
  Tags,
  Store,
  MessageSquare,
  FileText,
  Award,
  UserCog,
  Shield,
  Settings,
  X,
} from "lucide-react";

interface TabDef {
  id: string;
  label: string;
  href: string;
  icon: React.ElementType;
}

const TABS: TabDef[] = [
  { id: "painel", label: "Painel", href: "/painel", icon: LayoutDashboard },
  { id: "pipelines", label: "Pipelines", href: "/", icon: Kanban },
  { id: "contatos", label: "Contatos", href: "/contatos", icon: Users },
  { id: "segmentos", label: "Segmentos", href: "/segmentos", icon: Tags },
  { id: "lojas", label: "Lojas", href: "/lojas", icon: Store },
  { id: "campanhas", label: "Campanhas", href: "/campanhas", icon: MessageSquare },
  { id: "modelos", label: "Modelos", href: "/modelos", icon: FileText },
  { id: "nps", label: "NPS", href: "/nps", icon: Award },
  { id: "usuarios", label: "Usuários", href: "/usuarios", icon: UserCog },
  { id: "cargos", label: "Cargos", href: "/cargos", icon: Shield },
  { id: "configuracoes", label: "Configurações", href: "/configuracoes", icon: Settings },
];

const STORAGE_KEY = "crm_tabs";

function readTabs(): { active: string; open: string[] } {
  const fallback = { active: "painel", open: ["painel"] };
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as { active?: unknown; open?: unknown };
    if (!parsed || !Array.isArray(parsed.open)) return fallback;
    const ids = TABS.map((t) => t.id);
    const open = [...new Set(parsed.open.filter((id): id is string => typeof id === "string" && ids.includes(id)))];
    const active = typeof parsed.active === "string" && open.includes(parsed.active) ? parsed.active : open[0] ?? "";
    return { active, open };
  } catch {
    return fallback;
  }
}

function getTabIdFromPath(pathname: string): string | null {
  for (const tab of TABS) {
    if (tab.href === "/" && pathname === "/") return tab.id;
    if (tab.href !== "/" && pathname.startsWith(tab.href)) return tab.id;
  }
  return null;
}

export function TabSystem() {
  const pathname = usePathname();
  const [active, setActive] = useState(() => readTabs().active);
  const [open, setOpen] = useState<string[]>(() => readTabs().open);

  useEffect(() => {
    const tabId = getTabIdFromPath(pathname);
    if (tabId && tabId !== active) {
      setActive(tabId);
      if (!open.includes(tabId)) {
        setOpen((prev) => [...prev, tabId]);
      }
    }
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ active, open }));
    } catch { /* ignore */ }
  }, [active, open]);

  const closeTab = (id: string) => {
    const idx = open.indexOf(id);
    const next = open.filter((t) => t !== id);
    setOpen(next);
    if (active === id) {
      const newActive = next[Math.max(idx - 1, 0)] ?? "";
      setActive(newActive);
      const tab = TABS.find((t) => t.id === newActive);
      if (tab) window.location.href = tab.href;
    }
  };

  const activateTab = (id: string) => {
    setActive(id);
    if (!open.includes(id)) {
      setOpen((prev) => [...prev, id]);
    }
  };

  return (
    <div className="flex h-full min-w-0 flex-1 items-end gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {open.map((id) => {
        const tab = TABS.find((t) => t.id === id);
        if (!tab) return null;
        const isActive = id === active;
        const Icon = tab.icon;
        return (
          <div
            key={id}
            className={`group relative mb-[-1px] flex h-11 w-40 min-w-40 max-w-40 shrink-0 items-center justify-between gap-2 rounded-t-[10px] border px-3 text-[13px] font-medium whitespace-nowrap transition-[background-color,color,opacity] ${
              isActive
                ? "z-10 border-[#dfe3ea] border-b-white bg-white text-[#142344] dark:border-slate-700 dark:border-b-[#051647] dark:bg-[#051647] dark:text-white"
                : "border-transparent bg-[#e7eaf0] text-[#68748a] hover:bg-[#eceef3] hover:text-[#34415e] dark:bg-slate-800/50 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            } cursor-grab`}
          >
            <Link
              href={tab.href}
              onClick={() => activateTab(id)}
              className="flex h-full min-w-0 flex-1 items-center gap-2 cursor-pointer hover:cursor-pointer"
            >
              <Icon className={`h-[17px] w-[17px] shrink-0 ${isActive ? "text-[#4156b8] dark:text-[#C4D600]" : "text-[#8992a4] dark:text-slate-500"}`} />
              <span className="truncate" title={tab.label}>{tab.label}</span>
            </Link>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); closeTab(id); }}
              aria-label={`Fechar ${tab.label}`}
              title={`Fechar ${tab.label}`}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[#8992a4] hover:cursor-pointer hover:bg-[#dce1e9] hover:text-[#34415e] dark:hover:bg-slate-700 dark:hover:text-slate-200"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}