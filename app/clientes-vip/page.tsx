"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownUp, ChevronLeft, ChevronRight, Copy, ExternalLink, Gauge, Gem, Link2, Loader2, MessageSquare, Search, SlidersHorizontal, Workflow } from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";
import { TierBadge } from "@/components/TierBadge";
import { RfvpPanel, EMPTY_RFVP_FILTER, type RfvpFilter } from "@/components/RfvpPanel";
import { RfvpBadge, RfvpSegmentChip } from "@/components/RfvpBadge";
import { useToast } from "@/components/ToastProvider";
import { TIER_META, TIERS, tierRangeLabel, thresholdProblems, type Tier, type TierThresholds } from "@/lib/scoring";

type Log = { id: string; delta: number; reason: string; createdAt: string };
type Row = { id: string; name: string; phone: string | null; city: string | null; score: number; tier: string; rfvpCode: string | null; rfvpSegment: string | null; lastActivity: string | null; conversationId: string | null; logs: Log[] };
type Data = { thresholds: TierThresholds; summary: { tier: Tier; count: number; avgScore: number }[]; total: number; page: number; pageSize: number; contacts: Row[] };
type LinkRow = { id: string; shortUrl: string; url: string; label: string; clicks: number; lastClickAt: string | null; contactName: string | null; source: string; createdAt: string };

const INPUT = "h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]";
const BUTTON = "inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-[#002187] hover:bg-slate-50 dark:border-slate-700 dark:text-[#C4D600] dark:hover:bg-white/5";
const SORTS = [{ value: "score_desc", label: "Maior pontuação" }, { value: "score_asc", label: "Menor pontuação" }, { value: "recent", label: "Atividade mais recente" }, { value: "name", label: "Nome (A–Z)" }, { value: "rfvp_desc", label: "Maior RFV-P" }, { value: "rfvp_asc", label: "Menor RFV-P" }];
const when = (value: string | null) => (value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }) : "—");

/** /clientes-vip: níveis Diamante, Ouro, Prata e Bronze, ranking por Lead Score, faixas e links rastreados. */
export default function ClientesVipPage() {
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState<Tier | "">("");
  const [sort, setSort] = useState("score_desc");
  const [includeAll, setIncludeAll] = useState(false);
  const [page, setPage] = useState(1);
  const [editingThresholds, setEditingThresholds] = useState(false);
  const [adjusting, setAdjusting] = useState<Row | null>(null);
  const [linksOpen, setLinksOpen] = useState(false);
  const [rfvpFilter, setRfvpFilter] = useState<RfvpFilter>(EMPTY_RFVP_FILTER);

  useEffect(() => {
    const timer = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ sort, page: String(page) });
    if (query) params.set("q", query);
    if (tier) params.set("tier", tier);
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
  }, [includeAll, page, query, rfvpFilter, sort, tier, toast]);
  useEffect(() => { void load(); }, [load]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-[#051647] dark:text-white">Clientes VIP & Pontuação</h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Lead Score dos clientes, ranking e níveis Diamante, Ouro, Prata e Bronze. Os pontos de cada evento são definidos nas automações (nó Alterar pontuação).</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/automacoes" className={BUTTON}><Workflow className="h-4 w-4" />Regras de pontuação</Link>
          <button type="button" onClick={() => setLinksOpen(true)} className={BUTTON}><Link2 className="h-4 w-4" />Links rastreados</button>
          <button type="button" onClick={() => setEditingThresholds(true)} disabled={!data} className={`${BUTTON} disabled:cursor-not-allowed disabled:opacity-50`}><SlidersHorizontal className="h-4 w-4" />Faixas dos níveis</button>
        </div>
      </div>

      <RfvpPanel filter={rfvpFilter} onFilter={(next) => { setRfvpFilter(next); setPage(1); }} onRecalculated={() => void load()} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[...TIERS].reverse().map((item) => {
          const info = data?.summary.find((row) => row.tier === item);
          const active = tier === item;
          return (
            <button key={item} type="button" onClick={() => { setTier(active ? "" : item); setPage(1); }} aria-pressed={active} className={`min-w-0 cursor-pointer rounded-2xl border bg-white p-4 text-left shadow-sm transition-colors dark:bg-[#07194f] ${active ? "border-[#002187] ring-2 ring-[#002187]/20 dark:border-[#C4D600] dark:ring-[#C4D600]/30" : "border-slate-200 hover:border-slate-300 dark:border-slate-800"}`}>
              <div className="flex items-center justify-between gap-2">
                <TierBadge tier={item} size="md" />
                <Gem className="h-4 w-4 text-slate-300 dark:text-slate-600" aria-hidden />
              </div>
              <p className="mt-3 text-2xl font-bold text-[#051647] dark:text-white">{info ? info.count.toLocaleString("pt-BR") : "—"}</p>
              <p className="mt-0.5 break-words text-[11px] text-slate-500 dark:text-slate-400">{data ? `${tierRangeLabel(item, data.thresholds)} · média ${info?.avgScore ?? 0}` : "Carregando..."}</p>
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#07194f]">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3 dark:border-slate-800">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, telefone ou CPF" aria-label="Buscar cliente" className={`${INPUT} pl-8`} />
          </div>
          <select value={tier} onChange={(event) => { setTier(event.target.value as Tier | ""); setPage(1); }} aria-label="Filtrar por nível" className={`${INPUT} w-auto cursor-pointer`}>
            <option value="">Todos os níveis</option>
            {[...TIERS].reverse().map((item) => <option key={item} value={item}>{TIER_META[item].label}</option>)}
          </select>
          <label className="relative">
            <ArrowDownUp className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
            <select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }} aria-label="Ordenar" className={`${INPUT} w-auto cursor-pointer pl-8`}>
              {SORTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="flex cursor-pointer items-center gap-2 px-1 text-xs text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={includeAll} onChange={(event) => { setIncludeAll(event.target.checked); setPage(1); }} className="h-4 w-4 cursor-pointer accent-[#002187]" />
            Incluir contatos sem pontos
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="w-12 px-3 py-2 font-semibold">#</th>
                <th className="px-3 py-2 font-semibold">Cliente</th>
                <th className="px-3 py-2 font-semibold">Nível</th>
                <th className="px-3 py-2 font-semibold">RFV-P</th>
                <th className="px-3 py-2 text-right font-semibold">Pontos</th>
                <th className="px-3 py-2 font-semibold">Última atividade</th>
                <th className="px-3 py-2 font-semibold">Histórico recente</th>
                <th className="px-3 py-2 text-right font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <tr><td colSpan={8} className="px-3 py-10 text-center text-xs text-slate-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
              ) : !data?.contacts.length ? (
                <tr><td colSpan={8} className="px-3 py-10 text-center text-xs text-slate-500 dark:text-slate-400">Nenhum cliente com pontuação{query || tier ? " nesse filtro" : " ainda"}. As automações de Lead Score somam pontos a cada evento.</td></tr>
              ) : data.contacts.map((row, index) => (
                <tr key={row.id} className="border-b border-slate-50 align-top last:border-0 hover:bg-slate-50/60 dark:border-slate-800/60 dark:hover:bg-white/5">
                  <td className="px-3 py-2.5 text-xs font-bold text-slate-400">{(data.page - 1) * data.pageSize + index + 1}</td>
                  <td className="min-w-0 px-3 py-2.5">
                    <p className="max-w-[220px] truncate font-semibold text-[#051647] dark:text-white">{row.name}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{[row.phone, row.city].filter(Boolean).join(" · ") || "—"}</p>
                  </td>
                  <td className="px-3 py-2.5"><TierBadge tier={row.tier} /></td>
                  <td className="px-3 py-2.5"><div className="flex min-w-0 flex-col items-start gap-1"><RfvpBadge code={row.rfvpCode} segment={row.rfvpSegment} /><RfvpSegmentChip segment={row.rfvpSegment} /></div></td>
                  <td className="px-3 py-2.5 text-right font-bold text-[#051647] dark:text-white">{row.score.toLocaleString("pt-BR")}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300">{when(row.lastActivity)}</td>
                  <td className="px-3 py-2.5">
                    {row.logs.length ? (
                      <ul className="max-w-[280px] space-y-0.5">
                        {row.logs.map((log) => (
                          <li key={log.id} className="flex min-w-0 gap-1.5 text-[11px]">
                            <span className={`shrink-0 font-bold ${log.delta >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-red-600 dark:text-red-300"}`}>{log.delta > 0 ? "+" : ""}{log.delta}</span>
                            <span className="min-w-0 truncate text-slate-500 dark:text-slate-400" title={log.reason}>{log.reason || "Ajuste"}</span>
                          </li>
                        ))}
                      </ul>
                    ) : <span className="text-[11px] text-slate-400">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-1">
                      <button type="button" onClick={() => setAdjusting(row)} title="Ajustar pontos" aria-label={`Ajustar pontos de ${row.name}`} className="cursor-pointer rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-[#002187] dark:hover:bg-white/10 dark:hover:text-[#C4D600]"><Gauge className="h-4 w-4" /></button>
                      <Link href={`/contatos?busca=${encodeURIComponent(row.phone?.replace(/^55/, "") || row.name)}`} title="Abrir contato" aria-label={`Abrir contato ${row.name}`} className="cursor-pointer rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-[#002187] dark:hover:bg-white/10 dark:hover:text-[#C4D600]"><ExternalLink className="h-4 w-4" /></Link>
                      {row.conversationId ? (
                        <Link href={`/chat?c=${row.conversationId}`} title="Abrir conversa" aria-label={`Abrir conversa com ${row.name}`} className="cursor-pointer rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-[#002187] dark:hover:bg-white/10 dark:hover:text-[#C4D600]"><MessageSquare className="h-4 w-4" /></Link>
                      ) : <span className="p-1.5 text-slate-200 dark:text-slate-700" title="Sem conversa"><MessageSquare className="h-4 w-4" /></span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <span>{data ? `${data.total.toLocaleString("pt-BR")} cliente(s)` : ""}{loading && data ? " · atualizando..." : ""}</span>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1} aria-label="Página anterior" className="cursor-pointer rounded-lg p-1.5 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/10"><ChevronLeft className="h-4 w-4" /></button>
            <span>{page} / {pages}</span>
            <button type="button" onClick={() => setPage((value) => Math.min(pages, value + 1))} disabled={page >= pages} aria-label="Próxima página" className="cursor-pointer rounded-lg p-1.5 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/10"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      {editingThresholds && data && <ThresholdsDialog current={data.thresholds} onClose={() => setEditingThresholds(false)} onSaved={() => { setEditingThresholds(false); void load(); }} />}
      {adjusting && <AdjustDialog row={adjusting} onClose={() => setAdjusting(null)} onSaved={() => { setAdjusting(null); void load(); }} />}
      {linksOpen && <LinksDialog onClose={() => setLinksOpen(false)} />}
    </div>
  );
}

/** Faixas dos níveis: pontuação mínima de Prata, Ouro e Diamante (Bronze = abaixo de Prata). */
function ThresholdsDialog({ current, onClose, onSaved }: { current: TierThresholds; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string>>({ PRATA: String(current.PRATA), OURO: String(current.OURO), DIAMANTE: String(current.DIAMANTE) });
  const [saving, setSaving] = useState(false);
  const problems = thresholdProblems(Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value === "" ? NaN : Number(value)])));
  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/scoring", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ thresholds: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Number(value)])) }) });
      const body = (await response.json().catch(() => ({}))) as { error?: string; moved?: number };
      if (!response.ok) throw new Error(body.error ?? "Não foi possível salvar.");
      toast.success("Faixas salvas", body.moved ? `${body.moved} cliente(s) mudaram de nível.` : "Nenhum cliente mudou de nível.");
      onSaved();
    } catch (error) {
      toast.error("Faixas dos níveis", error instanceof Error ? error.message : "Tente de novo.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <EntityDialog titleId="faixas-niveis" title="Faixas dos níveis" description="Pontuação mínima de cada nível. Ao salvar, todos os clientes são reclassificados na hora." onClose={onClose} size="md">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
          <TierBadge tier="BRONZE" size="md" />
          <span className="text-xs text-slate-500 dark:text-slate-400">abaixo de Prata</span>
        </div>
        {(["PRATA", "OURO", "DIAMANTE"] as const).map((key) => (
          <label key={key} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
            <TierBadge tier={key} size="md" />
            <span className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">a partir de<input type="number" min={0} value={values[key]} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} aria-label={`Pontuação mínima ${TIER_META[key].label}`} className={`${INPUT} w-28 text-right`} />pts</span>
          </label>
        ))}
        {problems.length > 0 && <p role="alert" className="text-xs text-red-600">{problems[0]}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 cursor-pointer rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/5">Cancelar</button>
          <button type="button" onClick={() => void save()} disabled={saving || problems.length > 0} className="h-9 cursor-pointer rounded-lg bg-[#C4D600] px-4 text-sm font-semibold text-[#051647] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">{saving ? "Salvando..." : "Salvar faixas"}</button>
        </div>
      </div>
    </EntityDialog>
  );
}

/** Ajuste manual de pontos (+/−) com motivo: vai para o histórico como ajuste da equipe. */
function AdjustDialog({ row, onClose, onSaved }: { row: Row; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const valid = Number.isInteger(Number(delta)) && Number(delta) !== 0 && reason.trim().length > 0;
  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/scoring/${row.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ delta: Number(delta), reason }) });
      const body = (await response.json().catch(() => ({}))) as { error?: string; change?: { score: number; tier: string } };
      if (!response.ok || !body.change) throw new Error(body.error ?? "Não foi possível ajustar.");
      toast.success("Pontos ajustados", `${row.name}: ${body.change.score} pts (${TIER_META[body.change.tier as Tier]?.label ?? body.change.tier})`);
      onSaved();
    } catch (error) {
      toast.error("Ajustar pontos", error instanceof Error ? error.message : "Tente de novo.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <EntityDialog titleId="ajustar-pontos" title={`Ajustar pontos: ${row.name}`} description={`Saldo atual: ${row.score} pts. Use número negativo para tirar pontos.`} onClose={onClose} size="md">
      <div className="space-y-3">
        <label className="block space-y-1">
          <span className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">Pontos (+ soma, − tira)</span>
          <input type="number" value={delta} onChange={(event) => setDelta(event.target.value)} placeholder="50 ou -20" className={INPUT} />
        </label>
        <label className="block space-y-1">
          <span className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">Motivo</span>
          <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Indicou um amigo" maxLength={200} className={INPUT} />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 cursor-pointer rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/5">Cancelar</button>
          <button type="button" onClick={() => void save()} disabled={!valid || saving} className="h-9 cursor-pointer rounded-lg bg-[#C4D600] px-4 text-sm font-semibold text-[#051647] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">{saving ? "Salvando..." : "Ajustar"}</button>
        </div>
      </div>
    </EntityDialog>
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
