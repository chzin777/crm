"use client";

import { useId, useMemo, useState, type ElementType } from "react";
import { Crown, Medal, Search, Store, Trophy, X } from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";
import { rankLeaders, searchLeaders, type LeaderItem, type LeaderRow, type LeaderSort } from "@/lib/sales-live/leaderboard";

const PREVIEW = 5;
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pct = (value: number) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: value < 10 ? 1 : 0 })}%`;
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";

/** Ouro, prata e bronze para o pódio; do 4º em diante, número limpo. */
const PODIUM = [
  { row: "border-amber-200/70 bg-gradient-to-r from-amber-50/80 to-transparent dark:border-amber-400/30 dark:from-amber-400/10", badge: "bg-gradient-to-br from-amber-300 to-amber-500 text-amber-950 shadow-amber-500/30", bar: "from-amber-400 via-[#C4D600] to-[#C8E600]" },
  { row: "border-transparent", badge: "bg-gradient-to-br from-slate-200 to-zinc-400 text-slate-800 shadow-slate-400/30", bar: "from-[#07163B] to-[#C8E600]" },
  { row: "border-transparent", badge: "bg-gradient-to-br from-orange-300 to-amber-700 text-orange-950 shadow-orange-500/30", bar: "from-[#07163B] to-[#C8E600]" },
];

function Position({ position }: { position: number }) {
  const podium = PODIUM[position - 1];
  if (podium) {
    const Icon = position === 1 ? Crown : Medal;
    return (
      <span className={`relative grid h-8 w-8 shrink-0 place-items-center rounded-full shadow-md ${podium.badge}`} aria-label={`${position}º lugar`}>
        <Icon className="h-4 w-4" strokeWidth={2.25} />
        <span className="absolute -bottom-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-white px-0.5 text-[9px] font-extrabold tabular-nums text-slate-800 ring-1 ring-slate-200 dark:bg-[#071440] dark:text-white dark:ring-white/20">{position}</span>
      </span>
    );
  }
  return <span className="grid h-8 w-8 shrink-0 place-items-center text-xs font-bold tabular-nums text-slate-400 dark:text-slate-500">{position}º</span>;
}

function Row({ row, kind, active, onSelect }: { row: LeaderRow; kind: "store" | "seller"; active: boolean; onSelect?: (key: string) => void }) {
  const podium = PODIUM[row.position - 1];
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect?.(row.key)}
        aria-pressed={active}
        title={active ? "Clique para limpar o filtro" : "Filtrar o feed de vendas"}
        className={`group w-full min-w-0 cursor-pointer rounded-xl border p-2.5 text-left transition-colors ${active ? "border-[#C4D600] bg-[#C4D600]/15 ring-1 ring-[#C4D600]/50" : `${podium?.row ?? "border-transparent"} hover:bg-slate-50 dark:hover:bg-white/[0.04]`}`}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <Position position={row.position} />
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[11px] font-bold ${kind === "store" ? "bg-[#002187]/10 text-[#002187] dark:bg-[#C4D600]/15 dark:text-[#C4D600]" : "bg-gradient-to-br from-[#07163B] to-[#002187] text-white ring-2 ring-white dark:ring-[#071440]"}`}>
            {kind === "store" ? <Store className="h-4 w-4" /> : initials(row.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block break-words text-sm font-semibold leading-snug text-slate-800 dark:text-slate-100">{row.name}</span>
            <span className="block break-words text-[11px] text-slate-500 dark:text-slate-400">{row.subtitle}</span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block whitespace-nowrap text-sm font-bold tabular-nums text-[#051647] dark:text-white">{money(row.amount)}</span>
            <span className="mt-0.5 inline-block rounded-full bg-slate-100 px-1.5 py-px text-[10px] font-semibold tabular-nums text-slate-600 dark:bg-white/10 dark:text-slate-300">{pct(row.share)}</span>
          </span>
        </span>
        <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/5">
          <span className={`block h-full rounded-full bg-gradient-to-r transition-all duration-500 ${podium?.bar ?? "from-[#07163B] to-[#C8E600]"}`} style={{ width: `${row.progress}%` }} />
        </span>
      </button>
    </li>
  );
}

/**
 * Card de ranking idêntico para Top Lojas e Top Vendedores: cabeçalho com contador e ordenação (R$ ou pedidos),
 * pódio (ouro, prata, bronze), linha com nome, subtítulo, valor e participação, barra proporcional ao líder,
 * clique para filtrar o feed e "Ver ranking completo" com busca.
 */
export function LeaderboardCard({
  title, icon: Icon = Trophy, countLabel, hint, items, kind, activeKeys = [], onSelect, emptyText,
}: {
  title: string;
  icon?: ElementType;
  countLabel: (count: number) => string;
  hint?: string;
  items: LeaderItem[];
  kind: "store" | "seller";
  activeKeys?: string[];
  onSelect?: (key: string) => void;
  emptyText: string;
}) {
  const [sort, setSort] = useState<LeaderSort>("amount");
  const [full, setFull] = useState(false);
  const [term, setTerm] = useState("");
  const titleId = useId();
  const rows = useMemo(() => rankLeaders(items, sort), [items, sort]);
  const found = useMemo(() => searchLeaders(rows, term), [rows, term]);
  const active = new Set(activeKeys);
  // Selecionado fora do top 5 continua visível (com o indicador ativo).
  const preview = rows.slice(0, PREVIEW).concat(rows.slice(PREVIEW).filter((row) => active.has(row.key)));

  const sortToggle = (
    <span className="inline-flex shrink-0 rounded-lg bg-slate-100 p-0.5 text-[11px] font-semibold dark:bg-white/10" role="group" aria-label="Ordenar ranking">
      {(["amount", "orders"] as const).map((value) => (
        <button key={value} type="button" onClick={() => setSort(value)} aria-pressed={sort === value} className={`cursor-pointer rounded-md px-2 py-0.5 transition-colors ${sort === value ? "bg-white text-slate-900 shadow-sm dark:bg-[#051647] dark:text-white" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"}`}>
          {value === "amount" ? "R$" : "Pedidos"}
        </button>
      ))}
    </span>
  );

  return (
    <section className="min-w-0 rounded-3xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.03] lg:p-5">
      <header className="mb-3 flex min-w-0 items-start gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-amber-100 to-[#C4D600]/30 text-amber-700 dark:from-amber-400/15 dark:to-[#C4D600]/15 dark:text-[#C4D600]"><Icon className="h-[18px] w-[18px]" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-[#051647] dark:text-white">{title}</span>
          <span className="block text-[11px] text-slate-500 dark:text-slate-400">{countLabel(rows.length)}{hint ? ` · ${hint}` : ""}</span>
        </span>
        {rows.length > 1 && sortToggle}
      </header>
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400 dark:border-white/10">{emptyText}</p>
      ) : (
        <>
          <ol className="space-y-1.5">
            {preview.map((row) => <Row key={row.key} row={row} kind={kind} active={active.has(row.key)} onSelect={onSelect} />)}
          </ol>
          {rows.length > PREVIEW && (
            <button type="button" onClick={() => setFull(true)} className="mt-2 w-full cursor-pointer rounded-xl py-2 text-xs font-semibold text-[#002187] transition-colors hover:bg-slate-50 dark:text-[#C4D600] dark:hover:bg-white/[0.04]">
              Ver ranking completo ({rows.length})
            </button>
          )}
        </>
      )}

      {full && (
        <EntityDialog titleId={titleId} title={title} description={countLabel(rows.length)} size="sm" fixedHeight onClose={() => { setFull(false); setTerm(""); }}>
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex items-center gap-2">
              <label className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input autoFocus value={term} onChange={(event) => setTerm(event.target.value)} placeholder={kind === "store" ? "Buscar loja..." : "Buscar vendedor ou loja..."} aria-label="Buscar no ranking" className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-8 text-sm text-slate-800 outline-none focus:border-[#002187] dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100 dark:focus:border-[#C4D600]" />
                {term && <button type="button" onClick={() => setTerm("")} aria-label="Limpar busca" className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 cursor-pointer place-items-center rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-white"><X className="h-3.5 w-3.5" /></button>}
              </label>
              {sortToggle}
            </div>
            <ol className="custom-scrollbar min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
              {found.length === 0 && <li className="py-8 text-center text-sm text-slate-400">Nada encontrado.</li>}
              {found.map((row) => <Row key={row.key} row={row} kind={kind} active={active.has(row.key)} onSelect={(key) => { onSelect?.(key); setFull(false); setTerm(""); }} />)}
            </ol>
          </div>
        </EntityDialog>
      )}
    </section>
  );
}
