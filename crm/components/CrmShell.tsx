"use client";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { TabSystem } from "@/components/TabSystem";

export function CrmShell({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-[#f5f7fb] dark:bg-[#030d29]">
      <div className="mx-auto flex min-h-screen max-w-[1920px] items-start gap-0 overflow-visible px-0 py-4 sm:px-4 lg:pl-8 lg:pr-6">
        {/* Sidebar flutuante estilo ecommerce admin — sticky, rounded-2xl, com toggle na borda */}
        <aside
          className={`sticky top-4 relative z-30 hidden h-[calc(100vh-2rem)] shrink-0 flex-col overflow-visible rounded-2xl border border-[#e2e6ee] bg-white shadow-sm transition-[width] duration-200 ease-out lg:flex dark:border-slate-800 dark:bg-[#051647] ${sidebarCollapsed ? "w-20" : "w-64"}`}
        >
          <Sidebar collapsed={sidebarCollapsed} />
          {/* Botão de expandir/colapsar na borda direita, alinhado à logo */}
          <button
            type="button"
            onClick={() => setSidebarCollapsed((v) => !v)}
            aria-label={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
            title={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
            className="absolute -right-3.5 top-8 z-50 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full border border-[#e2e6ee] bg-white text-[#68748a] shadow-md transition-colors hover:bg-[#f2f4f8] hover:text-[#142344] cursor-pointer dark:border-slate-700 dark:bg-[#07194f] dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <ChevronRight className={`h-4 w-4 transition-transform duration-200 ${sidebarCollapsed ? "" : "rotate-180"}`} />
          </button>
        </aside>

        {/* Mobile sidebar placeholder */}
        <div className="lg:hidden">
          <Sidebar collapsed={false} />
        </div>

        {/* Main content area with tab strip */}
        <main className="min-h-[calc(100vh-2rem)] flex-1">
          {/* Tab strip sticky — igual ao ecommerce admin: h-[92px], rounded-t-2xl, backdrop-blur */}
          <div className="sticky top-0 z-20 flex h-[92px] items-end gap-2 rounded-t-2xl border-b border-[#dfe3ea] bg-[#f1f3f7]/95 px-3 pt-4 backdrop-blur dark:border-slate-800 dark:bg-[#0a1a3e]/95 sm:px-6">
            <TabSystem />
          </div>
          {/* Page content */}
          <div className="mx-auto w-full max-w-[1680px] px-4 py-6 sm:px-7 sm:py-8 xl:px-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}