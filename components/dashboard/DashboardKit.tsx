"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Minus, RefreshCw, Search } from "lucide-react";

/* ------------------------------------------------------------------ */
/* Tokens                                                              */
/* ------------------------------------------------------------------ */

export type Tone = "emerald" | "amber" | "rose" | "indigo" | "sky" | "violet" | "slate";

export const TONES: Record<Tone, { badge: string; glow: string; stroke: string; strokeDark: string; soft: string; avatar: string }> = {
  emerald: { badge: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20", glow: "from-emerald-500/[0.07]", stroke: "#10b981", strokeDark: "#34d399", soft: "bg-emerald-500", avatar: "from-emerald-400 to-teal-500" },
  amber: { badge: "bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/20", glow: "from-amber-500/[0.07]", stroke: "#f59e0b", strokeDark: "#fbbf24", soft: "bg-amber-400", avatar: "from-amber-400 to-orange-500" },
  rose: { badge: "bg-rose-500/10 text-rose-600 ring-rose-500/20 dark:bg-rose-400/10 dark:text-rose-300 dark:ring-rose-400/20", glow: "from-rose-500/[0.07]", stroke: "#f43f5e", strokeDark: "#fb7185", soft: "bg-rose-400", avatar: "from-rose-400 to-pink-500" },
  indigo: { badge: "bg-indigo-500/10 text-indigo-600 ring-indigo-500/20 dark:bg-indigo-400/10 dark:text-indigo-300 dark:ring-indigo-400/20", glow: "from-indigo-500/[0.07]", stroke: "#6366f1", strokeDark: "#818cf8", soft: "bg-indigo-500", avatar: "from-indigo-400 to-blue-600" },
  sky: { badge: "bg-sky-500/10 text-sky-600 ring-sky-500/20 dark:bg-sky-400/10 dark:text-sky-300 dark:ring-sky-400/20", glow: "from-sky-500/[0.07]", stroke: "#0ea5e9", strokeDark: "#38bdf8", soft: "bg-sky-500", avatar: "from-sky-400 to-cyan-500" },
  violet: { badge: "bg-violet-500/10 text-violet-600 ring-violet-500/20 dark:bg-violet-400/10 dark:text-violet-300 dark:ring-violet-400/20", glow: "from-violet-500/[0.07]", stroke: "#8b5cf6", strokeDark: "#a78bfa", soft: "bg-violet-500", avatar: "from-violet-400 to-purple-600" },
  slate: { badge: "bg-slate-500/10 text-slate-600 ring-slate-500/20 dark:bg-white/5 dark:text-slate-300 dark:ring-white/10", glow: "from-slate-500/[0.05]", stroke: "#64748b", strokeDark: "#94a3b8", soft: "bg-slate-400", avatar: "from-slate-400 to-slate-600" },
};

export const cardClass = "relative rounded-2xl border border-slate-200/70 bg-white/80 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.08)] backdrop-blur-sm dark:border-white/[0.07] dark:bg-white/[0.03] dark:shadow-none";

export const chartTheme = (isDark: boolean) => ({
  grid: isDark ? "rgba(255,255,255,0.05)" : "rgba(15,23,42,0.05)",
  tick: isDark ? "#64748b" : "#94a3b8",
  cursor: isDark ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.035)",
});

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";

/* ------------------------------------------------------------------ */
/* Primitivos                                                          */
/* ------------------------------------------------------------------ */

export const Skel = ({ className, style }: { className: string; style?: React.CSSProperties }) => (
  <div className={`animate-pulse rounded-lg bg-gradient-to-r from-slate-200/80 via-slate-100 to-slate-200/80 dark:from-white/[0.05] dark:via-white/[0.08] dark:to-white/[0.05] ${className}`} style={style} />
);

export function Avatar({ name, tone = "indigo", size = "md" }: { name: string; tone?: Tone; size?: "sm" | "md" }) {
  const dims = size === "sm" ? "h-8 w-8 text-[11px]" : "h-10 w-10 text-xs";
  return (
    <span className={`relative grid shrink-0 place-items-center rounded-full bg-gradient-to-br ${TONES[tone].avatar} ${dims} font-semibold text-white shadow-sm ring-2 ring-white dark:ring-[#071440]`}>
      {initials(name)}
    </span>
  );
}

export function IconBadge({ icon: Icon, tone = "slate", size = "md" }: { icon: React.ElementType; tone?: Tone; size?: "sm" | "md" }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-xl ring-1 ring-inset ${TONES[tone].badge} ${size === "sm" ? "h-8 w-8" : "h-10 w-10"}`}>
      <Icon className={size === "sm" ? "h-4 w-4" : "h-[18px] w-[18px]"} strokeWidth={2} />
    </span>
  );
}

export function PanelHeader({ icon, title, subtitle, tone = "slate", children }: { icon: React.ElementType; title: string; subtitle: string; tone?: Tone; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <IconBadge icon={icon} tone={tone} size="sm" />
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white">{title}</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, text }: { icon: React.ElementType; title: string; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-12 text-center dark:border-white/10 dark:bg-white/[0.02]">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-slate-400 shadow-sm ring-1 ring-slate-200/70 dark:bg-white/5 dark:text-slate-500 dark:ring-white/10"><Icon className="h-5 w-5" /></span>
      <p className="mt-4 text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</p>
      <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-500 dark:text-slate-400">{text}</p>
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; line?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <span className={item.line ? "h-0.5 w-3.5 rounded-full" : "h-2.5 w-2.5 rounded-[4px]"} style={{ backgroundColor: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Variação                                                            */
/* ------------------------------------------------------------------ */

/** Pílula de variação contra o período de comparação. lowerIsBetter para tempos/inatividade; points para p.p. */
export function DeltaPill({ value, previous, lowerIsBetter = false, points = false, suffix }: { value: number | null; previous: number | null; lowerIsBetter?: boolean; points?: boolean; suffix?: string }) {
  if (value === null || previous === null || (!points && previous === 0)) {
    return <span className="text-[11px] text-slate-400 dark:text-slate-500">sem comparação</span>;
  }
  const change = points ? value - previous : ((value - previous) / previous) * 100;
  const text = (
    suffix ? <span className="font-normal text-slate-400 dark:text-slate-500">{suffix}</span> : null
  );
  if (Math.abs(change) < 0.5) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px]">
        <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-500/10 px-2 py-0.5 font-semibold text-slate-500 ring-1 ring-inset ring-slate-500/15 dark:text-slate-300"><Minus className="h-3 w-3" />estável</span>
        {text}
      </span>
    );
  }
  const good = lowerIsBetter ? change < 0 : change > 0;
  const Icon = change > 0 ? ArrowUpRight : ArrowDownRight;
  const sign = change > 0 ? "+" : "−";
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px]">
      <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-semibold tabular-nums ring-1 ring-inset ${good ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300" : "bg-rose-500/10 text-rose-700 ring-rose-500/20 dark:text-rose-300"}`}>
        <Icon className="h-3 w-3" />{sign}{Math.abs(change).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}{points ? " p.p." : "%"}
      </span>
      {text}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Sparkline e comparação                                              */
/* ------------------------------------------------------------------ */

export function Sparkline({ data, tone, isDark, height = 44 }: { data: number[]; tone: Tone; isDark: boolean; height?: number }) {
  const id = useId().replace(/:/g, "");
  const color = isDark ? TONES[tone].strokeDark : TONES[tone].stroke;
  const points = data.map((value, index) => ({ index, value }));
  return (
    <div style={{ height }} className="-mx-1" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
          <defs>
            <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={isDark ? 0.35 : 0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#spark-${id})`} isAnimationActive animationDuration={700} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Mini barras "anterior x atual" para indicadores sem série diária. */
export function CompareBars({ current, previous, tone, format }: { current: number | null; previous: number | null; tone: Tone; format: (value: number | null) => string }) {
  const max = Math.max(current ?? 0, previous ?? 0, 1e-9);
  const rows: [string, number | null, string][] = [["Anterior", previous, "bg-slate-200 dark:bg-white/10"], ["Atual", current, TONES[tone].soft]];
  return (
    <div className="space-y-1.5" aria-hidden>
      {rows.map(([label, value, bar]) => (
        <div key={label} className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500">
          <span className="w-12 shrink-0">{label}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.04]">
            <motion.div className={`h-full rounded-full ${bar}`} initial={{ width: 0 }} animate={{ width: `${value === null ? 0 : Math.max(3, (value / max) * 100)}%` }} transition={{ duration: 0.6, ease: "easeOut" }} />
          </div>
          <span className="w-14 shrink-0 text-right font-medium tabular-nums text-slate-500 dark:text-slate-400">{format(value)}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* KPI card                                                            */
/* ------------------------------------------------------------------ */

export function KpiCard({ icon, label, value, hint, tone, delta, meta, children }: { icon: React.ElementType; label: string; value: string; hint: string; tone: Tone; delta?: React.ReactNode; meta?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <section className={`${cardClass} group flex flex-col overflow-hidden p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_1px_2px_rgba(15,23,42,0.04),0_16px_32px_-16px_rgba(15,23,42,0.18)] dark:hover:border-white/[0.12]`} aria-label={label} title={hint}>
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${TONES[tone].glow} to-transparent to-60% opacity-80 transition-opacity group-hover:opacity-100`} />
      <div className="relative flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <IconBadge icon={icon} tone={tone} size="sm" />
      </div>
      <p className="relative mt-1 text-[30px] font-semibold leading-tight tabular-nums tracking-tight text-slate-900 dark:text-white">{value}</p>
      <div className="relative mt-1.5 flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1">{delta}</div>
      {meta && <div className="relative mt-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{meta}</div>}
      <div className="relative mt-auto pt-4">{children}</div>
    </section>
  );
}

export function KpiSkeleton() {
  return (
    <div className={`${cardClass} p-5`}>
      <div className="flex justify-between"><Skel className="h-4 w-24" /><Skel className="h-8 w-8 rounded-xl" /></div>
      <Skel className="mt-3 h-8 w-24" />
      <Skel className="mt-3 h-5 w-28 rounded-full" />
      <Skel className="mt-5 h-11 w-full" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tooltip de gráfico                                                  */
/* ------------------------------------------------------------------ */

type TooltipItem = { name?: string; value?: number | string; color?: string; stroke?: string; fill?: string; dataKey?: string | number };

export function ChartTooltip({ active, payload, label, format }: { active?: boolean; label?: string | number; payload?: TooltipItem[]; format?: (item: TooltipItem) => string }) {
  if (!active || !payload?.length) return null;
  const items = payload.filter((item) => item.name);
  return (
    <div className="min-w-[180px] rounded-2xl border border-white/60 bg-white/80 px-3.5 py-3 text-xs shadow-[0_12px_32px_-8px_rgba(15,23,42,0.25)] backdrop-blur-xl dark:border-white/10 dark:bg-[#0b1d55]/80">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
      <div className="space-y-1">
        {items.map((item) => {
          const color = item.stroke && item.stroke !== "transparent" && !String(item.stroke).startsWith("url") ? item.stroke : item.color;
          return (
            <div key={String(item.dataKey)} className="flex items-center justify-between gap-5">
              <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />{item.name}</span>
              <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{format ? format(item) : item.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Gradiente vertical (topo sólido → transparente) para barras e áreas. */
export function FadeGradient({ id, color, from = 0.95, to = 0.25 }: { id: string; color: string; from?: number; to?: number }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={color} stopOpacity={from} />
      <stop offset="100%" stopColor={color} stopOpacity={to} />
    </linearGradient>
  );
}

/* ------------------------------------------------------------------ */
/* Controles                                                           */
/* ------------------------------------------------------------------ */

const controlBase = "h-10 rounded-xl border border-slate-200/80 bg-white/90 text-sm shadow-sm backdrop-blur transition-all dark:border-white/10 dark:bg-white/[0.04]";

export function SegmentedControl<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: string; title?: string }[]; onChange: (value: T) => void; label: string }) {
  const layoutId = useId();
  return (
    <div role="radiogroup" aria-label={label} className={`${controlBase} inline-flex items-center gap-0.5 p-1`}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={`relative h-full cursor-pointer whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30 ${active ? "text-white dark:text-[#051647]" : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"}`}
          >
            {active && <motion.span layoutId={layoutId} className="absolute inset-0 rounded-lg bg-[#051647] shadow-sm dark:bg-[#C4D600]" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
            <span className="relative">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function FilterSelect({ icon: Icon, value, options, onChange, label, allLabel }: { icon: React.ElementType; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void; label: string; allLabel: string }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const all = useMemo(() => [{ value: "", label: allLabel }, ...options], [allLabel, options]);
  const selected = all.find((option) => option.value === value) ?? all[0];
  const searchable = options.length > 7;
  const filtered = search ? all.filter((option) => option.label.toLowerCase().includes(search.toLowerCase())) : all;

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const width = Math.max(rect.width, 240);
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
    setPosition({ top: rect.bottom + 8, left, width });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    const reposition = () => setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  const pick = (next: string) => { onChange(next); setOpen(false); setSearch(""); };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((current) => !current)}
        className={`${controlBase} group inline-flex max-w-[240px] cursor-pointer items-center gap-2 px-3 hover:border-slate-300 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/20 dark:hover:border-white/20 ${open ? "border-indigo-300 ring-2 ring-indigo-500/20 dark:border-indigo-400/40" : ""}`}
      >
        <Icon className="h-4 w-4 shrink-0 text-slate-400 transition-colors group-hover:text-slate-500" />
        <span className={`truncate font-medium ${value ? "text-slate-900 dark:text-white" : "text-slate-600 dark:text-slate-300"}`}>{selected.label}</span>
        {value && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500 dark:bg-[#C4D600]" />}
        <ChevronDown className={`ml-auto h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {open && position && (
            <motion.div
              ref={panelRef}
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.14, ease: "easeOut" }}
              style={{ top: position.top, left: position.left, width: position.width }}
              className="fixed z-[99999] origin-top overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-[0_20px_48px_-12px_rgba(15,23,42,0.28)] backdrop-blur-xl dark:border-white/10 dark:bg-[#0b1d55]/95"
            >
              {searchable && (
                <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5 dark:border-white/5">
                  <Search className="h-4 w-4 text-slate-400" />
                  <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar..." className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white" />
                </div>
              )}
              <ul role="listbox" aria-label={label} className="custom-scrollbar max-h-72 overflow-auto p-1.5">
                {filtered.map((option) => {
                  const active = option.value === value;
                  return (
                    <li key={option.value || "__all"} role="option" aria-selected={active}>
                      <button type="button" onClick={() => pick(option.value)} className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors ${active ? "bg-indigo-50 font-semibold text-indigo-700 dark:bg-white/10 dark:text-white" : "text-slate-700 hover:bg-slate-100/80 dark:text-slate-200 dark:hover:bg-white/5"}`}>
                        <span className="truncate">{option.label}</span>
                        {active && <Check className="h-4 w-4 shrink-0 text-indigo-600 dark:text-[#C4D600]" />}
                      </button>
                    </li>
                  );
                })}
                {filtered.length === 0 && <li className="px-3 py-3 text-center text-xs text-slate-400">Nada encontrado.</li>}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}

const dateInput = "w-[7.6rem] cursor-pointer rounded-lg bg-transparent px-1.5 py-1 text-sm font-medium tabular-nums text-slate-800 outline-none transition-colors hover:bg-slate-100 focus:bg-slate-100 dark:text-slate-100 dark:[color-scheme:dark] dark:hover:bg-white/5 dark:focus:bg-white/5";

export function DateRange({ start, end, max, onChange }: { start: string; end: string; max: string; onChange: (range: { start: string; end: string }) => void }) {
  return (
    <motion.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className={`${controlBase} inline-flex items-center gap-1 px-2 focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-500/20`}>
      <input type="date" aria-label="Data inicial" value={start} max={end} onChange={(event) => event.target.value && onChange({ start: event.target.value, end })} className={dateInput} />
      <span className="text-xs text-slate-400">→</span>
      <input type="date" aria-label="Data final" value={end} min={start} max={max} onChange={(event) => event.target.value && onChange({ start, end: event.target.value })} className={dateInput} />
    </motion.div>
  );
}

export function RefreshButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={loading} aria-label="Atualizar" title="Atualizar" className={`${controlBase} grid w-10 cursor-pointer place-items-center text-slate-500 hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-300 dark:hover:border-white/20 dark:hover:text-white`}>
      <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
    </button>
  );
}

/** Números de página com reticências: 1 … 4 5 6 … 12. */
function pageItems(page: number, pageCount: number): (number | "gap")[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index);
  const pages = new Set([0, pageCount - 1, page - 1, page, page + 1].filter((value) => value >= 0 && value < pageCount));
  const sorted = [...pages].sort((a, b) => a - b);
  return sorted.flatMap((value, index) => (index > 0 && value - sorted[index - 1] > 1 ? ["gap" as const, value] : [value]));
}

const pagerButton = "inline-flex h-8 cursor-pointer items-center justify-center gap-1 rounded-lg border border-slate-200/80 bg-white px-2.5 text-xs font-semibold text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/25 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:border-slate-200/80 disabled:hover:text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300 dark:hover:border-white/20 dark:hover:text-white";

type PaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  noun: string;
  onChange: (page: number) => void;
  /** Com estes dois, aparece o seletor de itens por página. */
  pageSizes?: number[];
  onPageSizeChange?: (size: number) => void;
  /** Botões de primeira e última página. */
  edges?: boolean;
  className?: string;
};

export function Pagination({ page, pageSize, total, noun, onChange, pageSizes, onPageSizeChange, edges = false, className = "mt-5 border-t border-slate-100 pt-4 dark:border-white/5" }: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  return (
    <nav aria-label="Paginação" className={`flex flex-col items-center justify-between gap-3 sm:flex-row ${className}`}>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Mostrando <b className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{from}–{to}</b> de <b className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{total}</b> {noun}
        </p>
        {pageSizes && onPageSizeChange && (
          <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span>Por página</span>
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="h-8 cursor-pointer rounded-lg border border-slate-200/80 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/25 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"
            >
              {pageSizes.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
        )}
      </div>
      {pageCount > 1 && (
        <div className="flex items-center gap-1.5">
          {edges && (
            <button type="button" onClick={() => onChange(0)} disabled={page === 0} aria-label="Primeira página" title="Primeira página" className={pagerButton}>
              <ChevronsLeft className="h-3.5 w-3.5" />
            </button>
          )}
          <button type="button" onClick={() => onChange(page - 1)} disabled={page === 0} aria-label="Página anterior" className={pagerButton}>
            <ChevronLeft className="h-3.5 w-3.5" /><span className="hidden sm:inline">Anterior</span>
          </button>
          {pageItems(page, pageCount).map((item, index) => item === "gap" ? (
            <span key={`gap-${index}`} className="w-6 text-center text-xs text-slate-400">…</span>
          ) : (
            <button key={item} type="button" onClick={() => onChange(item)} aria-label={`Página ${item + 1}`} aria-current={item === page ? "page" : undefined} className={`relative grid h-8 min-w-8 cursor-pointer place-items-center rounded-lg px-2 text-xs font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/25 ${item === page ? "text-white dark:text-[#051647]" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"}`}>
              {item === page && <motion.span layoutId="pager-active" className="absolute inset-0 rounded-lg bg-[#051647] shadow-sm dark:bg-[#C4D600]" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
              <span className="relative">{item + 1}</span>
            </button>
          ))}
          <button type="button" onClick={() => onChange(page + 1)} disabled={page >= pageCount - 1} aria-label="Próxima página" className={pagerButton}>
            <span className="hidden sm:inline">Próximo</span><ChevronRight className="h-3.5 w-3.5" />
          </button>
          {edges && (
            <button type="button" onClick={() => onChange(pageCount - 1)} disabled={page >= pageCount - 1} aria-label="Última página" title="Última página" className={pagerButton}>
              <ChevronsRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </nav>
  );
}

/** Barra fina de progresso no topo durante recarregamentos. */
export function LoadingBar({ active }: { active: boolean }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden">
      <AnimatePresence>
        {active && (
          <motion.div initial={{ x: "-100%" }} animate={{ x: "100%" }} exit={{ opacity: 0 }} transition={{ repeat: Infinity, duration: 1.1, ease: "easeInOut" }} className="h-full w-1/2 bg-gradient-to-r from-transparent via-indigo-500 to-transparent dark:via-[#C4D600]" />
        )}
      </AnimatePresence>
    </div>
  );
}
