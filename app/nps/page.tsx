"use client";

import { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { Award, Bell, Star, MessageSquare } from "lucide-react";

export default function NpsPage() {
  const [isDark, setIsDark] = useState(false);

  const toggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev;
      if (next) {
        document.documentElement.classList.add("dark");
        localStorage.setItem("otb-crm-theme", "dark");
      } else {
        document.documentElement.classList.remove("dark");
        localStorage.setItem("otb-crm-theme", "light");
      }
      return next;
    });
  };

  return (
    <div className="flex min-h-screen bg-[#f4f5f8] dark:bg-[#030d29] text-slate-800 dark:text-slate-100 transition-colors">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 mx-4 mt-4 bg-white dark:bg-[#051647] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm px-6 flex items-center justify-between gap-4">
          <div className="text-sm font-semibold text-slate-500 dark:text-slate-300">
            Workspace <span className="text-slate-300 dark:text-slate-600">/</span> <strong className="text-slate-900 dark:text-white">Pesquisas NPS</strong>
          </div>
          <div className="flex items-center gap-3">
            <ThemeSwitch isDark={isDark} onToggle={toggleTheme} />
            <button type="button" className="topbar-icon-button text-slate-500 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer hover:cursor-pointer">
              <Bell className="h-4 w-4" />
            </button>
          </div>
        </header>

        <main className="p-8 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Monitor de Satisfação do Cliente (NPS)</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Avaliações de atendimento aos 30 minutos e de produto aos 30 dias</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-[#07194f] p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">NPS Atendimento (30 Min)</span>
                <span className="text-xs font-bold bg-[#C4D600]/20 text-[#051647] dark:text-[#C4D600] px-2 py-0.5 rounded">Tempo Real</span>
              </div>
              <p className="text-3xl font-extrabold text-slate-900 dark:text-white">9.4 <span className="text-xs font-normal text-slate-400">/ 10</span></p>
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                <div className="bg-[#C4D600] h-2 rounded-full" style={{ width: "94%" }} />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">94% de clientes promotores após o atendimento no balcão.</p>
            </div>

            <div className="bg-white dark:bg-[#07194f] p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">NPS Produto & Lentes (1 Mês)</span>
                <span className="text-xs font-bold bg-blue-100 dark:bg-blue-900/50 text-[#002187] dark:text-blue-300 px-2 py-0.5 rounded">Adaptação</span>
              </div>
              <p className="text-3xl font-extrabold text-slate-900 dark:text-white">9.1 <span className="text-xs font-normal text-slate-400">/ 10</span></p>
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                <div className="bg-[#002187] dark:bg-[#C4D600] h-2 rounded-full" style={{ width: "91%" }} />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Excelente adaptação com lentes multifocais e armações.</p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
