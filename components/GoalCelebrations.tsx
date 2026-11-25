"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Gift, PartyPopper, Store, Trophy } from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";

type Celebration = {
  id: string;
  campaignId: string;
  campaignName: string;
  rewardMode: string;
  participantType: string;
  participantKey: string;
  participantName: string;
  tier: number;
  headline: string;
  rewardLabel: string;
  rewardAmount: number;
};

/** Várias conquistas da mesma campanha/participante (ex.: 2 blocos de 3 armações na mesma venda) viram um parabéns só. */
type Bundle = { ids: string[]; top: Celebration; count: number; reward: number };

const POLL_MS = 45_000;
const COLORS = ["#C4D600", "#F7915E", "#002187", "#051647", "#ffffff", "#7dd3fc"];
const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function bundle(items: Celebration[]): Bundle[] {
  const groups = new Map<string, Bundle>();
  for (const item of items) {
    const key = `${item.campaignId}|${item.participantKey}`;
    const entry = groups.get(key) ?? { ids: [], top: item, count: 0, reward: 0 };
    entry.ids.push(item.id);
    entry.count += 1;
    entry.reward += item.rewardAmount;
    if (item.tier >= entry.top.tier) entry.top = item;
    groups.set(key, entry);
  }
  return [...groups.values()];
}

/** Confete em canvas (sem biblioteca): duas rajadas laterais + chuva, ~4 s. Respeita "reduzir movimento". */
function fireConfetti() {
  if (typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, { position: "fixed", inset: "0", width: "100vw", height: "100vh", pointerEvents: "none", zIndex: "130" });
  document.body.appendChild(canvas);
  const context = canvas.getContext("2d");
  if (!context) return canvas.remove();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const resize = () => {
    canvas.width = window.innerWidth * ratio;
    canvas.height = window.innerHeight * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  };
  resize();
  const width = window.innerWidth;
  const height = window.innerHeight;
  type Piece = { x: number; y: number; vx: number; vy: number; size: number; color: string; rotation: number; spin: number; shape: number; delay: number };
  const pieces: Piece[] = [];
  const burst = (x: number, direction: number, delay: number) => {
    for (let index = 0; index < 110; index += 1) {
      const angle = (-60 - Math.random() * 50) * (Math.PI / 180);
      const speed = 9 + Math.random() * 11;
      pieces.push({ x, y: height * 0.85, vx: Math.cos(angle) * speed * direction * -1, vy: Math.sin(angle) * speed, size: 5 + Math.random() * 6, color: COLORS[index % COLORS.length], rotation: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 0.4, shape: index % 3, delay });
    }
  };
  burst(0, -1, 0);
  burst(width, 1, 0);
  for (let index = 0; index < 90; index += 1) pieces.push({ x: Math.random() * width, y: -20 - Math.random() * height * 0.5, vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 3, size: 5 + Math.random() * 5, color: COLORS[index % COLORS.length], rotation: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 0.3, shape: index % 3, delay: 350 });
  const started = performance.now();
  const duration = 4200;
  const frame = (now: number) => {
    const elapsed = now - started;
    context.clearRect(0, 0, width, height);
    for (const piece of pieces) {
      if (elapsed < piece.delay) continue;
      piece.vy += 0.28;
      piece.vx *= 0.985;
      piece.vy *= 0.985;
      piece.x += piece.vx;
      piece.y += piece.vy;
      piece.rotation += piece.spin;
      context.save();
      context.globalAlpha = Math.max(0, 1 - Math.max(0, elapsed - duration + 900) / 900);
      context.translate(piece.x, piece.y);
      context.rotate(piece.rotation);
      context.fillStyle = piece.color;
      if (piece.shape === 0) context.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2);
      else if (piece.shape === 1) {
        context.beginPath();
        context.arc(0, 0, piece.size / 2.4, 0, Math.PI * 2);
        context.fill();
      } else {
        context.beginPath();
        context.moveTo(0, -piece.size / 2);
        context.lineTo(piece.size / 2, piece.size / 2);
        context.lineTo(-piece.size / 2, piece.size / 2);
        context.closePath();
        context.fill();
      }
      context.restore();
    }
    if (elapsed < duration) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

/**
 * Global (todas as telas do CRM): consulta a cada 45 s as conquistas ainda não comemoradas do usuário logado
 * (a consulta também apura as campanhas) e mostra confete + parabéns. "Valeu!" marca como vista e não repete.
 */
export function GoalCelebrations() {
  const [queue, setQueue] = useState<Bundle[]>([]);
  const shown = useRef(new Set<string>());
  const stopped = useRef(false);

  const check = useCallback(async () => {
    if (stopped.current || document.visibilityState === "hidden") return;
    try {
      const response = await fetch("/api/metas/comemoracoes", { cache: "no-store" });
      if (response.status === 401) {
        stopped.current = true;
        return;
      }
      if (!response.ok) return;
      const body = (await response.json()) as { data?: Celebration[] };
      const fresh = (body.data ?? []).filter((item) => !shown.current.has(item.id));
      if (!fresh.length) return;
      for (const item of fresh) shown.current.add(item.id);
      setQueue((current) => [...current, ...bundle(fresh)]);
    } catch {
      /* rede instável: tenta de novo no próximo ciclo */
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void check(), 4_000);
    const timer = window.setInterval(() => void check(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [check]);

  const current = queue[0];
  const currentKey = current?.ids.join(",");
  useEffect(() => {
    if (currentKey) fireConfetti();
  }, [currentKey]);

  const dismiss = () => {
    if (!current) return;
    setQueue((list) => list.slice(1));
    void fetch("/api/metas/comemoracoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: current.ids }) }).catch(() => undefined);
  };

  if (!current) return null;
  const item = current.top;
  const isStore = item.participantType === "store";
  const subject = isStore ? `A ${item.participantName}` : "Você";
  const verb = item.rewardMode === "RANKING" ? "ficou em" : "atingiu";
  const headline = `${subject} ${verb} ${item.headline}!`;
  const rewardText = current.reward > 0 ? `${brl(current.reward)}${item.rewardLabel ? ` em ${item.rewardLabel}` : ""}` : item.rewardLabel;
  const Icon = item.rewardMode === "RANKING" ? Trophy : isStore ? Store : PartyPopper;

  return (
    <EntityDialog
      titleId="goal-celebration-title"
      title={`Parabéns! ${item.campaignName}`}
      description={headline}
      onClose={dismiss}
      size="sm"
      header={
        <div className="flex flex-col items-center pt-2 text-center">
          <span className="grid h-16 w-16 animate-[sale-flash_1.2s_ease-out] place-items-center rounded-2xl bg-gradient-to-br from-[#C4D600] to-[#9fb000] text-[#051647] shadow-lg shadow-[#C4D600]/30">
            <Icon className="h-8 w-8" />
          </span>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#F7915E]">{item.campaignName}</p>
          <p className="mt-1 text-2xl font-extrabold tracking-tight text-[#051647] dark:text-white">Parabéns!</p>
        </div>
      }
    >
      <div className="space-y-4 text-center">
        <p className="text-base font-semibold text-slate-800 dark:text-slate-100">{headline}</p>
        {rewardText && (
          <div className="rounded-2xl border border-[#C4D600]/50 bg-[#C4D600]/10 px-4 py-3">
            <p className="flex items-center justify-center gap-2 text-sm font-bold text-[#051647] dark:text-[#C4D600]">
              <Gift className="h-4 w-4 shrink-0" />
              {isStore ? "A loja garantiu" : "Você garantiu"} {rewardText}!
            </p>
            {current.count > 1 && <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{current.count} prêmios conquistados de uma vez</p>}
          </div>
        )}
        <button type="button" onClick={dismiss} autoFocus className="h-11 w-full cursor-pointer rounded-xl bg-[#051647] text-sm font-bold text-white transition-colors hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647]">
          Valeu!{queue.length > 1 ? ` (mais ${queue.length - 1})` : ""}
        </button>
      </div>
    </EntityDialog>
  );
}
