"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ListTree, Printer, Search, X } from "lucide-react";
import type { ManualChapter } from "@/components/manual/ManualParts";

const normalize = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Índice lateral do guia: busca instantânea (título e texto das seções), capítulo ativo destacado
 * e seções do capítulo atual abertas. Atalho "/" ou Ctrl+K foca a busca.
 */
export function ManualToc({ chapters }: { chapters: ManualChapter[] }) {
  const [active, setActive] = useState(chapters[0]?.id ?? "");
  const [activeSection, setActiveSection] = useState("");
  const [query, setQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const first = visible[0]?.target.id;
        if (!first) return;
        const chapter = chapters.find((item) => item.id === first || item.sections.some((section) => section.id === first));
        if (chapter) setActive(chapter.id);
        if (chapter && chapter.id !== first) setActiveSection(first);
      },
      { rootMargin: "-10% 0px -75% 0px" },
    );
    chapters.forEach((chapter) => {
      [chapter.id, ...chapter.sections.map((section) => section.id)].forEach((id) => {
        const element = document.getElementById(id);
        if (element) observer.observe(element);
      });
    });
    return () => observer.disconnect();
  }, [chapters]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if ((event.key === "/" && !typing) || (event.key.toLowerCase() === "k" && (event.ctrlKey || event.metaKey))) {
        event.preventDefault();
        setMobileOpen(true);
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Busca no título e no texto de cada seção (o conteúdo já está na página).
  const results = useMemo(() => {
    const term = normalize(query.trim());
    if (!term) return null;
    const textOf = (id: string) => normalize(document.getElementById(id)?.textContent ?? "");
    return chapters
      .map((chapter) => ({
        ...chapter,
        sections: chapter.sections.filter((section) => normalize(section.title).includes(term) || textOf(section.id).includes(term)),
      }))
      .filter((chapter) => normalize(chapter.title).includes(term) || chapter.sections.length > 0);
  }, [chapters, query]);

  const go = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setMobileOpen(false);
  };

  const list = results ?? chapters;

  return (
    <nav aria-label="Sumário do manual" className="space-y-4">
      <div className="flex items-center gap-2">
        <label className="relative block min-w-0 flex-1">
          <span className="sr-only">Buscar no manual</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => { setQuery(event.target.value); setMobileOpen(true); }}
            placeholder="Buscar no manual"
            className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-14 text-sm text-slate-800 outline-none transition focus:border-[#002187] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-[#C4D600]"
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} aria-label="Limpar busca" className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"><X className="h-3.5 w-3.5" /></button>
          ) : (
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-slate-200 px-1.5 text-[10px] font-medium text-slate-400 lg:block dark:border-slate-700">Ctrl K</kbd>
          )}
        </label>
        <button type="button" onClick={() => setMobileOpen((open) => !open)} aria-expanded={mobileOpen} className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 lg:hidden dark:border-slate-700 dark:text-slate-300">
          <ListTree className="h-4 w-4" /> Sumário
        </button>
      </div>

      <div className={`${mobileOpen ? "block" : "hidden"} lg:block`}>
        {results && <p className="mb-2 px-2 text-xs text-slate-500 dark:text-slate-400">{results.reduce((total, chapter) => total + Math.max(chapter.sections.length, 1), 0)} resultado(s)</p>}
        <ol className="space-y-0.5">
          {list.map((chapter) => {
            const number = chapters.findIndex((item) => item.id === chapter.id) + 1;
            const isActive = !results && active === chapter.id;
            const showSections = results ? chapter.sections.length > 0 : isActive;
            return (
              <li key={chapter.id}>
                <button
                  type="button"
                  onClick={() => go(chapter.id)}
                  className={`group flex w-full cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] transition ${isActive ? "font-semibold text-[#051647] dark:text-white" : "text-slate-600 hover:text-[#051647] dark:text-slate-400 dark:hover:text-white"}`}
                >
                  <span className={`w-5 shrink-0 text-right tabular-nums ${isActive ? "text-[#F7915E]" : "text-slate-400 dark:text-slate-500"}`}>{number}</span>
                  <span className="min-w-0 flex-1">{chapter.title}</span>
                  {!results && <ChevronDown className={`mt-0.5 h-3.5 w-3.5 shrink-0 transition ${isActive ? "rotate-0 opacity-60" : "-rotate-90 opacity-0 group-hover:opacity-40"}`} />}
                </button>
                {showSections && (
                  <ul className="mb-2 ml-[18px] space-y-0.5 border-l border-slate-200 pl-3 dark:border-slate-700">
                    {chapter.sections.map((section) => {
                      const current = !results && activeSection === section.id;
                      return (
                        <li key={section.id}>
                          <button
                            type="button"
                            onClick={() => go(section.id)}
                            className={`-ml-[13px] block w-full cursor-pointer border-l-2 py-1 pl-3 text-left text-xs transition ${current ? "border-[#C4D600] font-medium text-[#051647] dark:text-white" : "border-transparent text-slate-500 hover:text-[#051647] dark:text-slate-400 dark:hover:text-white"}`}
                          >
                            {section.title}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
          {list.length === 0 && <li className="px-2 py-2 text-xs text-slate-500">Nada encontrado para “{query}”.</li>}
        </ol>
        <button
          type="button"
          onClick={() => window.print()}
          className="mt-4 flex cursor-pointer items-center gap-2 px-2 text-xs font-medium text-slate-500 transition hover:text-[#051647] dark:text-slate-400 dark:hover:text-white"
        >
          <Printer className="h-3.5 w-3.5" /> Imprimir manual
        </button>
      </div>
    </nav>
  );
}
