"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarRange, Crown, Gift, Link2, Medal, Pause, Pencil, Play, Plus, RefreshCw, Store, Trophy, Users } from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { SegmentedControl, cardClass } from "@/components/dashboard/DashboardKit";
import { CampaignForm, categoryLabel, type CampaignFormOptions, type CampaignFormValue } from "@/components/campaigns/CampaignForm";
import { brl, ruleSummary, scopeLabel, type Participant, type Standings } from "@/lib/sales-campaigns-shared";

type CampaignItem = CampaignFormValue & { id: string; evaluatedAt: string | null; total: number | null; achievements: number; rewardTotal: number };
type Achievement = { id: string; participantType: string; participantName: string; tier: number; headline: string; rewardLabel: string; rewardAmount: number; achievedAt: string; notified: number };
type Detail = { campaign: CampaignItem; standings: Standings; achievements: Achievement[] };
type Options = CampaignFormOptions & { users: { id: string; name: string }[]; sellers: { id: string; name: string; storeNumber: number | null; userId: string | null }[] };
type Tab = "painel" | "vinculos";

const dateBr = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
const units = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

function status(campaign: CampaignItem) {
  const now = today();
  if (!campaign.active) return { label: "Pausada", tone: "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400" };
  if (now < campaign.startDate) return { label: "Agendada", tone: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" };
  if (now > campaign.endDate) return { label: "Encerrada", tone: "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300" };
  return { label: "Em andamento", tone: "bg-[#C4D600]/20 text-[#5d6600] dark:text-[#C4D600]" };
}

/** /vendas/campanhas: campanhas comerciais com premiação, ranking ao vivo (VMSet) e histórico de prêmios. */
export default function SalesCampaignsPage() {
  const toast = useToast();
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [options, setOptions] = useState<Options>({ brands: [], categories: [], stores: [], users: [], sellers: [] });
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [form, setForm] = useState<{ initial?: CampaignFormValue } | null>(null);
  const [tab, setTab] = useState<Tab>("painel");
  const [error, setError] = useState("");

  const loadList = useCallback(async () => {
    try {
      const response = await fetch("/api/vendas/campanhas", { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as { data?: CampaignItem[]; options?: Options; error?: string };
      if (!response.ok || !body.data) throw new Error(body.error ?? "Não foi possível carregar as campanhas.");
      setCampaigns(body.data);
      if (body.options) setOptions(body.options);
      setSelected((current) => current ?? body.data?.[0]?.id ?? null);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar as campanhas.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    try {
      const response = await fetch(`/api/vendas/campanhas/${id}`, { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as { data?: Detail; error?: string };
      if (!response.ok || !body.data) throw new Error(body.error ?? "Não foi possível carregar a campanha.");
      setDetail(body.data);
    } catch (cause) {
      toast.error("Campanha", cause instanceof Error ? cause.message : undefined);
    } finally {
      setLoadingDetail(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selected) return;
    void loadDetail(selected);
    // Ranking ao vivo: atualiza a cada 60 s enquanto a tela está aberta.
    const timer = window.setInterval(() => void loadDetail(selected), 60_000);
    return () => window.clearInterval(timer);
  }, [selected, loadDetail]);

  const toggleActive = async (campaign: CampaignItem) => {
    const response = await fetch(`/api/vendas/campanhas/${campaign.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !campaign.active }) });
    if (!response.ok) return toast.error("Não foi possível alterar a campanha");
    toast.success(campaign.active ? "Campanha pausada" : "Campanha reativada");
    await loadList();
    if (selected) await loadDetail(selected);
  };

  const current = detail && detail.campaign.id === selected ? detail : null;
  const metricIsQty = current?.campaign.metric === "QUANTIDADE";
  const fmt = (value: number) => (metricIsQty ? units(value) : brl(value));

  return (
    <main className="w-full min-w-0 space-y-4 px-3 pb-24 pt-4 md:px-6 md:pt-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#F7915E]">Vendas</p>
          <h1 className="text-2xl font-bold tracking-tight text-[#051647] dark:text-white">Campanhas e premiações</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Metas por valor ou quantidade, com prêmio para quem bater. A apuração usa as vendas do VMSET e comemora na tela do vendedor.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl<Tab> label="Seção" value={tab} onChange={setTab} options={[{ value: "painel", label: "Campanhas" }, { value: "vinculos", label: "Vendedores x usuários" }]} />
          <button type="button" onClick={() => setForm({})} className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-[#051647] px-3.5 text-sm font-semibold text-white hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647]">
            <Plus className="h-4 w-4" />Nova campanha
          </button>
        </div>
      </header>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">{error}</p>}

      {tab === "vinculos" ? (
        <SellerLinks options={options} onChanged={loadList} />
      ) : loading ? (
        <div className="flex justify-center py-16"><LoadingSpinner label="Carregando campanhas..." size={32} /></div>
      ) : campaigns.length === 0 ? (
        <div className={`${cardClass} flex flex-col items-center gap-3 p-10 text-center`}>
          <Trophy className="h-10 w-10 text-[#C4D600]" />
          <p className="text-sm text-slate-600 dark:text-slate-300">Nenhuma campanha ainda. Crie a primeira, por exemplo &quot;Foco Stepper: a cada 3 armações = R$ 100 em voucher iFood&quot;.</p>
          <button type="button" onClick={() => setForm({})} className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-[#051647] px-3.5 text-sm font-semibold text-white dark:bg-[#C4D600] dark:text-[#051647]"><Plus className="h-4 w-4" />Nova campanha</button>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
          <ul className="flex min-w-0 gap-2 overflow-x-auto pb-1 xl:flex-col xl:overflow-visible">
            {campaigns.map((campaign) => {
              const badge = status(campaign);
              const active = campaign.id === selected;
              return (
                <li key={campaign.id} className="w-[280px] shrink-0 xl:w-auto">
                  <button type="button" onClick={() => setSelected(campaign.id)} className={`${cardClass} w-full cursor-pointer p-3 text-left transition-colors ${active ? "ring-2 ring-[#C4D600]" : "hover:bg-slate-50 dark:hover:bg-white/[0.03]"}`}>
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0 break-words text-sm font-bold text-[#051647] dark:text-white">{campaign.name}</span>
                      <span className={`shrink-0 rounded-md px-1.5 py-px text-[10px] font-semibold ${badge.tone}`}>{badge.label}</span>
                    </span>
                    <span className="mt-1 block text-[11px] leading-snug text-slate-500 dark:text-slate-400">{ruleSummary(campaign)}</span>
                    <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1"><CalendarRange className="h-3 w-3" />{dateBr(campaign.startDate)} a {dateBr(campaign.endDate)}</span>
                      <span className="inline-flex items-center gap-1"><Gift className="h-3 w-3" />{campaign.achievements} prêmios{campaign.rewardTotal > 0 ? ` · ${brl(campaign.rewardTotal)}` : ""}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <section className="min-w-0 space-y-4">
            {!current ? (
              <div className="flex justify-center py-16"><LoadingSpinner label="Apurando campanha..." size={32} /></div>
            ) : (
              <>
                <div className="rounded-2xl bg-gradient-to-br from-[#07163B] to-[#0D255E] p-4 text-white shadow md:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#C4D600]">{[current.campaign.brand ? scopeLabel({ brand: current.campaign.brand, category: null }) : null, current.campaign.category ? categoryLabel(current.campaign.category) : null].filter(Boolean).join(" · ") || "Todo o catálogo"}</p>
                      <h2 className="mt-0.5 break-words text-xl font-extrabold">{current.campaign.name}</h2>
                      <p className="mt-1 text-sm text-white/75">{ruleSummary(current.campaign)}</p>
                      {current.campaign.description && <p className="mt-1 text-xs text-white/60">{current.campaign.description}</p>}
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <button type="button" onClick={() => void loadDetail(current.campaign.id)} aria-label="Atualizar apuração" title="Atualizar apuração" className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg bg-white/10 hover:bg-white/20"><RefreshCw className={`h-4 w-4 ${loadingDetail ? "animate-spin" : ""}`} /></button>
                      <button type="button" onClick={() => setForm({ initial: current.campaign })} aria-label="Editar campanha" title="Editar" className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg bg-white/10 hover:bg-white/20"><Pencil className="h-4 w-4" /></button>
                      <button type="button" onClick={() => void toggleActive(current.campaign)} aria-label={current.campaign.active ? "Pausar campanha" : "Reativar campanha"} title={current.campaign.active ? "Pausar" : "Reativar"} className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg bg-white/10 hover:bg-white/20">{current.campaign.active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Kpi label={metricIsQty ? "Unidades vendidas" : "Total vendido"} value={fmt(current.standings.total)} />
                    <Kpi label="Prêmios conquistados" value={String(current.achievements.length || current.standings.prizes)} />
                    <Kpi label="Valor em prêmios" value={brl(current.achievements.reduce((sum, item) => sum + item.rewardAmount, 0))} />
                    <Kpi label="Participantes" value={String(current.campaign.audience === "INDIVIDUAL" ? current.standings.sellers.length : current.standings.stores.filter((item) => item.storeNumber !== null).length)} />
                  </div>
                </div>

                {current.standings.groups.length > 0 && (
                  <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                    {current.standings.groups.map((group) => (
                      <div key={group.name} className={`${cardClass} p-4`}>
                        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"><Crown className="h-4 w-4 text-[#F7915E]" />Líder · {group.name}{group.stores.length ? ` (lojas ${group.stores.join(", ")})` : ""}</p>
                        <p className="mt-1 break-words text-lg font-extrabold text-[#051647] dark:text-white">{group.leader?.name ?? "Sem vendas ainda"}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{group.leader ? `${fmt(group.leader.progress)} · grupo soma ${fmt(group.total)}` : "—"}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid gap-4 2xl:grid-cols-2">
                  <Ranking title="Ranking por loja" icon={Store} items={current.standings.stores.filter((item) => item.storeNumber !== null)} fmt={fmt} showPrizes={current.campaign.audience !== "INDIVIDUAL"} />
                  <Ranking title="Ranking por consultor" icon={Users} items={current.standings.sellers} fmt={fmt} showPrizes={current.campaign.audience === "INDIVIDUAL"} />
                </div>

                <div className={`${cardClass} min-w-0 overflow-hidden`}>
                  <p className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-sm font-bold text-[#051647] dark:border-white/5 dark:text-white"><Gift className="h-4 w-4 text-[#F7915E]" />Prêmios conquistados</p>
                  {current.achievements.length === 0 ? (
                    <p className="p-6 text-center text-sm text-slate-500">Ninguém bateu a meta ainda.</p>
                  ) : (
                    <ul className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto dark:divide-white/5">
                      {current.achievements.map((item) => (
                        <li key={item.id} className="flex min-w-0 items-center gap-3 px-4 py-2.5">
                          <Medal className="h-4 w-4 shrink-0 text-[#C4D600]" />
                          <div className="min-w-0 flex-1">
                            <p className="break-words text-sm font-semibold text-slate-800 dark:text-slate-100">{item.participantName} <span className="font-normal text-slate-500">· {item.headline}</span></p>
                            <p className="text-[11px] text-slate-400">{new Date(item.achievedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}{item.notified ? "" : " · sem usuário vinculado para comemorar"}</p>
                          </div>
                          <span className="shrink-0 text-sm font-bold tabular-nums text-[#051647] dark:text-white">{item.rewardAmount > 0 ? brl(item.rewardAmount) : item.rewardLabel}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {form && (
        <CampaignForm
          initial={form.initial}
          options={options}
          onClose={() => setForm(null)}
          onSaved={(id) => {
            setForm(null);
            toast.success(form.initial ? "Campanha atualizada" : "Campanha criada", "A apuração roda a cada minuto com as vendas do VMSET.");
            setSelected(id);
            setTab("painel");
            void loadList();
            void loadDetail(id);
          }}
        />
      )}
    </main>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-white/[0.07] px-3 py-2">
      <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-white/60">{label}</p>
      <p className="truncate text-lg font-extrabold tabular-nums">{value}</p>
    </div>
  );
}

function Ranking({ title, icon: Icon, items, fmt, showPrizes }: { title: string; icon: typeof Store; items: Participant[]; fmt: (value: number) => string; showPrizes: boolean }) {
  const [all, setAll] = useState(false);
  const list = all ? items : items.slice(0, 10);
  return (
    <div className={`${cardClass} min-w-0 overflow-hidden`}>
      <p className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-sm font-bold text-[#051647] dark:border-white/5 dark:text-white"><Icon className="h-4 w-4 text-[#002187] dark:text-[#C4D600]" />{title}</p>
      {items.length === 0 ? (
        <p className="p-6 text-center text-sm text-slate-500">Sem vendas no período.</p>
      ) : (
        <ol className="divide-y divide-slate-100 dark:divide-white/5">
          {list.map((item, index) => (
            <li key={item.key} className="px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${index === 0 ? "bg-[#C4D600] text-[#051647]" : index === 1 ? "bg-slate-300 text-slate-800" : index === 2 ? "bg-[#F7915E] text-white" : "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300"}`}>{index + 1}</span>
                <span className="min-w-0 flex-1 break-words text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {item.name}
                  {item.type === "seller" && item.storeNumber !== null && <span className="ml-1 text-[11px] font-normal text-slate-400">Loja {item.storeNumber}</span>}
                  {item.group && <span className="ml-1 text-[11px] font-normal text-slate-400">· {item.group}</span>}
                </span>
                {showPrizes && item.prizes > 0 && <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[#C4D600]/20 px-1.5 py-px text-[11px] font-bold text-[#5d6600] dark:text-[#C4D600]"><Gift className="h-3 w-3" />{item.prizes}</span>}
                <span className="shrink-0 text-sm font-bold tabular-nums text-[#051647] dark:text-white">{fmt(item.progress)}</span>
              </div>
              <div className="ml-8 mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-[#002187] to-[#C4D600] transition-[width] duration-700" style={{ width: `${item.percent}%` }} />
              </div>
            </li>
          ))}
        </ol>
      )}
      {items.length > 10 && (
        <button type="button" onClick={() => setAll((value) => !value)} className="w-full cursor-pointer border-t border-slate-100 py-2.5 text-xs font-semibold text-[#002187] hover:bg-slate-50 dark:border-white/5 dark:text-[#C4D600] dark:hover:bg-white/5">
          {all ? "Mostrar top 10" : `Ver todos (${items.length})`}
        </button>
      )}
    </div>
  );
}

/** Vendedor do VMSet x usuário do CRM: quem recebe o confete. Ligados pelo nome automaticamente; aqui dá para ajustar. */
function SellerLinks({ options, onChanged }: { options: Options; onChanged: () => Promise<void> }) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const userName = useMemo(() => new Map(options.users.map((user) => [user.id, user.name])), [options.users]);
  const text = query.trim().toLowerCase();
  const list = options.sellers.filter((seller) => (!onlyMissing || !seller.userId) && (!text || seller.name.toLowerCase().includes(text) || (seller.userId && userName.get(seller.userId)?.toLowerCase().includes(text))));
  const linked = options.sellers.filter((seller) => seller.userId).length;

  const link = async (sellerId: string, userId: string) => {
    setSaving(sellerId);
    try {
      const response = await fetch("/api/vendas/campanhas/vinculos", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sellerId, userId: userId || null }) });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Não foi possível salvar.");
      toast.success(userId ? "Vendedor vinculado" : "Vínculo removido");
      await onChanged();
    } catch (cause) {
      toast.error("Vínculo não salvo", cause instanceof Error ? cause.message : undefined);
    } finally {
      setSaving(null);
    }
  };

  return (
    <section className={`${cardClass} min-w-0 overflow-hidden`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-white/5">
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-sm font-bold text-[#051647] dark:text-white"><Link2 className="h-4 w-4 text-[#002187] dark:text-[#C4D600]" />Vendedores x usuários do CRM</span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">{linked} de {options.sellers.length} vinculados · o usuário vinculado recebe o confete e o parabéns quando bater a meta</span>
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"><input type="checkbox" checked={onlyMissing} onChange={(event) => setOnlyMissing(event.target.checked)} className="cursor-pointer accent-[#002187]" />Só sem vínculo</label>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar..." aria-label="Buscar vendedor ou usuário" className="h-9 w-48 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#002187] dark:border-white/10 dark:bg-white/[0.04] dark:text-white" />
        </div>
      </div>
      <ul className="grid divide-y divide-slate-100 dark:divide-white/5 lg:grid-cols-2 lg:divide-y-0">
        {list.map((seller) => (
          <li key={seller.id} className="flex min-w-0 items-center gap-3 px-4 py-2.5 lg:border-b lg:border-slate-100 lg:odd:border-r dark:lg:border-white/5">
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-semibold text-slate-800 dark:text-slate-100">{seller.name}</p>
              <p className="text-[11px] text-slate-400">{seller.storeNumber !== null ? `Loja ${seller.storeNumber}` : "Sem loja"}</p>
            </div>
            <select value={seller.userId ?? ""} disabled={saving === seller.id} onChange={(event) => void link(seller.id, event.target.value)} aria-label={`Usuário do CRM de ${seller.name}`} className={`h-9 w-52 shrink-0 cursor-pointer rounded-xl border px-2 text-sm outline-none dark:bg-white/[0.04] dark:text-white ${seller.userId ? "border-[#C4D600] bg-[#C4D600]/10" : "border-slate-200 bg-white dark:border-white/10"}`}>
              <option value="">Sem usuário</option>
              {options.users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
          </li>
        ))}
      </ul>
      {list.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Nenhum vendedor encontrado.</p>}
    </section>
  );
}
