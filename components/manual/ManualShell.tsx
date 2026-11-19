"use client";

import { useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { BookOpen, PlayCircle } from "lucide-react";
import type { ManualChapter } from "@/components/manual/ManualParts";
import { ManualToc } from "@/components/manual/ManualToc";
import { ManualVideos } from "@/components/manual/ManualVideos";

type Mode = "guia" | "videos";

const MODES: { id: Mode; label: string; short: string; icon: typeof BookOpen }[] = [
  { id: "guia", label: "Guia & Documentação", short: "Guia", icon: BookOpen },
  { id: "videos", label: "Vídeos & Treinamentos", short: "Vídeos", icon: PlayCircle },
];

/**
 * Página do manual em dois modos: o guia de leitura (índice fixo + texto) e os vídeos (player + playlist).
 * O modo fica na URL (?modo=videos) para abrir direto pelo link.
 */
export function ManualShell({ chapters, guide }: { chapters: ManualChapter[]; guide: ReactNode }) {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>(searchParams.get("modo") === "videos" ? "videos" : "guia");

  const changeMode = (next: Mode) => {
    setMode(next);
    const params = new URLSearchParams(window.location.search);
    if (next === "videos") params.set("modo", "videos");
    else params.delete("modo");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    window.scrollTo({ top: 0 });
  };

  return (
    <>
      <header className="manual-toc flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between dark:border-slate-800">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#002187] dark:text-[#C4D600]">Manual do sistema</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-[#051647] sm:text-3xl dark:text-white">
            {mode === "guia" ? "Como usar o CRM Óticas Brasil" : "Vídeos & Treinamentos"}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {mode === "guia" ? "Tudo o que o sistema faz, tela por tela, para consultar quando precisar." : "Aulas em vídeo para aprender cada módulo no seu ritmo."}
          </p>
        </div>
        <div role="tablist" aria-label="Modo do manual" className="inline-flex shrink-0 self-start rounded-xl bg-slate-100 p-1 sm:self-auto dark:bg-slate-800/80">
          {MODES.map((item) => {
            const Icon = item.icon;
            const selected = mode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => changeMode(item.id)}
                className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition sm:px-4 ${selected ? "bg-white text-[#051647] shadow-sm dark:bg-[#051647] dark:text-white" : "text-slate-500 hover:text-[#051647] dark:text-slate-400 dark:hover:text-white"}`}
              >
                <Icon className={`h-4 w-4 ${selected ? "text-[#002187] dark:text-[#C4D600]" : ""}`} />
                <span className="hidden sm:inline">{item.label}</span>
                <span className="sm:hidden">{item.short}</span>
              </button>
            );
          })}
        </div>
      </header>

      {mode === "guia" ? (
        <div className="mt-8 grid gap-8 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-12">
          <aside className="manual-toc lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto lg:pb-6">
            <ManualToc chapters={chapters} />
          </aside>
          <main className="min-w-0 max-w-3xl">{guide}</main>
        </div>
      ) : (
        <div className="mt-6">
          <ManualVideos />
        </div>
      )}
    </>
  );
}
