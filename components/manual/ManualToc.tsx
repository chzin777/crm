"use client";
import { useEffect, useMemo, useState } from "react";
import { Printer, Search } from "lucide-react";
import type { ManualChapter } from "@/components/manual/ManualParts";

const normalize = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function ManualToc({ chapters }: { chapters: ManualChapter[] }) {
  const [active, setActive] = useState(chapters[0]?.id ?? "");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-10% 0px -75% 0px" },
    );
    chapters.forEach((chapter) => {
      const element = document.getElementById(chapter.id);
      if (element) observer.observe(element);
    });
    return () => observer.disconnect();
  }, [chapters]);

  const filtered = useMemo(() => {
    const term = normalize(query.trim());
    if (!term) return chapters;
    return chapters
      .map((chapter) => (normalize(chapter.title).includes(term) ? chapter : { ...chapter, sections: chapter.sections.filter((section) => normalize(section.title).includes(term)) }))
      .filter((chapter) => normalize(chapter.title).includes(term) || chapter.sections.length > 0);
  }, [chapters, query]);

  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <nav aria-label="Sumário do manual" className="space-y-3">
      <button
        type="button"
        onClick={() => window.print()}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#051647] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#d4e400]"
      >
        <Printer className="h-4 w-4" /> Imprimir manual
      </button>
      <label className="relative block">
        <span className="sr-only">Buscar no sumário</span>
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar tópico..."
          className="w-full rounded-lg border border-[#e2e6ee] bg-white py-2 pl-8 pr-3 text-sm text-slate-700 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-[#051647] dark:text-slate-200"
        />
      </label>
      <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#a0a8b6]">Sumário geral</p>
      <ol className="space-y-0.5">
        {filtered.map((chapter) => {
          const number = chapters.findIndex((item) => item.id === chapter.id) + 1;
          const isActive = active === chapter.id;
          return (
            <li key={chapter.id}>
              <button
                type="button"
                onClick={() => go(chapter.id)}
                className={`flex w-full cursor-pointer gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] font-medium transition ${isActive ? "bg-[#051647] text-white dark:bg-[#C4D600] dark:text-[#051647]" : "text-[#47536a] hover:bg-[#f7f8fa] hover:text-[#142344] dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white"}`}
              >
                <span className={`w-5 shrink-0 text-right ${isActive ? "" : "text-[#F7915E]"}`}>{number}.</span>
                <span>{chapter.title}</span>
              </button>
              {query.trim() !== "" && chapter.sections.length > 0 && (
                <ul className="mb-1 ml-9 space-y-0.5">
                  {chapter.sections.map((section) => (
                    <li key={section.id}>
                      <button type="button" onClick={() => go(section.id)} className="cursor-pointer text-left text-xs text-slate-500 hover:text-[#002187] dark:text-slate-400 dark:hover:text-white">
                        {section.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
        {filtered.length === 0 && <li className="px-2.5 py-2 text-xs text-slate-500">Nenhum tópico encontrado.</li>}
      </ol>
    </nav>
  );
}
