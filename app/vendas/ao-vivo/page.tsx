"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BadgeDollarSign, Bell, BellOff, Expand, MessageCircle, Minimize, Receipt, ShoppingBag, Store, Trophy, UserRound, WifiOff, Zap } from "lucide-react";
import { dayKpis, formatMoney, mergeOrders, relativeTime, type LiveEvent, type LiveOrder, type LiveSnapshot } from "@/lib/sales-live/feed";

type Status = "connecting" | "live" | "polling" | "offline";

const FRESH_MS = 8_000;
const POLL_MS = 15_000;
const SOUND_KEY = "crm_vendas_ao_vivo_alerta";

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

function StatusPill({ status, updatedAt, now }: { status: Status; updatedAt: string | null; now: Date }) {
  const seconds = updatedAt ? Math.max(0, Math.round((now.getTime() - new Date(updatedAt).getTime()) / 1000)) : null;
  const ago = seconds === null ? "" : seconds < 20 ? "atualizado agora" : seconds < 60 ? `atualizado há ${seconds} seg` : `atualizado há ${Math.floor(seconds / 60)} min`;
  if (status === "offline") return <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300"><WifiOff className="h-3.5 w-3.5" />Sem conexão{ago ? ` · ${ago}` : ""}</span>;
  if (status === "connecting") return <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300"><span className="h-2 w-2 animate-pulse rounded-full bg-slate-400" />Conectando...</span>;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#C4D600]/25 px-2.5 py-1 text-[11px] font-semibold text-[#051647] dark:text-[#C4D600]">
      <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>
      {status === "polling" ? "Ao vivo (modo econômico)" : "Ao vivo"}{ago ? ` · ${ago}` : ""}
    </span>
  );
}

function SaleCard({ order, fresh, now }: { order: LiveOrder; fresh: boolean; now: Date }) {
  return (
    <li className={`relative min-w-0 rounded-2xl border bg-white p-4 shadow-sm transition-colors duration-700 dark:bg-slate-900/60 ${fresh ? "border-emerald-400 ring-2 ring-emerald-400/50 dark:border-emerald-400" : "border-slate-200/80 dark:border-slate-800"}`}>
      {fresh && <span className="absolute -top-2 left-4 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow animate-pulse"><Zap className="h-3 w-3" />Nova venda</span>}
      <div className="flex items-start justify-between gap-3">
        <p className="text-2xl font-bold tabular-nums tracking-tight text-[#051647] dark:text-white">{formatMoney(order.amount)}</p>
        <span className="shrink-0 pt-1 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">{relativeTime(order.at, now, order.time)}</span>
      </div>
      <p className="mt-1 flex min-w-0 items-center gap-1.5 text-sm font-semibold text-[#002187] dark:text-[#C4D600]"><Store className="h-4 w-4 shrink-0" /><span className="min-w-0 break-words">{order.storeLabel}</span></p>
      <p className="mt-1 min-w-0 break-words text-sm text-slate-700 dark:text-slate-200">{order.summary}<span className="text-slate-400"> · {order.items} {order.items === 1 ? "item" : "itens"}</span></p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
        {order.seller && <span className="inline-flex min-w-0 items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300"><UserRound className="h-3 w-3 shrink-0" /><span className="break-words">{order.seller}</span></span>}
        {order.payment && <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300">{order.payment}</span>}
        {order.fromCrm && <span className="inline-flex items-center gap-1 rounded-md bg-[#002187]/10 px-2 py-0.5 font-semibold text-[#002187] dark:bg-[#C4D600]/15 dark:text-[#C4D600]"><MessageCircle className="h-3 w-3" />Atendimento CRM / WhatsApp</span>}
      </div>
    </li>
  );
}

/** /vendas/ao-vivo: War Room da Black Friday no celular (vendas faturadas no VMSet entrando em tempo real). */
export default function LiveSalesPage() {
  const [orders, setOrders] = useState<LiveOrder[]>([]);
  const [stores, setStores] = useState<LiveSnapshot["stores"]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [error, setError] = useState("");
  const [store, setStore] = useState("");
  const [sound, setSound] = useState(false);
  const [fresh, setFresh] = useState<Record<string, number>>({});
  const [now, setNow] = useState(() => new Date());
  const [fullscreen, setFullscreen] = useState(false);
  const soundRef = useRef(false);
  const loadedRef = useRef(false);
  const ordersRef = useRef<LiveOrder[]>([]);

  useEffect(() => {
    const stored = window.localStorage.getItem(SOUND_KEY) === "1";
    soundRef.current = stored;
    const timer = window.setTimeout(() => setSound(stored), 0);
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
        setFresh((current) => ({ ...current, ...Object.fromEntries(added.map((key) => [key, stamp])) }));
        if (soundRef.current) notifySale();
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

  const visible = useMemo(() => (store ? orders.filter((order) => order.store === store) : orders), [orders, store]);
  const kpis = useMemo(() => dayKpis(visible), [visible]);
  const allKpis = useMemo(() => dayKpis(orders), [orders]);
  const revenue = useAnimatedNumber(kpis.revenue);
  const freshKeys = new Set(Object.entries(fresh).filter(([, stamp]) => now.getTime() - stamp < FRESH_MS).map(([key]) => key));

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

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 px-3 pb-16 pt-4 sm:px-6 sm:pt-8">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#F7915E]">Black Friday · VMSET</p>
          <h1 className="text-2xl font-bold tracking-tight text-[#051647] dark:text-white">Vendas ao vivo</h1>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={toggleSound} aria-pressed={sound} title={sound ? "Desligar alerta de nova venda" : "Ligar alerta (som e vibração) a cada nova venda"} className={`grid h-10 w-10 cursor-pointer place-items-center rounded-xl border ${sound ? "border-[#C4D600] bg-[#C4D600]/20 text-[#051647] dark:text-[#C4D600]" : "border-slate-200 text-slate-500 dark:border-slate-700"}`}>
            {sound ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
          </button>
          <button type="button" onClick={toggleFullscreen} title={fullscreen ? "Sair da tela cheia" : "Tela cheia"} className="grid h-10 w-10 cursor-pointer place-items-center rounded-xl border border-slate-200 text-slate-500 dark:border-slate-700">
            {fullscreen ? <Minimize className="h-5 w-5" /> : <Expand className="h-5 w-5" />}
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={status} updatedAt={updatedAt} now={now} />
        <label className="ml-auto flex min-w-0 items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <Store className="h-4 w-4 shrink-0" />
          <select value={store} onChange={(event) => setStore(event.target.value)} aria-label="Filtrar por loja" className="h-9 max-w-[220px] cursor-pointer rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
            <option value="">Todas as lojas</option>
            {stores.map((item) => <option key={item.store} value={item.store}>{item.storeLabel}</option>)}
          </select>
        </label>
      </div>

      {error && status === "offline" && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">{error}</p>}

      <section className="rounded-2xl bg-[#051647] p-4 text-white shadow-lg">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/70"><BadgeDollarSign className="h-4 w-4" />Faturamento {store ? "da loja" : "do dia"}</p>
        <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight text-[#C4D600] sm:text-5xl">{formatMoney(revenue)}</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white/10 p-3">
            <p className="flex items-center gap-1 text-[11px] text-white/70"><ShoppingBag className="h-3.5 w-3.5" />Pedidos</p>
            <p className="text-2xl font-bold tabular-nums">{kpis.orders}</p>
          </div>
          <div className="rounded-xl bg-white/10 p-3">
            <p className="flex items-center gap-1 text-[11px] text-white/70"><Receipt className="h-3.5 w-3.5" />Ticket médio</p>
            <p className="text-2xl font-bold tabular-nums">{kpis.orders ? formatMoney(kpis.ticket) : "—"}</p>
          </div>
        </div>
      </section>

      {!store && allKpis.topStores.length > 0 && (
        <section className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/60">
          <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400"><Trophy className="h-4 w-4 text-[#F7915E]" />Top lojas do dia</h2>
          <ol className="mt-2 space-y-2">
            {allKpis.topStores.map((item, index) => (
              <li key={item.store} className="min-w-0">
                <button type="button" onClick={() => setStore(item.store)} className="w-full cursor-pointer text-left">
                  <span className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 break-words font-medium text-slate-800 dark:text-slate-100">{index + 1}. {item.storeLabel}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-[#051647] dark:text-white">{formatMoney(item.amount)}</span>
                  </span>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/5">
                    <span className="block h-full rounded-full bg-[#C4D600]" style={{ width: `${(item.amount / (allKpis.topStores[0]?.amount || 1)) * 100}%` }} />
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section aria-live="polite" className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Feed de vendas{store ? ` · ${stores.find((item) => item.store === store)?.storeLabel ?? ""}` : ""}</h2>
        {status === "connecting" && orders.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400 dark:border-slate-700">Carregando as vendas do dia...</p>
        ) : visible.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400 dark:border-slate-700">Nenhuma venda faturada hoje{store ? " nesta loja" : ""} ainda.</p>
        ) : (
          <ul className="space-y-3">
            {visible.slice(0, 150).map((order) => <SaleCard key={order.key} order={order} fresh={freshKeys.has(order.key)} now={now} />)}
          </ul>
        )}
      </section>
    </main>
  );
}
