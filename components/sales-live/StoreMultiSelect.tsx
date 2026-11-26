"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, Store, Trophy, X } from "lucide-react";
import { filterStores, storeSelectionLabel, topStores, type StoreOption, type StoreSort } from "@/lib/sales-live/filters";

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/**
 * Seletor de lojas do /vendas/ao-vivo: botão com o estado atual e painel com busca por número ou nome da unidade,
 * seleção múltipla, pedidos e faturamento do período por loja e atalhos (todas, top 5, limpar).
 */
export function StoreMultiSelect({ options, selected, onChange }: { options: StoreOption[]; selected: string[]; onChange: (next: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [sort, setSort] = useState<StoreSort>("revenue");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    const focus = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
      window.clearTimeout(focus);
    };
  }, [open]);

  const visible = useMemo(() => filterStores(options, term, sort), [options, term, sort]);
  const chosen = useMemo(() => new Set(selected), [selected]);
  // Todas marcadas = sem filtro (a lista volta a "Todas as lojas").
  const commit = (next: string[]) => onChange(next.length >= options.length ? [] : next);
  const toggle = (store: string) => commit(chosen.has(store) ? selected.filter((item) => item !== store) : [...selected, store]);
  const label = storeSelectionLabel(options, selected);

  return (
    <div ref={rootRef} className="relative min-w-0">
      <div className={`flex h-10 min-w-0 items-center rounded-xl border bg-white transition-colors dark:bg-white/[0.04] ${selected.length ? "border-[#002187] dark:border-[#C4D600]" : "border-slate-200 dark:border-white/10"}`}>
        <button type="button" onClick={() => setOpen((value) => !value)} aria-haspopup="listbox" aria-expanded={open} title={label} className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 pl-3 pr-2 text-left text-sm font-semibold text-slate-800 dark:text-slate-100">
          <Store className="h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]" />
          <span className="min-w-0 flex-1 truncate">{label}</span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {selected.length > 0 && (
          <button type="button" onClick={() => onChange([])} aria-label="Limpar lojas" title="Mostrar todas as lojas" className="mr-1 grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute left-0 z-50 mt-1.5 w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#0a1d4d]">
          <div className="space-y-2 border-b border-slate-100 p-2.5 dark:border-white/10">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input ref={inputRef} value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Buscar loja por nome ou número..." aria-label="Buscar loja" className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-8 text-sm text-slate-800 outline-none focus:border-[#002187] dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-100 dark:focus:border-[#C4D600]" />
              {term && <button type="button" onClick={() => setTerm("")} aria-label="Limpar busca de loja" className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 cursor-pointer place-items-center rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-white"><X className="h-3.5 w-3.5" /></button>}
            </label>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
              <button type="button" onClick={() => commit([...new Set([...selected, ...visible.map((item) => item.store)])])} className="cursor-pointer rounded-lg bg-slate-100 px-2 py-1 text-slate-700 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/15">{term ? "Selecionar encontradas" : "Selecionar todas"}</button>
              <button type="button" onClick={() => commit(topStores(options, 5))} className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-[#C4D600]/20 px-2 py-1 text-[#051647] hover:bg-[#C4D600]/30 dark:text-[#C4D600]"><Trophy className="h-3 w-3" />Top 5 lojas</button>
              <button type="button" onClick={() => onChange([])} className="cursor-pointer rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white">Limpar</button>
              <span className="ml-auto inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-white/10" role="group" aria-label="Ordenar lojas">
                {(["revenue", "number"] as const).map((value) => (
                  <button key={value} type="button" onClick={() => setSort(value)} aria-pressed={sort === value} className={`cursor-pointer rounded-md px-2 py-0.5 ${sort === value ? "bg-white text-slate-900 shadow-sm dark:bg-[#051647] dark:text-white" : "text-slate-500 dark:text-slate-400"}`}>{value === "revenue" ? "Faturamento" : "Número"}</button>
                ))}
              </span>
            </div>
          </div>
          <ul role="listbox" aria-multiselectable="true" aria-label="Lojas" className="custom-scrollbar max-h-80 overflow-y-auto p-1.5">
            {visible.length === 0 && <li className="px-3 py-6 text-center text-xs text-slate-400">Nenhuma loja encontrada.</li>}
            {visible.map((item) => {
              const active = chosen.has(item.store);
              return (
                <li key={item.store} role="option" aria-selected={active}>
                  <button type="button" onClick={() => toggle(item.store)} className={`flex w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${active ? "bg-[#002187]/[0.06] dark:bg-[#C4D600]/10" : "hover:bg-slate-50 dark:hover:bg-white/[0.04]"}`}>
                    <span className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${active ? "border-[#002187] bg-[#002187] text-white dark:border-[#C4D600] dark:bg-[#C4D600] dark:text-[#051647]" : "border-slate-300 dark:border-white/20"}`}>{active && <Check className="h-3 w-3" />}</span>
                    <span className="min-w-0 flex-1 break-words text-sm font-medium text-slate-800 dark:text-slate-100">{item.storeLabel}</span>
                    <span className="shrink-0 text-right">
                      <span className="block text-xs font-bold tabular-nums text-slate-900 dark:text-white">{money(item.amount)}</span>
                      <span className="block text-[10px] tabular-nums text-slate-500 dark:text-slate-400">{item.orders} {item.orders === 1 ? "pedido" : "pedidos"}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
