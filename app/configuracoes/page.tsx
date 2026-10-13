"use client";

import { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { Settings, Bell, Save, CheckCircle2 } from "lucide-react";

export default function ConfiguracoesPage() {
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
            Workspace <span className="text-slate-300 dark:text-slate-600">/</span> <strong className="text-slate-900 dark:text-white">Configurações</strong>
          </div>
          <div className="flex items-center gap-3">
            <ThemeSwitch isDark={isDark} onToggle={toggleTheme} />
            <button type="button" className="topbar-icon-button text-slate-500 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer hover:cursor-pointer">
              <Bell className="h-4 w-4" />
            </button>
          </div>
        </header>

        <main className="p-8 space-y-6 max-w-4xl">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Configurações do CRM</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Preferências de disparo, mensagens de NPS e integração de WhatsApp</p>
          </div>

          <div className="bg-white dark:bg-[#07194f] p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-5">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Parâmetros das Pesquisas de Satisfação</h2>
            
            <div className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-200 block mb-1">
                  Tempo para envio da pesquisa de atendimento pós-venda
                </label>
                <input
                  type="text"
                  defaultValue="30 minutos"
                  className="w-full sm:w-80 px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-200 block mb-1">
                  Tempo para envio da pesquisa de adaptação do produto
                </label>
                <input
                  type="text"
                  defaultValue="30 dias (1 mês)"
                  className="w-full sm:w-80 px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-200 block mb-1">
                  Critério para considerar cliente inativo
                </label>
                <input
                  type="text"
                  defaultValue="180 dias (6 meses)"
                  className="w-full sm:w-80 px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                className="flex items-center gap-2 bg-[#051647] dark:bg-[#C4D600] text-white dark:text-[#051647] font-bold px-4 py-2 rounded-lg text-xs cursor-pointer hover:cursor-pointer shadow-xs"
              >
                <Save className="w-4 h-4" />
                Salvar Alterações
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
