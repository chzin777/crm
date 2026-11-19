"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, UserX, Users, X } from "lucide-react";
import { initials } from "@/lib/chat/format";

export type Attendant = { id: string; name: string; online?: boolean };

export const ALL_ATTENDANTS = "";
export const UNASSIGNED = "unassigned";

const plain = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

type Props = {
  value: string;
  onChange: (value: string) => void;
  attendants: Attendant[];
  /** Aba "Minhas": o filtro fica travado no próprio atendente para não contradizer a aba. */
  lockedLabel?: string;
};

/** Filtro de atendente da lista do /chat: Todos, Sem atendente ou um atendente (com busca e X para limpar). */
export function AttendantFilter({ value, onChange, attendants, lockedLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const place = () => {
      const rect = triggerRef.current!.getBoundingClientRect();
      const width = Math.max(rect.width, 240);
      setPosition({ top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - width - 8), width });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const sorted = useMemo(() => [...attendants].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), [attendants]);
  const filtered = useMemo(() => {
    const term = plain(query.trim());
    return term ? sorted.filter((attendant) => plain(attendant.name).includes(term)) : sorted;
  }, [sorted, query]);

  const selected = value && value !== UNASSIGNED ? attendants.find((attendant) => attendant.id === value) : undefined;
  const text = lockedLabel ?? (value === UNASSIGNED ? "Sem atendente" : selected?.name ?? (value ? "Atendente" : "Todos os atendentes"));
  const active = !lockedLabel && !!value;

  const choose = (next: string) => {
    onChange(next);
    setOpen(false);
    setQuery("");
  };

  const option = (key: string, label: string, icon: React.ReactNode, checked: boolean, extra?: React.ReactNode) => (
    <button
      key={key}
      type="button"
      role="option"
      aria-selected={checked}
      onClick={() => choose(key === "__all" ? ALL_ATTENDANTS : key)}
      className={`flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-slate-100 dark:hover:bg-white/5 ${checked ? "font-semibold text-[#002187] dark:text-[#C4D600]" : "text-slate-700 dark:text-slate-200"}`}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {extra}
      {checked && <Check className="h-3.5 w-3.5 shrink-0" />}
    </button>
  );

  return (
    <div className="relative flex min-w-0">
      <button
        ref={triggerRef}
        type="button"
        disabled={!!lockedLabel}
        title={lockedLabel ? "Na aba Minhas a lista já mostra só os seus atendimentos" : `Filtrar por atendente: ${text}`}
        aria-label={`Filtrar por atendente: ${text}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`flex h-8 min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-xl border bg-white px-3 text-xs font-medium text-slate-700 outline-none transition-all hover:bg-slate-50 focus:border-[#002187] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-700/50 dark:focus:border-[#C4D600] ${active ? "border-[#C4D600] pr-8" : "border-slate-200/80 dark:border-slate-700/80"}`}
      >
        {selected ? (
          <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[#002187] text-[8px] font-bold text-white">{initials(selected.name)}</span>
        ) : value === UNASSIGNED && !lockedLabel ? (
          <UserX className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        ) : (
          <Users className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        )}
        <span className="min-w-0 flex-1 truncate text-left">{text}</span>
        {!active && <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
      </button>
      {active && (
        <button
          type="button"
          title="Limpar filtro de atendente"
          aria-label="Limpar filtro de atendente"
          onClick={() => choose(ALL_ATTENDANTS)}
          className="absolute right-1 top-1/2 grid h-6 w-6 -translate-y-1/2 cursor-pointer place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      {/* Só abre depois de um clique (já no navegador): o document.body existe. */}
      {open && position && typeof document !== "undefined" && createPortal(
        <div
          ref={panelRef}
          role="listbox"
          aria-label="Atendentes"
          style={{ position: "fixed", top: position.top, left: position.left, width: position.width }}
          className="z-[70] overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-[#07194f]"
        >
          {sorted.length > 6 && (
            <div className="relative mb-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar atendente..."
                aria-label="Buscar atendente"
                className="h-8 w-full rounded-lg border border-slate-200/80 bg-slate-50 pl-8 pr-2 text-xs outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]"
              />
            </div>
          )}
          <div className="max-h-72 overflow-y-auto">
            {!query.trim() && option("__all", "Todos os atendentes", <Users className="h-4 w-4 shrink-0 text-slate-400" />, !value)}
            {!query.trim() && option(UNASSIGNED, "Sem atendente", <UserX className="h-4 w-4 shrink-0 text-slate-400" />, value === UNASSIGNED)}
            {!query.trim() && sorted.length > 0 && <div className="my-1 border-t border-slate-100 dark:border-slate-800" />}
            {filtered.map((attendant) =>
              option(
                attendant.id,
                attendant.name,
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#002187] text-[9px] font-bold text-white">{initials(attendant.name)}</span>,
                value === attendant.id,
                attendant.online ? <span title="Online" className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" /> : undefined,
              ),
            )}
            {filtered.length === 0 && <p className="px-2 py-3 text-center text-xs text-slate-500 dark:text-slate-400">Nenhum atendente encontrado.</p>}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
