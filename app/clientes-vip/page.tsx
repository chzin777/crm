"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDownUp, ChevronLeft, ChevronRight, Copy, Filter, Gem, Grid3x3, Link2, Loader2, RefreshCw, Search, SlidersHorizontal, Workflow, X } from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";
import { TierBadge } from "@/components/TierBadge";
import { EMPTY_RFVP_FILTER, useRfvpStatus, type RfvpFilter } from "@/components/RfvpPanel";
import { RfvpSegmentSelect } from "@/components/RfvpSegmentSelect";
import { RfvpBadge, RfvpSegmentChip } from "@/components/RfvpBadge";
import { ScoringSettingsDialog } from "@/components/ScoringSettingsDialog";
import { ContactDetailModal } from "@/components/contacts/ContactDetailModal";
import { useToast } from "@/components/ToastProvider";
import { PILLARS, segmentLabel } from "@/lib/rfvp";
import { TIER_META, TIERS, tierRangeLabel, type Tier, type TierThresholds } from "@/lib/scoring";

type Row = { id: string; name: string; phone: string | null; city: string | null; score: number; tier: string; totalSpent: number; rfvpCode: string | null; rfvpSegment: string | null; lastActivity: string | null; conversationId: string | null };
type Summary = { tier: Tier; count: number; avgScore: number; avgSpent: number };
type Data = { thresholds: TierThresholds; summary: Summary[]; base: number; total: number; page: number; pageSize: number; contacts: Row[] };
type LinkRow = { id: string; shortUrl: string; url: string; label: string; clicks: number; lastClickAt: string | null; contactName: string | null; source: string; createdAt: string };

const INPUT = "h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-[#002187] focus:ring-2 focus:ring-[#002187]/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600] dark:focus:ring-[#C4D600]/15";
const FILTER = "h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-xs outline-none transition-colors hover:border-slate-300 focus:border-[#002187] focus:ring-2 focus:ring-[#002187]/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:hover:border-slate-600 dark:focus:border-[#C4D600] dark:focus:ring-[#C4D600]/15";
const GHOST = "inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-[#002187] dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-[#C4D600]";
const SECONDARY = "inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-[#051647] shadow-sm transition-colors hover:border-[#002187]/40 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-white/5 dark:text-white dark:hover:bg-white/10";
const PRIMARY = "inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-[#051647] px-3.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#002187] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[#C4D600] dark:text-[#051647] dark:hover:brightness-105";
const SORTS = [
  { value: "score_desc", label: "Maior score" },
  { value: "rfvp_desc", label: "Melhor RFV-P" },
  { value: "recent", label: "Mais recente" },
  { value: "value_desc", label: "Maior valor" },
];
const PAGE_SIZES = [15, 25, 50];
const when = (value: string | null) => (value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }) : "—");
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";

/** Números de página com reticências: 1 … 4 5 6 … 20. */
function pageList(page: number, pages: number): (number | "…")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1);
  const set = new Set([1, pages, page - 1, page, page + 1].filter((item) => item >= 1 && item <= pages));
  const sorted = [...set].sort((a, b) => a - b);
  return sorted.flatMap((item, index) => (index > 0 && item - sorted[index - 1] > 1 ? (["…", item] as const) : ([item] as const)));
}

/**
 * /clientes-vip: KPIs por nível, segmentos RFV-P, ranking com filtros e paginação real. Clique na linha abre a ficha
 * completa do cliente na aba Pontuação; parâmetros do RFV-P e dos níveis ficam num modal próprio.
 */
export default function ClientesVipPage() {
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState<Tier | "">("");
  const [segments, setSegments] = useState<string[]>([]);
  const [sort, setSort] = useState("score_desc");
  const [includeAll, setIncludeAll] = useState(false);
  const [rfvpFilter, setRfvpFilter] = useState<RfvpFilter>(EMPTY_RFVP_FILTER);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [linksOpen, setLinksOpen] = useState(false);
  const [openContact, setOpenContact] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ sort, page: String(page), pageSize: String(pageSize) });
    if (query) params.set("q", query);
    if (tier) params.set("tier", tier);
    if (segments.length) params.set("segment", segments.join(","));
    if (includeAll) params.set("all", "1");
    for (const [key, value] of Object.entries(rfvpFilter)) if (value) params.set(key, value);
    try {
      const response = await fetch(`/api/scoring?${params.toString()}`, { cache: "no-store" });
      const body = (await response.json()) as Data & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar.");
      setData(body);
    } catch (error) {
      toast.error("Clientes VIP", error instanceof Error ? error.message : "Não foi possível carregar.");
    } finally {
      setLoading(false);
    }
  }, [includeAll, page, pageSize, query, rfvpFilter, segments, sort, tier, toast]);
  useEffect(() => { void load(); }, [load]);

  const { status, reload: reloadRfvp, recalculate } = useRfvpStatus(() => void load());


  const advancedCount = Object.values(rfvpFilter).filter(Boolean).length + (includeAll ? 1 : 0);
  const clearAll = () => { setSearch(""); setTier(""); setSegments([]); setRfvpFilter(EMPTY_RFVP_FILTER); setIncludeAll(false); setPage(1); };
  const hasFilters = !!(query || tier || segments.length || advancedCount);

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(total, page * pageSize);
  const run = status?.lastRun;

  return (
    <div className="min-w-0 space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-[#051647] dark:text-white">Clientes VIP & Pontuação</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">Ranking por Lead Score e matriz RFV-P (Recência, Frequência, Valor e Pontualidade) para priorizar quem atender.</p>
          <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-400">
            <Grid3x3 className="h-3.5 w-3.5" aria-hidden />
            {status?.running ? "Recalculando RFV-P agora..." : run?.finishedAt ? `RFV-P atualizado em ${when(run.finishedAt)} · recalcula todo dia às 6h` : "RFV-P recalcula todo dia às 6h"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Link href="/automacoes" className={GHOST}><Workflow className="h-4 w-4" />Regras de pontuação</Link>
          <button type="button" onClick={() => setLinksOpen(true)} className={GHOST}><Link2 className="h-4 w-4" />Links rastreados</button>
          <button type="button" onClick={() => setSettingsOpen(true)} disabled={!data || !status} className={SECONDARY}><SlidersHorizontal className="h-4 w-4" />Parametrizar RFV-P & Níveis</button>
          <button type="button" onClick={() => void recalculate()} disabled={!status || status.running} className={PRIMARY}>
            {status?.running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{status?.running ? "Recalculando..." : "Recalcular RFV-P"}
          </button>
        </div>
      </header>

      <section aria-label="Clientes por nível" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[...TIERS].reverse().map((item) => {
          const info = data?.summary.find((row) => row.tier === item);
          const active = tier === item;
          const share = data?.base ? Math.round(((info?.count ?? 0) / data.base) * 1000) / 10 : 0;
          return (
            <button key={item} type="button" onClick={() => { setTier(active ? "" : item); setPage(1); }} aria-pressed={active}
              className={`group min-w-0 cursor-pointer rounded-2xl border bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:bg-[#07194f] ${active ? "border-[#002187] ring-2 ring-[#002187]/15 dark:border-[#C4D600] dark:ring-[#C4D600]/25" : "border-slate-200 dark:border-slate-800"}`}>
              <div className="flex items-center justify-between gap-2">
                <TierBadge tier={item} size="md" />
                <span className="text-[11px] font-semibold tabular-nums text-slate-400">{data ? `${share.toLocaleString("pt-BR")}%` : ""}</span>
              </div>
              <p className="mt-3 text-2xl font-bold tabular-nums text-[#051647] dark:text-white">{info ? info.count.toLocaleString("pt-BR") : "—"}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{data ? tierRangeLabel(item, data.thresholds) : "Carregando..."}</p>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10"><div className="h-full rounded-full bg-[#C4D600]" style={{ width: `${Math.min(100, share)}%` }} /></div>
              <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                <div className="min-w-0"><dt className="text-[10px] text-slate-400">Score médio</dt><dd className="truncate text-xs font-bold tabular-nums text-[#051647] dark:text-white">{info ? `${info.avgScore.toLocaleString("pt-BR")} pts` : "—"}</dd></div>
                <div className="min-w-0"><dt className="text-[10px] text-slate-400">Gasto médio</dt><dd className="truncate text-xs font-bold tabular-nums text-[#051647] dark:text-white">{info ? money(info.avgSpent) : "—"}</dd></div>
              </dl>
            </button>
          );
        })}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#07194f]" aria-label="Ranking de clientes">
        <div className="space-y-3 border-b border-slate-100 p-3 sm:p-4 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-[2_1_260px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, telefone ou CPF" aria-label="Buscar cliente" className={`${FILTER} w-full pl-9`} />
            </div>
            <div className="inline-flex h-10 max-w-full items-center overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-1 [scrollbar-width:none] dark:border-slate-700 dark:bg-white/5" role="radiogroup" aria-label="Filtrar por nível">
              {(["", ...[...TIERS].reverse()] as (Tier | "")[]).map((item) => (
                <button key={item || "all"} type="button" role="radio" aria-checked={tier === item} onClick={() => { setTier(item); setPage(1); }}
                  className={`h-full shrink-0 cursor-pointer rounded-lg px-3 text-xs font-semibold transition-colors ${tier === item ? "bg-white text-[#051647] shadow-sm dark:bg-[#C4D600] dark:text-[#051647]" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"}`}>
                  {item ? TIER_META[item].label : "Todos"}
                </button>
              ))}
            </div>
            <RfvpSegmentSelect segments={status?.segments ?? null} value={segments} onChange={(next) => { setSegments(next); setPage(1); }} />
            <label className="relative">
              <ArrowDownUp className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
              <select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }} aria-label="Ordenar" className={`${FILTER} cursor-pointer pl-8 pr-8`}>
                {SORTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <AdvancedFilters filter={rfvpFilter} includeAll={includeAll} count={advancedCount} onChange={(next, all) => { setRfvpFilter(next); setIncludeAll(all); setPage(1); }} />
          </div>
          {hasFilters && (
            <div className="flex flex-wrap items-center gap-1.5">
              {query && <Chip label={`Busca: ${query}`} onRemove={() => setSearch("")} />}
              {tier && <Chip label={`Nível: ${TIER_META[tier].label}`} onRemove={() => { setTier(""); setPage(1); }} />}
              {segments.map((key) => <Chip key={key} label={`Segmento: ${segmentLabel(key)}`} onRemove={() => { setSegments(segments.filter((item) => item !== key)); setPage(1); }} />)}
              {PILLARS.map((pillar) => {
                const min = rfvpFilter[`${pillar.key}Min`];
                const max = rfvpFilter[`${pillar.key}Max`];
                if (!min && !max) return null;
                const label = min && max ? `${min} ≤ ${pillar.letter} ≤ ${max}` : min ? `${pillar.letter} ≥ ${min}` : `${pillar.letter} ≤ ${max}`;
                return <Chip key={pillar.key} label={label} onRemove={() => { setRfvpFilter({ ...rfvpFilter, [`${pillar.key}Min`]: "", [`${pillar.key}Max`]: "" }); setPage(1); }} />;
              })}
              {includeAll && <Chip label="Inclui contatos sem pontos" onRemove={() => { setIncludeAll(false); setPage(1); }} />}
              <button type="button" onClick={clearAll} className="cursor-pointer px-1.5 text-xs font-semibold text-slate-500 hover:text-red-600">Limpar tudo</button>
            </div>
          )}
        </div>

        <div className="relative overflow-x-auto">
          {loading && data && <div className="absolute inset-x-0 top-0 h-0.5 animate-pulse bg-[#C4D600]" aria-hidden />}
          <table className="w-full min-w-[860px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="w-12 px-4 py-2.5 font-semibold">#</th>
                <th className="px-3 py-2.5 font-semibold">Cliente</th>
                <th className="px-3 py-2.5 font-semibold">Nível</th>
                <th className="px-3 py-2.5 font-semibold">RFV-P</th>
                <th className="px-3 py-2.5 text-right font-semibold">Pontos</th>
                <th className="px-3 py-2.5 text-right font-semibold">Total gasto</th>
                <th className="px-4 py-2.5 font-semibold">Última atividade</th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <tr><td colSpan={7} className="px-3 py-14 text-center text-xs text-slate-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
              ) : !data?.contacts.length ? (
                <tr><td colSpan={7} className="px-3 py-14 text-center">
                  <Gem className="mx-auto h-6 w-6 text-slate-300 dark:text-slate-600" aria-hidden />
                  <p className="mt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">Nenhum cliente encontrado</p>
                  <p className="mt-0.5 text-xs text-slate-400">{hasFilters ? "Ajuste ou limpe os filtros." : "As automações de Lead Score somam pontos a cada evento."}</p>
                </td></tr>
              ) : data.contacts.map((row, index) => (
                <tr key={row.id} tabIndex={0} onClick={() => setOpenContact(row.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setOpenContact(row.id); } }}
                  aria-label={`Abrir ficha de ${row.name}`}
                  className="cursor-pointer border-b border-slate-50 transition-colors last:border-0 hover:bg-[#002187]/[0.03] focus-visible:bg-[#002187]/5 focus-visible:outline-none dark:border-slate-800/60 dark:hover:bg-white/5 dark:focus-visible:bg-white/10">
                  <td className="px-4 py-3 text-xs font-bold tabular-nums text-slate-400">{(page - 1) * pageSize + index + 1}</td>
                  <td className="min-w-0 px-3 py-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#051647] text-[10px] font-bold text-white dark:bg-[#C4D600] dark:text-[#051647]">{initials(row.name)}</span>
                      <div className="min-w-0">
                        <p className="max-w-[240px] truncate font-semibold text-[#051647] dark:text-white">{row.name}</p>
                        <p className="max-w-[240px] truncate text-[11px] text-slate-500 dark:text-slate-400">{[row.phone, row.city].filter(Boolean).join(" · ") || "—"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3"><TierBadge tier={row.tier} /></td>
                  <td className="px-3 py-3"><div className="flex min-w-0 flex-col items-start gap-1"><RfvpBadge code={row.rfvpCode} segment={row.rfvpSegment} /><RfvpSegmentChip segment={row.rfvpSegment} /></div></td>
                  <td className="px-3 py-3 text-right font-bold tabular-nums text-[#051647] dark:text-white">{row.score.toLocaleString("pt-BR")}</td>
                  <td className="px-3 py-3 text-right text-xs tabular-nums text-slate-600 dark:text-slate-300">{money(row.totalSpent)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{when(row.lastActivity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <div className="flex flex-wrap items-center gap-3">
            <span className="tabular-nums">{data ? `Mostrando ${from.toLocaleString("pt-BR")}–${to.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")} clientes` : "Carregando..."}</span>
            <label className="inline-flex items-center gap-1.5">Por página
              <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} aria-label="Itens por página" className="h-8 cursor-pointer rounded-lg border border-slate-200 bg-white px-1.5 text-xs text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
          </div>
          <nav className="flex items-center gap-1" aria-label="Paginação">
            <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1 || loading} className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg px-2 font-semibold hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/10"><ChevronLeft className="h-4 w-4" />Anterior</button>
            {pageList(page, pages).map((item, index) => item === "…" ? (
              <span key={`gap-${index}`} className="px-1 text-slate-400">…</span>
            ) : (
              <button key={item} type="button" onClick={() => setPage(item)} aria-current={item === page ? "page" : undefined} disabled={loading}
                className={`h-8 min-w-8 cursor-pointer rounded-lg px-2 font-semibold tabular-nums transition-colors ${item === page ? "bg-[#051647] text-white dark:bg-[#C4D600] dark:text-[#051647]" : "hover:bg-slate-100 dark:hover:bg-white/10"}`}>{item}</button>
            ))}
            <button type="button" onClick={() => setPage((value) => Math.min(pages, value + 1))} disabled={page >= pages || loading} className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg px-2 font-semibold hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/10">Próxima<ChevronRight className="h-4 w-4" /></button>
          </nav>
        </footer>
      </section>

      {settingsOpen && data && status && (
        <ScoringSettingsDialog rfvp={status.settings} thresholds={data.thresholds} onClose={() => setSettingsOpen(false)}
          onSaved={(recalc) => { setSettingsOpen(false); void reloadRfvp(); void load(); if (recalc) void recalculate(); }} />
      )}
      {linksOpen && <LinksDialog onClose={() => setLinksOpen(false)} />}
      {openContact && <ContactDetailModal contactId={openContact} initialTab="pontuacao" onClose={() => setOpenContact(null)} onChanged={() => void load()} />}
    </div>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-[#002187]/10 py-0.5 pl-2.5 pr-1 text-[11px] font-semibold text-[#002187] dark:bg-white/10 dark:text-[#C4D600]">
      <span className="truncate">{label}</span>
      <button type="button" onClick={onRemove} aria-label={`Remover filtro ${label}`} className="grid h-4 w-4 cursor-pointer place-items-center rounded-full hover:bg-[#002187]/15 dark:hover:bg-white/15"><X className="h-3 w-3" /></button>
    </span>
  );
}

/** Popover "Filtros avançados": nota mínima/máxima de R, F, V e P e contatos sem pontos. */
function AdvancedFilters({ filter, includeAll, count, onChange }: { filter: RfvpFilter; includeAll: boolean; count: number; onChange: (next: RfvpFilter, includeAll: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(filter);
  const [all, setAll] = useState(includeAll);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (box.current && !box.current.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [open]);

  const toggle = () => { if (!open) { setDraft(filter); setAll(includeAll); } setOpen(!open); };
  const apply = (next = draft, nextAll = all) => { onChange(next, nextAll); setOpen(false); };
  const select = "h-8 w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-1.5 text-xs text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white";

  return (
    <div ref={box} className="relative">
      <button type="button" onClick={toggle} aria-expanded={open} aria-haspopup="dialog" className={`inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl border px-3.5 text-xs font-semibold shadow-xs transition-colors ${count ? "border-[#002187] bg-[#002187]/5 text-[#002187] dark:border-[#C4D600] dark:bg-[#C4D600]/10 dark:text-[#C4D600]" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/5"}`}>
        <Filter className="h-4 w-4" />Filtros avançados{count > 0 && <span className="grid h-4 min-w-4 place-items-center rounded-full bg-[#002187] px-1 text-[10px] text-white dark:bg-[#C4D600] dark:text-[#051647]">{count}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Filtros avançados" className="absolute right-0 top-11 z-30 w-[min(92vw,340px)] space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-[#07194f]">
          <div>
            <p className="text-xs font-bold text-[#051647] dark:text-white">Notas RFV-P</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Nota mínima e máxima de cada pilar (1 a 5).</p>
          </div>
          <div className="space-y-2">
            {PILLARS.map((pillar) => (
              <div key={pillar.key} className="grid grid-cols-[1fr_72px_72px] items-center gap-2">
                <span className="min-w-0 truncate text-xs text-slate-700 dark:text-slate-200" title={pillar.hint}><b className="font-mono text-[#002187] dark:text-[#C4D600]">{pillar.letter}</b> {pillar.label}</span>
                <select value={draft[`${pillar.key}Min`]} onChange={(event) => setDraft({ ...draft, [`${pillar.key}Min`]: event.target.value })} aria-label={`${pillar.label} mínima`} className={select}>
                  <option value="">mín</option>{[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>≥ {score}</option>)}
                </select>
                <select value={draft[`${pillar.key}Max`]} onChange={(event) => setDraft({ ...draft, [`${pillar.key}Max`]: event.target.value })} aria-label={`${pillar.label} máxima`} className={select}>
                  <option value="">máx</option>{[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>≤ {score}</option>)}
                </select>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => apply({ ...EMPTY_RFVP_FILTER, vMin: "4", pMax: "2" }, all)} className="w-full cursor-pointer rounded-lg bg-[#F7915E]/15 px-3 py-2 text-left text-[11px] font-semibold text-[#9a3d12] hover:bg-[#F7915E]/25 dark:text-[#F7915E]">
            Atalho: alto valor com atraso (V ≥ 4 e P ≤ 2)
          </button>
          <label className="flex cursor-pointer items-center gap-2 border-t border-slate-100 pt-3 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300">
            <input type="checkbox" checked={all} onChange={(event) => setAll(event.target.checked)} className="h-4 w-4 cursor-pointer accent-[#002187]" />
            Incluir contatos sem Lead Score
          </label>
          <div className="flex justify-between gap-2">
            <button type="button" onClick={() => apply(EMPTY_RFVP_FILTER, false)} className="cursor-pointer rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 hover:text-red-600">Limpar</button>
            <button type="button" onClick={() => apply()} className="h-8 cursor-pointer rounded-lg bg-[#051647] px-4 text-xs font-semibold text-white hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647]">Aplicar filtros</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Gerador de link curto rastreado e últimos links com cliques. */
function LinksDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [links, setLinks] = useState<LinkRow[] | null>(null);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch("/api/links", { cache: "no-store" }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { links?: LinkRow[] } | null;
    setLinks(body?.links ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); toast.success("Link copiado", value); } catch { toast.error("Não foi possível copiar"); }
  };
  const create = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, label }) });
      const body = (await response.json().catch(() => ({}))) as { error?: string; link?: { shortUrl: string } };
      if (!response.ok || !body.link) throw new Error(body.error ?? "Não foi possível gerar.");
      await copy(body.link.shortUrl);
      setUrl("");
      setLabel("");
      await load();
    } catch (error) {
      toast.error("Gerar link", error instanceof Error ? error.message : "Tente de novo.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <EntityDialog titleId="links-rastreados" title="Links rastreados" description="Links curtos /r/... contam cliques. Nas automações, marque Rastrear links no Enviar WhatsApp: cada cliente recebe o próprio link, o clique entra no histórico da conversa e dispara o gatilho Clicou em link rastreado." onClose={onClose} size="lg">
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-[1fr_180px_auto]">
          <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://oticasbrasil.com.br/promocao" aria-label="Link de destino" className={INPUT} />
          <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Nome (opcional)" aria-label="Nome do link" maxLength={120} className={INPUT} />
          <button type="button" onClick={() => void create()} disabled={!/^https?:\/\//i.test(url.trim()) || saving} className="inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-[#002187] px-4 text-sm font-semibold text-white hover:bg-[#051647] disabled:cursor-not-allowed disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}Gerar e copiar</button>
        </div>
        {links === null ? (
          <p className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" />Carregando...</p>
        ) : !links.length ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">Nenhum link gerado ainda.</p>
        ) : (
          <ul className="max-h-[50vh] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
            {links.map((link) => (
              <li key={link.id} className="flex min-w-0 items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#051647] dark:text-white">{link.label || link.contactName || link.shortUrl}</p>
                  <p className="truncate text-[11px] text-slate-500 dark:text-slate-400" title={link.url}>{link.shortUrl} → {link.url}</p>
                  <p className="text-[10px] text-slate-400">{link.source === "automacao" ? "Automação" : "Manual"}{link.contactName ? ` · ${link.contactName}` : ""} · último clique {when(link.lastClickAt)}</p>
                </div>
                <span className="shrink-0 rounded-full bg-[#002187]/10 px-2 py-0.5 text-[11px] font-bold text-[#002187] dark:bg-white/10 dark:text-[#C4D600]">{link.clicks} clique{link.clicks === 1 ? "" : "s"}</span>
                <button type="button" onClick={() => void copy(link.shortUrl)} aria-label="Copiar link" className="cursor-pointer rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-[#002187] dark:hover:bg-white/10 dark:hover:text-[#C4D600]"><Copy className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </EntityDialog>
  );
}
