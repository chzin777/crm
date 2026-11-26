"use client";
import { useRef, useState, type ReactNode } from "react";
import { Loader2, Pause, Play, RotateCcw, RotateCw, Volume2, VolumeX } from "lucide-react";

const JUMP = 15;
const SPEEDS = [1, 1.5, 2];

const clock = (value: number) => {
  if (!Number.isFinite(value)) return "0:00";
  return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
};

const SIDE_BUTTON = "relative shrink-0 cursor-pointer p-1 text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white";

function JumpIcon({ forward }: { forward?: boolean }) {
  const Icon = forward ? RotateCw : RotateCcw;
  return (
    <span className="relative flex size-5 items-center justify-center">
      <Icon className="size-5" strokeWidth={1.75} />
      <span className="absolute text-[7px] font-bold leading-none">{JUMP}</span>
    </span>
  );
}

/**
 * `meta` (hora e status de entrega) fecha a linha do player. `footer` (transcrição) entra no mesmo balão, abaixo de
 * uma divisória, com a largura exata do player. `tone="dark"`: balão azul-marinho dos áudios enviados pela equipe.
 */
export function AudioPlayer({ src, meta, footer, tone = "light" }: { src: string; meta?: ReactNode; footer?: ReactNode; tone?: "light" | "dark" }) {
  const audio = useRef<HTMLAudioElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const progress = duration > 0 ? Math.min(current / duration, 1) : 0;

  const toggle = () => {
    const element = audio.current;
    if (!element) return;
    if (!element.paused) {
      element.pause();
      return;
    }
    setFailed(false);
    if (element.readyState < 3) setLoading(true);
    element.playbackRate = speed;
    element.play().catch(() => setLoading(false));
  };

  const jump = (seconds: number) => {
    const element = audio.current;
    if (!element) return;
    const limit = duration || element.duration;
    const next = Math.max(0, element.currentTime + seconds);
    element.currentTime = Number.isFinite(limit) && limit > 0 ? Math.min(next, limit) : next;
    setCurrent(element.currentTime);
  };

  const seekTo = (clientX: number) => {
    const box = track.current?.getBoundingClientRect();
    const element = audio.current;
    if (!box || !element || !duration) return;
    const ratio = Math.min(Math.max((clientX - box.left) / box.width, 0), 1);
    element.currentTime = ratio * duration;
    setCurrent(element.currentTime);
  };

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (audio.current) audio.current.playbackRate = next;
  };

  const updateDuration =(element: HTMLAudioElement) => {
    // Áudio gravado em webm/ogg pode vir sem duração no cabeçalho até ser lido.
    if (Number.isFinite(element.duration)) setDuration(element.duration);
  };

  const dark = tone === "dark";
  const side = dark ? "relative shrink-0 cursor-pointer p-1 text-white/70 transition-colors hover:text-white" : SIDE_BUTTON;
  const shell = dark
    ? "border-white/10 bg-[#07163B] text-white"
    : "border-slate-200/80 bg-white text-slate-900 dark:border-slate-700/60 dark:bg-slate-800 dark:text-white";
  const row = (
    <div className={`flex items-center gap-2 ${footer ? "w-full px-3 py-1.5" : `w-fit max-w-[min(420px,100%)] rounded-full border px-3.5 py-1.5 shadow-sm ${shell}`}`}>
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        muted={muted}
        onPlay={() => setPlaying(true)}
        onPlaying={() => setLoading(false)}
        onWaiting={() => setLoading(true)}
        onCanPlay={(event) => {
          if (event.currentTarget.paused) setLoading(false);
        }}
        onPause={() => {
          setPlaying(false);
          setLoading(false);
        }}
        onEnded={(event) => {
          setPlaying(false);
          setLoading(false);
          event.currentTarget.currentTime = 0;
          setCurrent(0);
        }}
        onError={() => {
          setPlaying(false);
          setLoading(false);
          setFailed(true);
        }}
        onLoadedMetadata={(event) => updateDuration(event.currentTarget)}
        onDurationChange={(event) => updateDuration(event.currentTarget)}
        onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
      />
      <button type="button" onClick={() => jump(-JUMP)} aria-label={`Voltar ${JUMP} segundos`} title={`Voltar ${JUMP}s`} className={side}>
        <JumpIcon />
      </button>
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pausar" : "Tocar"}
        title={failed ? "Não foi possível carregar o áudio. Clique para tentar de novo." : playing ? "Pausar" : "Tocar"}
        className={`flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full shadow transition-transform active:scale-95 ${dark ? "bg-[#C4D600] text-[#051647] hover:bg-[#d4e320]" : "bg-[#002187] text-white hover:bg-[#051647]"}`}
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : playing ? <Pause className="size-4 fill-current" /> : <Play className="ml-0.5 size-4 fill-current" />}
      </button>
      <button type="button" onClick={() => jump(JUMP)} aria-label={`Avançar ${JUMP} segundos`} title={`Avançar ${JUMP}s`} className={side}>
        <JumpIcon forward />
      </button>
      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label="Posição do áudio"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(current)}
        className={`relative h-1.5 min-w-[70px] flex-1 cursor-pointer touch-none overflow-hidden rounded-full ${dark ? "bg-white/15" : "bg-[#002187]/15 dark:bg-[#002187]/40"}`}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
          seekTo(event.clientX);
        }}
        onPointerMove={(event) => {
          if (dragging) seekTo(event.clientX);
        }}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") jump(5);
          if (event.key === "ArrowLeft") jump(-5);
        }}
      >
        <div
          className={`h-full rounded-full ${dark ? "bg-[#C4D600]" : "bg-[#002187] dark:bg-[#C4D600]"} ${dragging ? "" : "transition-[width] duration-200 ease-linear"}`}
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      <span className={`shrink-0 select-none pl-1 font-mono text-xs tabular-nums ${dark ? "text-white/70" : "text-slate-500 dark:text-slate-400"}`}>
        {failed ? "--:--" : `${clock(current)} / ${clock(duration)}`}
      </span>
      <button
        type="button"
        onClick={cycleSpeed}
        title="Velocidade"
        className={`shrink-0 cursor-pointer select-none rounded px-1.5 py-0.5 text-[11px] font-semibold transition-colors ${dark ? "bg-white/10 text-white hover:bg-white/20" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"}`}
      >
        {String(speed).replace(".", ",")}x
      </button>
      <button type="button" onClick={() => setMuted((value) => !value)} aria-label={muted ? "Ativar som" : "Silenciar"} title={muted ? "Ativar som" : "Silenciar"} className={side}>
        {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
      </button>
      {meta && <span className={`ml-1 flex shrink-0 select-none items-center gap-1 text-[10px] ${dark ? "text-white/70" : "text-slate-500 dark:text-slate-400"}`}>{meta}</span>}
    </div>
  );

  if (!footer) return row;
  // Player + transcrição num só balão: a largura é a do player e o texto nunca passa dela.
  return (
    <div className={`w-[min(420px,100%)] min-w-0 overflow-hidden rounded-2xl border shadow-sm ${shell}`}>
      {row}
      <div className={`border-t px-3 py-2 ${dark ? "border-white/10" : "border-slate-200/80 dark:border-slate-700/60"}`}>{footer}</div>
    </div>
  );
}
