"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { TabSystem } from "@/components/TabSystem";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { usePermissions } from "@/hooks/usePermissions";
import { moduleForPath } from "@/lib/permissions";

export function CrmShell({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const pathname = usePathname();
  const { isLoading, modules } = usePermissions();
  const moduleKey = moduleForPath(pathname);
  // Enquanto modules estiver null (carregando ou falha), não bloquear — tratar como loading
  const allowed = moduleKey === null || modules === null || modules[moduleKey] === true;

  return (
    <div className="h-dvh bg-[#f5f7fb] dark:bg-[#030d29]">
      <div className="mx-auto flex h-dvh max-w-[1920px] items-start gap-0 overflow-hidden px-0 py-4 sm:px-4 lg:pl-8 lg:pr-6">
        {/* Sidebar — componente único com toggle integrado */}
        <div className="relative hidden lg:block">
          <Sidebar collapsed={sidebarCollapsed} />
          <button
            type="button"
            onClick={() => setSidebarCollapsed((v) => !v)}
            aria-label={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
            title={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
            className="absolute -right-3.5 top-8 z-50 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full border border-[#e2e6ee] bg-white text-[#68748a] shadow-md transition-colors hover:bg-[#f2f4f8] hover:text-[#142344] cursor-pointer dark:border-slate-700 dark:bg-[#07194f] dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <ChevronRight className={`h-4 w-4 transition-transform duration-200 ${sidebarCollapsed ? "" : "rotate-180"}`} />
          </button>
        </div>

        {/* Main content area with tab strip */}
        <main className={`h-full min-w-0 flex-1 ${pathname === "/chat" ? "overflow-hidden" : "overflow-y-auto"}`}>
          {/* Tab strip sticky — igual ao ecommerce admin: h-[92px], rounded-t-2xl, backdrop-blur */}
          <div className="sticky top-0 z-20 flex h-[92px] items-end gap-2 rounded-t-2xl border-b border-[#dfe3ea] bg-[#f1f3f7]/95 px-3 pt-4 backdrop-blur dark:border-slate-800 dark:bg-[#0a1a3e]/95 sm:px-6">
            <TabSystem />
          </div>
          {/* Page content */}
          <div className={`mx-auto w-full max-w-[1680px] ${pathname === "/chat" ? "h-[calc(100%-92px)] overflow-hidden p-0" : "px-4 py-6 sm:px-7 sm:py-8 xl:px-10"}`}>
            {isLoading && moduleKey !== null ? (
              <div className="flex h-64 items-center justify-center"><LoadingSpinner label="Verificando permissões..." /></div>
            ) : allowed ? (
              children
            ) : (
              <div className="flex h-64 flex-col items-center justify-center gap-1 text-center">
                <p className="text-base font-semibold text-[#051647] dark:text-white">Sem permissão para acessar esta tela</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">Peça a um administrador para liberar o acesso ao seu cargo.</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}