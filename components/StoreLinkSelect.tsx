"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, Store, X } from "lucide-react";

export type StoreLinkOption = { code: string; name: string };

const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Busca por número/código, nome ou cidade (tudo que estiver no nome cadastrado); vários termos = todos. */
export function searchStoreLinks(options: StoreLinkOption[], term: string) {
  const words = fold(term).split(/\s+/).filter(Boolean);
  if (!words.length) return options;
  return options.filter((option) => {
    const haystack = fold(`${option.code} loja ${option.code} ${option.name}`);
    return words.every((word) => haystack.includes(word));
  });
}

/** Resumo do botão fechado: nenhuma, todas (N), o nome da única ou "N lojas selecionadas". */
export function storeLinkSummary(options: StoreLinkOption[], selected: string[]) {
  if (!selected.length) return "Nenhuma loja selecionada";
  if (options.length > 0 && options.every((option) => selected.includes(option.code))) return `Todas as lojas (${options.length})`;
  if (selected.length === 1) return options.find((option) => option.code === selected[0])?.name ?? `Loja ${selected[0]}`;
  return `${selected.length} lojas selecionadas`;
}

/**
 * Lojas vinculadas (ERP VMSet) no modal de usuário: botão compacto com resumo e até 3 chips + "+N"; ao abrir,
 * painel com busca, "Selecionar todas", "Limpar seleção" e lista rolável. O painel abre no fluxo do formulário
 * (não flutua), então nunca é cortado pelo overflow do modal; Esc fecha só o seletor, não o modal.
 */
export function StoreLinkSelect({ options, selected, onChange }: { options: StoreLinkOption[]; selected: string[]; onChange: (next: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Lojas já vinculadas que saíram do cadastro continuam visíveis (e removíveis).
  const all = useMemo(() => [...options, ...selected.filter((code) => !options.some((option) => option.code === code)).map((code) => ({ code, name: `Loja ${code}` }))]
    .sort((a, b) => a.code.localeCompare(b.code, "pt-BR", { numeric: true })), [options, selected]);
  const visible = useMemo(() => searchStoreLinks(all, term), [all, term]);
  const chosen = useMemo(() => new Set(selected), [selected]);
  const chips = selected.slice(0, 3);

  useEffect(() => {
    if (!open) return;
    const focus = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(focus);
  }, [open]);

  const toggle = (code: string) => onChange(chosen.has(code) ? selected.filter((item) => item !== code) : [...selected, code]);
  const selectAll = () => onChange([...new Set([...selected, ...visible.map((option) => option.code)])]);
  const clear = () => onChange(term ? selected.filter((code) => !visible.some((option) => option.code === code)) : []);

  return (
    <div className="min-w-0" onKeyDown={(event) => {
      if (event.key === "Escape" && open) {
        event.stopPropagation();
        setOpen(false);
      }
    }}>
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-haspopup="listbox" className={`flex min-h-10 w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg border bg-white px-3 py-2 text-left text-sm transition-colors dark:bg-white/[0.04] ${selected.length ? "border-[#002187] dark:border-[#C4D600]" : "border-slate-200 dark:border-slate-700"}`}>
        <Store className="h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-slate-800 dark:text-slate-100">{storeLinkSummary(all, selected)}</span>
          {selected.length > 1 && (
            <span className="mt-1 flex min-w-0 flex-wrap gap-1">
              {chips.map((code) => <span key={code} className="rounded-full bg-[#002187]/10 px-2 py-0.5 text-[10px] font-semibold text-[#002187] dark:bg-[#C4D600]/15 dark:text-[#C4D600]">Loja {code}</span>)}
              {selected.length > chips.length && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">+{selected.length - chips.length}</span>}
            </span>
          )}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-[#0a1d4d]">
          <div className="space-y-2 border-b border-slate-100 p-2 dark:border-white/10">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={inputRef}
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }}
                placeholder="Buscar por número, nome ou cidade..."
                aria-label="Buscar loja"
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-8 text-sm text-slate-800 outline-none focus:border-[#002187] dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-100 dark:focus:border-[#C4D600]"
              />
              {term && <button type="button" onClick={() => setTerm("")} aria-label="Limpar busca" className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 cursor-pointer place-items-center rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-white"><X className="h-3.5 w-3.5" /></button>}
            </label>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
              <button type="button" onClick={selectAll} className="cursor-pointer rounded-lg bg-slate-100 px-2 py-1 text-slate-700 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/15">{term ? "Selecionar encontradas" : "Selecionar todas"}</button>
              <button type="button" onClick={clear} className="cursor-pointer rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white">Limpar seleção</button>
              <span className="ml-auto text-[10px] font-medium text-slate-400">{selected.length} de {all.length}</span>
            </div>
          </div>
          <ul role="listbox" aria-multiselectable="true" aria-label="Lojas" className="custom-scrollbar max-h-60 overflow-y-auto p-1">
            {all.length === 0 && <li className="px-3 py-5 text-center text-xs text-slate-400">Nenhuma loja cadastrada.</li>}
            {all.length > 0 && visible.length === 0 && <li className="px-3 py-5 text-center text-xs text-slate-400">Nenhuma loja encontrada.</li>}
            {visible.map((option) => {
              const active = chosen.has(option.code);
              return (
                <li key={option.code} role="option" aria-selected={active}>
                  <button type="button" onClick={() => toggle(option.code)} className={`flex w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${active ? "bg-[#002187]/[0.06] dark:bg-[#C4D600]/10" : "hover:bg-slate-50 dark:hover:bg-white/[0.04]"}`}>
                    <span className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${active ? "border-[#002187] bg-[#002187] text-white dark:border-[#C4D600] dark:bg-[#C4D600] dark:text-[#051647]" : "border-slate-300 dark:border-white/20"}`}>{active && <Check className="h-3 w-3" />}</span>
                    <span className="w-12 shrink-0 text-xs font-bold tabular-nums text-slate-500 dark:text-slate-400">{option.code}</span>
                    <span className="min-w-0 flex-1 break-words text-sm text-slate-800 dark:text-slate-100">{option.name}</span>
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
