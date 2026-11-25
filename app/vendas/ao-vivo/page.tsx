"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bar, CartesianGrid, Cell, ComposedChart, Area, AreaChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Activity, BadgeDollarSign, Bell, BellOff, Check, ChevronRight, CreditCard, Expand, Eye, Glasses, Hash, LayoutList, MessageCircle, Minimize, Package, Pencil,
  Receipt, Search, ShoppingBag, Store, Sun, Target, TrendingUp, Trophy, UserRound, Users, WifiOff, X, Zap,
} from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";
import { Avatar, ChartTooltip, FadeGradient, SegmentedControl, cardClass, chartTheme, type Tone } from "@/components/dashboard/DashboardKit";
import { useCrmTheme } from "@/hooks/useCrmTheme";
import {
  KIND_LABEL, crmShare, dayKpis, formatMoney, hourlySeries, isNewSale, mergeOrders, mixByKind, mixByPayment, relativeTime, topSellers,
  type CategoryKind, type HourPoint, type LiveEvent, type LiveOrder, type LiveSnapshot,
} from "@/lib/sales-live/feed";

type Status = "connecting" | "live" | "polling" | "offline";
type MobileTab = "feed" | "rank" | "chart";
type Origin = "all" | "crm" | "top";

const FLASH_MS = 2_500;
const POLL_MS = 15_000;
const SOUND_KEY = "crm_vendas_ao_vivo_alerta";
const GOAL_KEY = "crm_vendas_ao_vivo_meta";
const LIME = "#C4D600";

const KIND_ICON: Record<CategoryKind, React.ElementType> = { sol: Sun, grau: Glasses, lentes: Eye, outros: Package };
const KIND_COLOR: Record<CategoryKind, string> = { sol: "#F7915E", grau: "#002187", lentes: "#0ea5e9", outros: "#94a3b8" };
const PAYMENT_COLORS = ["#002187", LIME, "#F7915E", "#0ea5e9", "#8b5cf6", "#94a3b8", "#64748b"];
const SELLER_TONES: Tone[] = ["indigo", "emerald", "amber", "sky", "violet"];
const MEDALS = ["bg-gradient-to-br from-amber-300 to-amber-500 text-amber-950", "bg-gradient-to-br from-slate-200 to-slate-400 text-slate-800", "bg-gradient-to-br from-orange-300 to-orange-600 text-orange-950"];

const compactMoney = (value: number) => (value >= 1000 ? `R$ ${(value / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : formatMoney(value));
const percent = (value: number) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: value < 10 ? 1 : 0 })}%`;
const brHour = (now: Date) => Number(new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", hour12: false, timeZone: "America/Sao_Paulo" }).format(now)) % 24;

/** Número que sobe suavemente até o novo valor (faturamento a cada venda). */
function useAnimatedNumber(target: number) {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;
    const started = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / 900);
      const eased = 1 - (1 - progress) ** 3;
      const next = from + (target - from) * eased;
      setValue(next);
      fromRef.current = next;
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return value;
}

/** Bipe curto e vibração discreta (só se o alerta estiver ligado). */
function notifySale() {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      const context = new AudioCtx();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.15, context.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.25);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.26);
      oscillator.onended = () => void context.close();
    }
  } catch {
    // Navegador sem áudio: segue só com a vibração.
  }
  navigator.vibrate?.(80);
}

function LivePulse({ className = "bg-emerald-500" }: { className?: string }) {
  return <span className="relative flex h-2 w-2 shrink-0"><span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${className}`} /><span className={`relative inline-flex h-2 w-2 rounded-full ${className}`} /></span>;
}

function StatusPill({ status, updatedAt, now }: { status: Status; updatedAt: string | null; now: Date }) {
  const seconds = updatedAt ? Math.max(0, Math.round((now.getTime() - new Date(updatedAt).getTime()) / 1000)) : null;
  const ago = seconds === null ? "" : seconds < 20 ? "agora" : seconds < 60 ? `há ${seconds} seg` : `há ${Math.floor(seconds / 60)} min`;
  if (status === "offline") return <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300"><WifiOff className="h-3.5 w-3.5" />Sem conexão{ago ? ` · ${ago}` : ""}</span>;
  if (status === "connecting") return <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300"><span className="h-2 w-2 animate-pulse rounded-full bg-slate-400" />Conectando...</span>;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#C4D600]/25 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[#051647] dark:text-[#C4D600]">
      <LivePulse />
      {status === "polling" ? "Ao vivo · econômico" : "Ao vivo"}
      {ago && <span className="font-medium normal-case tracking-normal opacity-70">· {ago}</span>}
    </span>
  );
}

/** Meta diária (salva neste navegador) com edição em 1 clique no lápis. */
function GoalBar({ revenue, goal, onChange }: { revenue: number; goal: number | null; onChange: (value: number | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const pct = goal ? Math.min(100, (revenue / goal) * 100) : 0;
  const save = () => {
    const parsed = Number(draft.replace(/[^\d,]/g, "").replace(",", "."));
    onChange(Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null);
    setEditing(false);
  };
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-2 text-[11px] text-white/70">
        <span className="flex items-center gap-1 font-semibold uppercase tracking-wide"><Target className="h-3.5 w-3.5 text-[#C4D600]" />Meta do dia</span>
        {editing ? (
          <form onSubmit={(event) => { event.preventDefault(); save(); }} className="flex items-center gap-1">
            <input autoFocus inputMode="numeric" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ex.: 80000" aria-label="Valor da meta diária" className="h-7 w-28 rounded-lg border border-white/20 bg-white/10 px-2 text-right text-xs font-semibold tabular-nums text-white outline-none placeholder:text-white/40 focus:border-[#C4D600]" />
            <button type="submit" aria-label="Salvar meta" className="grid h-7 w-7 cursor-pointer place-items-center rounded-lg bg-[#C4D600] text-[#051647]"><Check className="h-4 w-4" /></button>
            <button type="button" onClick={() => setEditing(false)} aria-label="Cancelar" className="grid h-7 w-7 cursor-pointer place-items-center rounded-lg bg-white/10 text-white"><X className="h-4 w-4" /></button>
          </form>
        ) : (
          <button type="button" onClick={() => { setDraft(goal ? String(goal) : ""); setEditing(true); }} title="Editar meta diária" className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-1.5 py-0.5 font-semibold tabular-nums text-white hover:bg-white/10">
            {goal ? formatMoney(goal) : "Definir meta"}<Pencil className="h-3.5 w-3.5 text-white/60" />
          </button>
        )}
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-[#C4D600] to-[#e2f25c] shadow-[0_0_12px_rgba(196,214,0,0.6)] transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
      {goal ? (
        <p className="mt-1.5 flex justify-between text-[11px] tabular-nums text-white/70">
          <span className="font-bold text-[#C4D600]">{percent((revenue / goal) * 100)}</span>
          <span>{revenue >= goal ? "Meta batida!" : `faltam ${formatMoney(goal - revenue)}`}</span>
        </p>
      ) : null}
    </div>
  );
}

function HeroSpark({ data }: { data: HourPoint[] }) {
  return (
    <div className="h-12 md:hidden" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="hero-spark" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={LIME} stopOpacity={0.45} />
              <stop offset="100%" stopColor={LIME} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={[0, "dataMax"]} />
          <Area type="monotone" dataKey="cumulative" stroke={LIME} strokeWidth={2} fill="url(#hero-spark)" dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const HourlyChart = memo(function HourlyChart({ data, currentHour, isDark }: { data: HourPoint[]; currentHour: number; isDark: boolean }) {
  const theme = chartTheme(isDark);
  const bar = isDark ? "#3b5bdb" : "#002187";
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 0, left: -6, bottom: 0 }}>
        <defs>
          <FadeGradient id="hour-bar" color={bar} from={0.9} to={0.35} />
          <FadeGradient id="hour-now" color={LIME} from={1} to={0.55} />
        </defs>
        <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: theme.tick, fontSize: 11 }} dy={6} interval="preserveStartEnd" />
        <YAxis yAxisId="money" axisLine={false} tickLine={false} tick={{ fill: theme.tick, fontSize: 11 }} width={58} tickFormatter={(value: number) => (value >= 1000 ? `${(value / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil` : String(value))} />
        <YAxis yAxisId="orders" orientation="right" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: theme.tick, fontSize: 11 }} width={28} />
        <Tooltip content={<ChartTooltip format={(item) => (item.dataKey === "revenue" ? formatMoney(Number(item.value ?? 0)) : `${item.value} pedidos`)} />} cursor={{ fill: theme.cursor, radius: 8 }} />
        <Bar yAxisId="money" dataKey="revenue" name="Faturamento" radius={[8, 8, 0, 0]} maxBarSize={34} animationDuration={500}>
          {data.map((point) => <Cell key={point.hour} fill={point.hour === currentHour ? "url(#hour-now)" : "url(#hour-bar)"} />)}
        </Bar>
        <Line yAxisId="orders" type="monotone" dataKey="orders" name="Pedidos" stroke="#F7915E" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: isDark ? "#071440" : "#fff" }} animationDuration={600} />
      </ComposedChart>
    </ResponsiveContainer>
  );
});

function KindTag({ kind }: { kind: CategoryKind }) {
  const Icon = KIND_ICON[kind];
  return <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: `${KIND_COLOR[kind]}1f`, color: kind === "grau" ? undefined : KIND_COLOR[kind] }}><Icon className={`h-3 w-3 ${kind === "grau" ? "text-[#002187] dark:text-[#8fa6ff]" : ""}`} /><span className={kind === "grau" ? "text-[#002187] dark:text-[#8fa6ff]" : ""}>{KIND_LABEL[kind]}</span></span>;
}

function SaleCard({ order, now, arrivedAt, onOpen }: { order: LiveOrder; now: Date; arrivedAt?: number; onOpen: () => void }) {
  const isNew = isNewSale(order, now, arrivedAt);
  const flash = arrivedAt !== undefined && now.getTime() - arrivedAt < FLASH_MS;
  return (
    <li className={`min-w-0 ${flash ? "sale-flash rounded-2xl" : ""}`}>
      <button type="button" onClick={onOpen} className={`group relative flex w-full min-w-0 cursor-pointer items-stretch gap-3 rounded-2xl border bg-white p-3.5 text-left shadow-sm transition-all duration-500 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99] dark:bg-white/[0.03] ${isNew ? "border-[#C4D600] ring-2 ring-[#C4D600]/40" : "border-slate-200/80 hover:border-slate-300 dark:border-white/[0.07]"}`}>
        <span className={`w-1 shrink-0 rounded-full ${order.fromCrm ? "bg-[#C4D600]" : "bg-[#002187]/20 dark:bg-white/10"}`} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="text-xl font-bold tabular-nums tracking-tight text-[#051647] dark:text-white">{formatMoney(order.amount)}</span>
              {isNew && <span className="inline-flex items-center gap-1 rounded-full bg-[#C4D600] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[#051647] shadow animate-pulse"><Zap className="h-3 w-3" />Nova venda</span>}
            </span>
            <span className="shrink-0 pt-1 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">{relativeTime(order.at, now, order.time)}</span>
          </span>
          <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
            <span className="flex min-w-0 items-center gap-1 font-semibold text-[#002187] dark:text-[#C4D600]"><Store className="h-3.5 w-3.5 shrink-0" /><span className="min-w-0 break-words">{order.storeLabel}</span></span>
            {order.seller && <span className="flex min-w-0 items-center gap-1 text-slate-500 dark:text-slate-400"><UserRound className="h-3.5 w-3.5 shrink-0" /><span className="break-words">{order.seller}</span></span>}
          </span>
          <span className="mt-1 block min-w-0 break-words text-sm text-slate-700 dark:text-slate-200">{order.summary}<span className="text-slate-400"> · {order.items} {order.items === 1 ? "item" : "itens"}</span></span>
          <span className="mt-2 flex flex-wrap items-center gap-1.5">
            {(order.kinds ?? []).map((kind) => <KindTag key={kind} kind={kind} />)}
            {order.payment && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300">{order.payment}</span>}
            {order.fromCrm && <span className="inline-flex items-center gap-1 rounded-md bg-[#C4D600]/20 px-1.5 py-0.5 text-[10px] font-bold text-[#051647] dark:text-[#C4D600]"><MessageCircle className="h-3 w-3" />Via WhatsApp / CRM</span>}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 self-center text-slate-300 transition-transform group-hover:translate-x-0.5 dark:text-slate-600" />
      </button>
    </li>
  );
}

function OrderDrawer({ order, now, onClose }: { order: LiveOrder; now: Date; onClose: () => void }) {
  return (
    <EntityDialog
      titleId="venda-detalhe"
      title={`Pedido ${order.order}`}
      description={order.storeLabel}
      onClose={onClose}
      size="sheet"
      header={
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"><Hash className="h-3.5 w-3.5" />Pedido {order.order} · {relativeTime(order.at, now, order.time)}</p>
          <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-[#051647] dark:text-white">{formatMoney(order.amount)}</p>
          <p className="mt-0.5 flex min-w-0 items-center gap-1 text-sm font-semibold text-[#002187] dark:text-[#C4D600]"><Store className="h-4 w-4 shrink-0" /><span className="break-words">{order.storeLabel}</span></p>
        </div>
      }
    >
      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-2 text-xs">
          {[
            { icon: UserRound, label: "Vendedor", value: order.seller ?? "Não informado" },
            { icon: CreditCard, label: "Pagamento", value: order.payment ?? "Não informado" },
            { icon: Users, label: "Cliente", value: order.customer ?? "Não informado" },
            { icon: ShoppingBag, label: "Itens", value: `${order.items} ${order.items === 1 ? "item" : "itens"}` },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="min-w-0 rounded-xl bg-slate-50 p-2.5 dark:bg-white/[0.04]">
              <dt className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400"><Icon className="h-3 w-3" />{label}</dt>
              <dd className="mt-0.5 break-words font-semibold text-slate-800 dark:text-slate-100">{value}</dd>
            </div>
          ))}
        </dl>
        <section>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Produtos do pedido</h3>
          {order.lines?.length ? (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200/80 dark:divide-white/5 dark:border-white/[0.07]">
              {order.lines.map((line, index) => (
                <li key={index} className="flex min-w-0 items-start justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold text-slate-800 dark:text-slate-100">{line.label}{line.quantity > 1 && <span className="font-normal text-slate-400"> · {line.quantity}x</span>}</p>
                    {line.description && <p className="break-words text-xs text-slate-500 dark:text-slate-400">{line.description}</p>}
                    <div className="mt-1"><KindTag kind={line.kind} /></div>
                  </div>
                  <p className="shrink-0 text-sm font-bold tabular-nums text-[#051647] dark:text-white">{formatMoney(line.amount)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed border-slate-200 p-3 text-sm text-slate-500 dark:border-white/10">{order.summary}</p>
          )}
        </section>
        {order.fromCrm ? (
          order.conversationId ? (
            <Link href={`/chat?c=${order.conversationId}`} className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#051647] px-4 py-3 text-sm font-semibold text-white shadow hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647]">
              <MessageCircle className="h-4 w-4" />Abrir conversa do cliente no chat
            </Link>
          ) : (
            <p className="flex items-center gap-2 rounded-xl bg-[#C4D600]/15 p-3 text-xs font-semibold text-[#051647] dark:text-[#C4D600]"><MessageCircle className="h-4 w-4" />Cliente atendido pelo CRM / WhatsApp nos últimos 30 dias.</p>
          )
        ) : null}
      </div>
    </EntityDialog>
  );
}

function SectionTitle({ icon: Icon, title, hint, children }: { icon: React.ElementType; title: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400"><Icon className="h-4 w-4 text-[#F7915E]" />{title}</h2>
        {hint && <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function MixBars({ slices, colorOf }: { slices: { key: string; label: string; amount: number; orders: number }[]; colorOf: (key: string, index: number) => string }) {
  const total = slices.reduce((sum, slice) => sum + slice.amount, 0) || 1;
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/5">
        {slices.map((slice, index) => <span key={slice.key} className="h-full transition-[width] duration-700" style={{ width: `${(slice.amount / total) * 100}%`, backgroundColor: colorOf(slice.key, index) }} />)}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-1.5">
        {slices.map((slice, index) => (
          <li key={slice.key} className="inline-flex min-w-0 items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1 text-[11px] dark:bg-white/[0.04]">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colorOf(slice.key, index) }} />
            <span className="font-medium text-slate-700 dark:text-slate-200">{slice.label}</span>
            <span className="font-bold tabular-nums text-[#051647] dark:text-white">{percent((slice.amount / total) * 100)}</span>
            <span className="tabular-nums text-slate-400">{compactMoney(slice.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** /vendas/ao-vivo: War Room da Black Friday (vendas faturadas no VMSet entrando em tempo real). */
export default function LiveSalesPage() {
  const { isDark } = useCrmTheme();
  const [orders, setOrders] = useState<LiveOrder[]>([]);
  const [stores, setStores] = useState<LiveSnapshot["stores"]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [error, setError] = useState("");
  const [store, setStore] = useState("");
  const [origin, setOrigin] = useState<Origin>("all");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<MobileTab>("feed");
  const [sound, setSound] = useState(false);
  const [goal, setGoal] = useState<number | null>(null);
  const [arrived, setArrived] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [fullscreen, setFullscreen] = useState(false);
  const soundRef = useRef(false);
  const loadedRef = useRef(false);
  const ordersRef = useRef<LiveOrder[]>([]);

  useEffect(() => {
    const stored = window.localStorage.getItem(SOUND_KEY) === "1";
    const storedGoal = Number(window.localStorage.getItem(GOAL_KEY) ?? "");
    soundRef.current = stored;
    const timer = window.setTimeout(() => {
      setSound(stored);
      setGoal(Number.isFinite(storedGoal) && storedGoal > 0 ? storedGoal : null);
    }, 0);
    const clock = window.setInterval(() => setNow(new Date()), 1000);
    const onFullscreen = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(clock);
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
  }, []);

  useEffect(() => {
    let source: EventSource | null = null;
    let poll: number | null = null;
    let reconnect: number | null = null;
    let closed = false;

    const apply = (incoming: LiveOrder[], replace: boolean, meta: { updatedAt: string; stores: LiveSnapshot["stores"] }) => {
      const base = replace ? ordersRef.current.filter((order) => incoming.some((item) => item.key === order.key)) : ordersRef.current;
      const { orders: merged, fresh: added } = mergeOrders(base, incoming);
      ordersRef.current = merged;
      setOrders(merged);
      setStores(meta.stores);
      setUpdatedAt(meta.updatedAt);
      setError("");
      // A primeira carga não é "nova venda": só o que entra depois de abrir a tela pisca e toca.
      if (loadedRef.current && added.length) {
        const stamp = Date.now();
        setArrived((current) => ({ ...Object.fromEntries(Object.entries(current).filter(([, at]) => stamp - at < 15 * 60_000)), ...Object.fromEntries(added.map((key) => [key, stamp])) }));
        // Venda antiga que chega atrasada no VMSet não toca o alerta.
        const recent = merged.some((order) => added.includes(order.key) && isNewSale(order, stamp, stamp));
        if (soundRef.current && recent) notifySale();
      }
      loadedRef.current = true;
    };

    const fetchSnapshot = async () => {
      try {
        const response = await fetch("/api/vendas/ao-vivo", { cache: "no-store" });
        const body = (await response.json().catch(() => ({}))) as { data?: LiveSnapshot; error?: string };
        if (!response.ok || !body.data) throw new Error(body.error ?? "Não foi possível carregar as vendas.");
        apply(body.data.orders, true, body.data);
        setStatus((current) => (current === "live" ? current : "polling"));
      } catch (cause) {
        setStatus("offline");
        setError(cause instanceof Error ? cause.message : "Sem conexão.");
      }
    };

    const startPolling = () => {
      if (poll !== null) return;
      void fetchSnapshot();
      poll = window.setInterval(() => void fetchSnapshot(), POLL_MS);
    };
    const stopPolling = () => {
      if (poll !== null) window.clearInterval(poll);
      poll = null;
    };

    const connect = () => {
      if (closed) return;
      source?.close();
      source = new EventSource("/api/vendas/ao-vivo/stream");
      source.addEventListener("snapshot", (event) => {
        const data = JSON.parse((event as MessageEvent<string>).data) as Extract<LiveEvent, { type: "snapshot" }>;
        stopPolling();
        setStatus("live");
        apply(data.snapshot.orders, true, data.snapshot);
      });
      source.addEventListener("orders", (event) => {
        const data = JSON.parse((event as MessageEvent<string>).data) as Extract<LiveEvent, { type: "orders" }>;
        stopPolling();
        setStatus("live");
        apply(data.orders, false, data);
      });
      source.onerror = () => {
        // Rede móvel instável: segue por consulta leve a cada 15 s e tenta o canal ao vivo de novo em 30 s.
        source?.close();
        source = null;
        startPolling();
        if (reconnect === null) reconnect = window.setTimeout(() => { reconnect = null; connect(); }, 30_000);
      };
    };

    connect();
    const onVisible = () => {
      if (document.visibilityState === "visible" && !source) connect();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      closed = true;
      source?.close();
      stopPolling();
      if (reconnect !== null) window.clearTimeout(reconnect);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const currentHour = brHour(now);
  const scoped = useMemo(() => (store ? orders.filter((order) => order.store === store) : orders), [orders, store]);
  const kpis = useMemo(() => dayKpis(scoped), [scoped]);
  const allKpis = useMemo(() => dayKpis(orders), [orders]);
  const allStores = useMemo(() => {
    const byStore = new Map<string, { amount: number; orders: number }>();
    for (const order of orders) {
      const entry = byStore.get(order.store) ?? { amount: 0, orders: 0 };
      entry.amount += order.amount;
      entry.orders += 1;
      byStore.set(order.store, entry);
    }
    return stores.map((item) => ({ ...item, ...(byStore.get(item.store) ?? { amount: 0, orders: 0 }) })).sort((a, b) => b.amount - a.amount || b.orders - a.orders);
  }, [orders, stores]);
  const crm = useMemo(() => crmShare(scoped), [scoped]);
  const hourly = useMemo(() => hourlySeries(scoped, currentHour), [scoped, currentHour]);
  const sellers = useMemo(() => topSellers(scoped, 5), [scoped]);
  const kindMix = useMemo(() => mixByKind(scoped), [scoped]);
  const paymentMix = useMemo(() => mixByPayment(scoped), [scoped]);
  const topStoreKeys = useMemo(() => new Set(allStores.slice(0, 3).map((item) => item.store)), [allStores]);
  const feed = useMemo(() => {
    const text = query.trim().toLowerCase();
    return scoped.filter((order) => {
      if (origin === "crm" && !order.fromCrm) return false;
      if (origin === "top" && !topStoreKeys.has(order.store)) return false;
      if (!text) return true;
      return [order.storeLabel, order.seller, order.summary, order.order, order.customer, order.payment].some((value) => value?.toLowerCase().includes(text));
    });
  }, [scoped, origin, query, topStoreKeys]);
  const revenue = useAnimatedNumber(kpis.revenue);
  const peak = hourly.reduce<HourPoint | null>((best, point) => (point.revenue > (best?.revenue ?? 0) ? point : best), null);
  const nowPoint = hourly.find((point) => point.hour === currentHour);
  const prevPoint = hourly.find((point) => point.hour === currentHour - 1);
  const selectedOrder = selected ? orders.find((order) => order.key === selected) ?? null : null;
  const storeLabel = store ? stores.find((item) => item.store === store)?.storeLabel ?? "" : "";
  const newCount = scoped.filter((order) => isNewSale(order, now, arrived[order.key])).length;

  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    soundRef.current = next;
    window.localStorage.setItem(SOUND_KEY, next ? "1" : "0");
    if (next) notifySale();
  };
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };
  const saveGoal = (value: number | null) => {
    setGoal(value);
    if (value) window.localStorage.setItem(GOAL_KEY, String(value));
    else window.localStorage.removeItem(GOAL_KEY);
  };
  const mobileOnly = (value: MobileTab) => (tab === value ? "" : "max-md:hidden");
  const iconButton = "grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-xl border transition-colors";
  const pill = (active: boolean) => `inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs font-semibold transition-colors ${active ? "bg-[#051647] text-white shadow-sm dark:bg-[#C4D600] dark:text-[#051647]" : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:text-white"}`;

  return (
    <main className="w-full min-w-0 space-y-4 px-3 pb-16 md:px-6 md:pb-10">
      <header className="sticky top-0 z-30 -mx-3 space-y-2.5 border-b border-slate-200/60 bg-white/85 px-3 pb-2.5 pt-3 backdrop-blur-xl dark:border-white/5 dark:bg-[#051647]/85 md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:pt-5 md:backdrop-blur-none md:dark:bg-transparent">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#F7915E]">Black Friday · War Room</p>
            <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-[#051647] dark:text-white md:text-2xl">Vendas ao vivo</h1>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="max-sm:hidden"><StatusPill status={status} updatedAt={updatedAt} now={now} /></span>
            <button type="button" onClick={toggleSound} aria-pressed={sound} title={sound ? "Desligar alerta de nova venda" : "Ligar alerta (som e vibração) a cada nova venda"} className={`${iconButton} ${sound ? "border-[#C4D600] bg-[#C4D600]/20 text-[#051647] dark:text-[#C4D600]" : "border-slate-200 text-slate-500 hover:text-slate-800 dark:border-white/10 dark:text-slate-400"}`}>
              {sound ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
            </button>
            <button type="button" onClick={toggleFullscreen} title={fullscreen ? "Sair da tela cheia" : "Tela cheia"} className={`${iconButton} border-slate-200 text-slate-500 hover:text-slate-800 dark:border-white/10 dark:text-slate-400`}>
              {fullscreen ? <Minimize className="h-5 w-5" /> : <Expand className="h-5 w-5" />}
            </button>
          </div>
        </div>
        <div className="sm:hidden"><StatusPill status={status} updatedAt={updatedAt} now={now} /></div>
        <nav aria-label="Filtrar por loja" className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0">
          <button type="button" onClick={() => setStore("")} className={pill(!store)}><Store className="h-3.5 w-3.5" />Todas</button>
          {allStores.map((item) => (
            <button key={item.store} type="button" onClick={() => setStore(store === item.store ? "" : item.store)} className={pill(store === item.store)}>
              {item.storeLabel.replace(/^Loja /, "")}
              {item.orders > 0 && <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${store === item.store ? "bg-white/20" : "bg-slate-100 dark:bg-white/10"}`}>{item.orders}</span>}
            </button>
          ))}
        </nav>
      </header>

      {error && status === "offline" && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">{error}</p>}

      <div className="grid min-w-0 gap-4 lg:grid-cols-12">
        <section className="relative min-w-0 overflow-hidden rounded-3xl bg-gradient-to-br from-[#07163B] via-[#0a1d4d] to-[#0D255E] p-5 text-white shadow-xl lg:col-span-5 lg:p-6">
          <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(196,214,0,0.28),transparent_65%)]" aria-hidden />
          <div className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(0,33,135,0.55),transparent_70%)]" aria-hidden />
          <div className="relative">
            <div className="flex items-center justify-between gap-2">
              <p className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/70"><BadgeDollarSign className="h-4 w-4 shrink-0 text-[#C4D600]" /><span className="truncate">Faturamento {store ? storeLabel : "do dia"}</span></p>
              {newCount > 0 && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#C4D600] px-2 py-0.5 text-[10px] font-extrabold uppercase text-[#051647]"><Zap className="h-3 w-3" />{newCount} {newCount === 1 ? "nova" : "novas"}</span>}
            </div>
            <p className="mt-1 text-[2.6rem] font-extrabold leading-none tabular-nums tracking-tight text-white sm:text-5xl xl:text-6xl">{formatMoney(revenue)}</p>
            {store && allKpis.revenue > 0 && <p className="mt-1.5 text-xs text-white/70"><span className="font-bold text-[#C4D600]">{percent((kpis.revenue / allKpis.revenue) * 100)}</span> do faturamento total ({formatMoney(allKpis.revenue)})</p>}
            {!store && <GoalBar revenue={kpis.revenue} goal={goal} onChange={saveGoal} />}
            <div className="mt-3"><HeroSpark data={hourly} /></div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="min-w-0 rounded-2xl bg-white/[0.07] p-2.5 ring-1 ring-white/10 sm:p-3">
                <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-white/60"><ShoppingBag className="h-3.5 w-3.5 shrink-0" />Pedidos</p>
                <p className="mt-0.5 text-xl font-bold tabular-nums sm:text-2xl">{kpis.orders}</p>
              </div>
              <div className="min-w-0 rounded-2xl bg-white/[0.07] p-2.5 ring-1 ring-white/10 sm:p-3">
                <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-white/60"><Receipt className="h-3.5 w-3.5 shrink-0" />Ticket</p>
                <p className="mt-0.5 truncate text-xl font-bold tabular-nums sm:text-2xl">{kpis.orders ? compactMoney(kpis.ticket) : "—"}</p>
              </div>
              <div className="min-w-0 rounded-2xl bg-[#C4D600]/15 p-2.5 ring-1 ring-[#C4D600]/30 sm:p-3">
                <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-[#C4D600]"><MessageCircle className="h-3.5 w-3.5 shrink-0" />WhatsApp</p>
                <p className="mt-0.5 text-xl font-bold tabular-nums sm:text-2xl">{percent(crm.revenuePct)}</p>
                <p className="truncate text-[10px] tabular-nums text-white/60">{compactMoney(crm.revenue)} · {crm.orders} ped.</p>
              </div>
            </div>
          </div>
        </section>

        <section className={`${cardClass} flex min-w-0 flex-col p-4 lg:col-span-7 lg:p-5 ${mobileOnly("chart")}`}>
          <SectionTitle icon={Activity} title="Ritmo hora a hora" hint="Barras: faturamento por hora · linha: pedidos · hora atual em verde">
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              {peak && <span className="inline-flex items-center gap-1 rounded-lg bg-[#F7915E]/15 px-2 py-1 font-semibold text-[#c25a26] dark:text-[#F7915E]"><TrendingUp className="h-3.5 w-3.5" />Pico {peak.label} · {compactMoney(peak.revenue)}</span>}
              {nowPoint && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-[#C4D600]/20 px-2 py-1 font-semibold text-[#051647] dark:text-[#C4D600]">
                  <LivePulse className="bg-[#9aa800] dark:bg-[#C4D600]" />Agora {nowPoint.label} · {compactMoney(nowPoint.revenue)}
                  {prevPoint && prevPoint.revenue > 0 && <span className="opacity-70">({nowPoint.revenue >= prevPoint.revenue ? "+" : ""}{percent(((nowPoint.revenue - prevPoint.revenue) / prevPoint.revenue) * 100)} vs {prevPoint.label})</span>}
                </span>
              )}
            </div>
          </SectionTitle>
          <div className="h-[240px] min-w-0 lg:h-auto lg:min-h-[260px] lg:flex-1">
            <HourlyChart data={hourly} currentHour={currentHour} isDark={isDark} />
          </div>
        </section>
      </div>

      <div className="md:hidden">
        <SegmentedControl<MobileTab> label="Seções" value={tab} onChange={setTab} options={[{ value: "feed", label: "Feed ao vivo" }, { value: "rank", label: "Lojas & vendedores" }, { value: "chart", label: "Hora a hora" }]} />
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-12">
        <section aria-live="polite" className={`${cardClass} min-w-0 p-3 sm:p-4 lg:col-span-7 lg:p-5 ${mobileOnly("feed")}`}>
          <SectionTitle icon={LayoutList} title={`Feed de vendas${storeLabel ? ` · ${storeLabel}` : ""}`} hint={`${feed.length} ${feed.length === 1 ? "pedido" : "pedidos"} · toque para ver os detalhes`} />
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none]">
              <button type="button" onClick={() => setOrigin("all")} className={pill(origin === "all")}>Todas</button>
              <button type="button" onClick={() => setOrigin("crm")} className={pill(origin === "crm")}><MessageCircle className="h-3.5 w-3.5" />Via WhatsApp/CRM</button>
              <button type="button" onClick={() => setOrigin("top")} className={pill(origin === "top")}><Trophy className="h-3.5 w-3.5" />Top lojas</button>
            </div>
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar loja, vendedor, marca, pedido..." aria-label="Buscar vendas" className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 outline-none focus:border-[#002187] dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100" />
            </label>
          </div>
          {status === "connecting" && orders.length === 0 ? (
            <ul className="space-y-2.5">{[0, 1, 2, 3].map((index) => <li key={index} className="h-[104px] animate-pulse rounded-2xl bg-slate-100 dark:bg-white/[0.04]" />)}</ul>
          ) : feed.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400 dark:border-white/10">{scoped.length ? "Nenhuma venda com esse filtro." : `Nenhuma venda faturada hoje${store ? " nesta loja" : ""} ainda.`}</p>
          ) : (
            <ul className="custom-scrollbar space-y-2.5 lg:max-h-[760px] lg:overflow-y-auto lg:pr-1">
              {feed.slice(0, 150).map((order) => <SaleCard key={order.key} order={order} now={now} arrivedAt={arrived[order.key]} onOpen={() => setSelected(order.key)} />)}
            </ul>
          )}
        </section>

        <aside className={`min-w-0 space-y-4 lg:col-span-5 ${mobileOnly("rank")}`}>
          <section className={`${cardClass} p-4 lg:p-5`}>
            <SectionTitle icon={Trophy} title="Top lojas do dia" hint="Toque para filtrar o painel pela loja" />
            {allKpis.topStores.length === 0 ? (
              <p className="text-sm text-slate-400">Sem vendas ainda.</p>
            ) : (
              <ol className="space-y-2">
                {allStores.filter((item) => item.orders > 0).slice(0, 8).map((item, index) => {
                  const share = allKpis.revenue ? (item.amount / allKpis.revenue) * 100 : 0;
                  const active = store === item.store;
                  return (
                    <li key={item.store}>
                      <button type="button" onClick={() => setStore(active ? "" : item.store)} className={`w-full cursor-pointer rounded-xl p-2 text-left transition-colors ${active ? "bg-[#C4D600]/15 ring-1 ring-[#C4D600]/50" : "hover:bg-slate-50 dark:hover:bg-white/[0.04]"}`}>
                        <span className="flex items-center gap-2.5">
                          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-extrabold shadow-sm ${MEDALS[index] ?? "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300"}`}>{index + 1}</span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2 text-sm">
                              <span className="min-w-0 break-words font-semibold text-slate-800 dark:text-slate-100">{item.storeLabel}</span>
                              <span className="shrink-0 font-bold tabular-nums text-[#051647] dark:text-white">{formatMoney(item.amount)}</span>
                            </span>
                            <span className="mt-1 flex items-center gap-2">
                              <span className="block h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/5">
                                <span className={`block h-full rounded-full transition-[width] duration-700 ${index === 0 ? "bg-gradient-to-r from-[#C4D600] to-[#9fb000]" : "bg-gradient-to-r from-[#002187] to-[#3b5bdb]"}`} style={{ width: `${(item.amount / (allStores[0]?.amount || 1)) * 100}%` }} />
                              </span>
                              <span className="shrink-0 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">{percent(share)} · {item.orders} ped.</span>
                            </span>
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section className={`${cardClass} p-4 lg:p-5`}>
            <SectionTitle icon={Users} title="Top vendedores do dia" hint={storeLabel || "Todas as lojas"} />
            {sellers.length === 0 ? (
              <p className="text-sm text-slate-400">Sem vendas com vendedor ainda.</p>
            ) : (
              <ol className="space-y-1.5">
                {sellers.map((seller, index) => (
                  <li key={seller.key} className="flex min-w-0 items-center gap-2.5 rounded-xl p-1.5">
                    <span className="relative">
                      <Avatar name={seller.seller} tone={SELLER_TONES[index % SELLER_TONES.length]} size="sm" />
                      {index < 3 && <span className={`absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-full text-[9px] font-extrabold ring-2 ring-white dark:ring-[#071440] ${MEDALS[index]}`}>{index + 1}</span>}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm font-semibold text-slate-800 dark:text-slate-100">{seller.seller}</span>
                      <span className="block break-words text-[11px] text-slate-500 dark:text-slate-400">{seller.storeLabel} · {seller.orders} {seller.orders === 1 ? "venda" : "vendas"}</span>
                    </span>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-[#051647] dark:text-white">{compactMoney(seller.amount)}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className={`${cardClass} p-4 lg:p-5`}>
            <SectionTitle icon={Package} title="Mix do dia" hint="Participação no faturamento" />
            {scoped.length === 0 ? (
              <p className="text-sm text-slate-400">Sem vendas ainda.</p>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">Categoria</p>
                  <MixBars slices={kindMix} colorOf={(key) => KIND_COLOR[key as CategoryKind] ?? "#94a3b8"} />
                </div>
                <div>
                  <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400"><CreditCard className="h-3.5 w-3.5" />Pagamento</p>
                  <MixBars slices={paymentMix} colorOf={(_, index) => PAYMENT_COLORS[index % PAYMENT_COLORS.length]} />
                </div>
              </div>
            )}
          </section>
        </aside>
      </div>

      {selectedOrder && <OrderDrawer order={selectedOrder} now={now} onClose={() => setSelected(null)} />}
    </main>
  );
}
