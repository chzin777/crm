"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

interface SearchableSelectProps {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  isLoading?: boolean;
}

const fold = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

export function SearchableSelect({ label, value, options, onChange, placeholder = "Selecione", disabled = false, isLoading = false }: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); setIsOpen(false); }
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [isOpen]);

  const filtered = useMemo(() => {
    const term = fold(query.trim());
    return (term ? options.filter((option) => fold(option).includes(term)) : options).slice(0, 200);
  }, [options, query]);

  return (
    <div ref={rootRef} className="relative space-y-1.5">
      <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300">{label}</span>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => { setQuery(""); setIsOpen((open) => !open); }}
        className="flex h-10 w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 text-left text-sm text-slate-800 transition-colors hover:border-[#002187] disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-[#051647] dark:text-white dark:hover:border-[#C4D600] cursor-pointer hover:cursor-pointer"
      >
        <span className={`truncate ${value ? "" : "text-slate-400"}`}>{value || placeholder}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-[120] mt-2 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-[#07194f]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Pesquisar..."
              className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-800 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-[#051647] dark:text-white"
            />
          </label>
          <div role="listbox" aria-label={label} className="mt-1.5 max-h-52 overflow-y-auto">
            {isLoading && <p className="px-3 py-2 text-xs text-slate-500">Carregando...</p>}
            {!isLoading && filtered.length === 0 && <p className="px-3 py-2 text-xs text-slate-500">Nenhum resultado.</p>}
            {filtered.map((option) => (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={value === option}
                onClick={() => { onChange(option); setIsOpen(false); }}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-xs text-slate-700 transition-colors hover:bg-[#C4D600]/20 hover:text-[#051647] dark:text-slate-200 dark:hover:bg-[#C4D600]/15 dark:hover:text-[#C4D600] cursor-pointer hover:cursor-pointer"
              >
                {option}
                {value === option && <Check className="h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
