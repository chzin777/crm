"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Layers, Loader2, Search, X } from "lucide-react";
import type { RfvpSegmentInfo } from "@/components/RfvpPanel";

const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR");
const MENU_WIDTH = 340;

/**
 * Select de "Segmentos RFV-P": gatilho arredondado com a pílula colorida do segmento (ou contador), menu flutuante
 * em portal no document.body com busca, "Todos os segmentos", cor por segmento e seleção múltipla. O X limpa na hora.
 */
export function RfvpSegmentSelect({ segments, value, onChange }: { segments: RfvpSegmentInfo[] | null; value: string[]; onChange: (next: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const selected = useMemo(() => (segments ?? []).filter((item) => value.includes(item.key)), [segments, value]);
  const filtered = useMemo(() => {
    const term = fold(query.trim());
    return (segments ?? []).filter((item) => !term || fold(`${item.label} ${item.description}`).includes(term));
  }, [query, segments]);

  // Posição do menu: abaixo do gatilho (ou acima, sem espaço), sem sair da tela; acompanha rolagem e redimensionamento.
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const margin = 8;
      const width = Math.min(Math.max(rect.width, MENU_WIDTH), window.innerWidth - margin * 2);
      const left = Math.min(Math.max(margin, rect.left), window.innerWidth - width - margin);
      const below = window.innerHeight - rect.bottom - margin * 2;
      const above = rect.top - margin * 2;
      const maxHeight = Math.min(440, Math.max(below, above));
      const top = below >= Math.min(320, maxHeight) || below >= above ? rect.bottom + 6 : Math.max(margin, rect.top - 6 - maxHeight);
      setPosition({ top, left, width, maxHeight });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", outside);
    window.addEventListener("keydown", escape, true);
    const focus = setTimeout(() => searchRef.current?.focus(), 0);
    return () => { document.removeEventListener("mousedown", outside); window.removeEventListener("keydown", escape, true); clearTimeout(focus); };
  }, [open]);

  const toggle = (key: string) => onChange(value.includes(key) ? value.filter((item) => item !== key) : [...value, key]);
  const toggleOpen = () => { if (!open) setQuery(""); setOpen(!open); };

  return (
    <div className="relative min-w-[220px] flex-1 sm:flex-none">
      <button ref={triggerRef} type="button" onClick={toggleOpen} aria-haspopup="listbox" aria-expanded={open} aria-label="Filtrar por segmento RFV-P"
        className={`flex h-10 w-full cursor-pointer items-center gap-2 rounded-xl border bg-white pl-3 text-left text-sm shadow-xs transition-colors sm:w-[270px] dark:bg-slate-800 ${value.length ? "pr-16" : "pr-9"} ${open ? "border-[#002187] ring-2 ring-[#002187]/10 dark:border-[#C4D600] dark:ring-[#C4D600]/15" : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"}`}>
        {selected.length === 0 ? (
          <>
            <Layers className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            <span className="truncate text-slate-600 dark:text-slate-300">Todos os segmentos</span>
          </>
        ) : selected.length === 1 ? (
          <span className={`inline-flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${selected[0].tone}`}>
            <span className={`h-2 w-2 shrink-0 rounded-full ${selected[0].dot}`} aria-hidden />
            <span className="truncate">{selected[0].label}</span>
          </span>
        ) : (
          <>
            <span className="flex shrink-0 -space-x-1" aria-hidden>
              {selected.slice(0, 4).map((item) => <span key={item.key} className={`h-3 w-3 rounded-full ring-2 ring-white dark:ring-slate-800 ${item.dot}`} />)}
            </span>
            <span className="truncate font-semibold text-[#051647] dark:text-white">{selected.length} segmentos</span>
          </>
        )}
        <ChevronDown className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {value.length > 0 && (
        <button type="button" onClick={() => { onChange([]); setOpen(false); }} aria-label="Limpar filtro de segmento" title="Limpar"
          className="absolute right-8 top-1/2 grid h-6 w-6 -translate-y-1/2 cursor-pointer place-items-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-red-600 dark:hover:bg-white/10">
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {open && mounted && position && createPortal(
        <div ref={menuRef} style={{ top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight }}
          className="fixed z-[200] flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10 dark:border-slate-700 dark:bg-[#07194f]">
          <div className="border-b border-slate-100 p-2 dark:border-slate-800">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
              <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar segmento" aria-label="Buscar segmento"
                className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-2 text-sm text-slate-900 outline-none focus:border-[#002187] focus:bg-white dark:border-slate-700 dark:bg-white/5 dark:text-white dark:focus:border-[#C4D600]" />
            </label>
          </div>
          <ul role="listbox" aria-multiselectable="true" aria-label="Segmentos RFV-P" className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {!query && (
              <li>
                <button type="button" role="option" aria-selected={value.length === 0} onClick={() => { onChange([]); setOpen(false); }}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/5">
                  <Layers className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                  <span className="flex-1">Todos os segmentos</span>
                  {value.length === 0 && <Check className="h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]" aria-hidden />}
                </button>
              </li>
            )}
            {!segments ? (
              <li className="flex items-center justify-center gap-2 py-6 text-xs text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Carregando...</li>
            ) : filtered.length === 0 ? (
              <li className="py-6 text-center text-xs text-slate-400">Nenhum segmento encontrado.</li>
            ) : filtered.map((item) => {
              const active = value.includes(item.key);
              return (
                <li key={item.key}>
                  <button type="button" role="option" aria-selected={active} onClick={() => toggle(item.key)} title={item.description}
                    className={`flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${active ? "bg-[#002187]/[0.06] dark:bg-white/10" : "hover:bg-slate-50 dark:hover:bg-white/5"}`}>
                    <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-md border transition-colors ${active ? "border-[#002187] bg-[#002187] text-white dark:border-[#C4D600] dark:bg-[#C4D600] dark:text-[#051647]" : "border-slate-300 dark:border-slate-600"}`}>
                      {active && <Check className="h-3 w-3" strokeWidth={3} aria-hidden />}
                    </span>
                    <span className={`inline-flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${item.tone}`}>
                      <span className={`h-2 w-2 shrink-0 rounded-full ${item.dot}`} aria-hidden />
                      <span className="truncate">{item.label}</span>
                    </span>
                    <span className="ml-auto shrink-0 text-[11px] font-semibold tabular-nums text-slate-400">{item.count.toLocaleString("pt-BR")}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 dark:border-slate-800">
            <span className="text-[11px] text-slate-400">{value.length ? `${value.length} selecionado(s)` : "Selecione um ou mais"}</span>
            <div className="flex gap-1">
              {value.length > 0 && <button type="button" onClick={() => onChange([])} className="cursor-pointer rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:text-red-600">Limpar</button>}
              <button type="button" onClick={() => setOpen(false)} className="cursor-pointer rounded-lg bg-[#051647] px-3 py-1 text-xs font-semibold text-white hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647]">Concluir</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
