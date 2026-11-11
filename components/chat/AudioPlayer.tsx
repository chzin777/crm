"use client";
import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Pause, Play, Volume2, VolumeX } from "lucide-react";

const SPEEDS = [1, 1.5, 2];
const HEARD_KEY = "chat:audios-ouvidos";
const HEARD_LIMIT = 500;

const clock = (value: number) => {
  if (!Number.isFinite(value)) return "0:00";
  return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
};

/** Áudios já ouvidos ficam no navegador do operador; sem armazenamento disponível, nada é marcado como novo. */
function readHeard(): string[] | null {
  try {
    const raw = window.localStorage.getItem(HEARD_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return null;
  }
}

function markHeard(id: string) {
  try {
    const list = (readHeard() ?? []).filter((item) => item !== id);
    list.push(id);
    window.localStorage.setItem(HEARD_KEY, JSON.stringify(list.slice(-HEARD_LIMIT)));
  } catch {
    // Sem armazenamento local: o ponto só some até recarregar a tela.
  }
}

type Props = {
  src: string;
  /** Id da mensagem, usado para lembrar se o áudio recebido já foi ouvido. */
  id?: string;
  /** Bolha enviada (fundo escuro) ou recebida (fundo claro). */
  outgoing?: boolean;
};

const THEMES = {
  outgoing: {
    card: "bg-black/15 dark:bg-[#051647]/10",
    button: "bg-white text-[#051647] dark:bg-[#051647] dark:text-[#C4D600]",
    track: "bg-white/25 dark:bg-[#051647]/20",
    fill: "bg-white dark:bg-[#051647]",
    meta: "text-white/75 dark:text-[#051647]/75",
    pill: "bg-white/15 text-current hover:bg-white/25 dark:bg-[#051647]/15 dark:hover:bg-[#051647]/25",
    dot: "bg-[#C4D600] dark:bg-[#051647]",
  },
  incoming: {
    card: "border border-slate-200/70 bg-slate-100/80 dark:border-slate-700/60 dark:bg-slate-900/40",
    button: "bg-[#051647] text-white dark:bg-[#C4D600] dark:text-[#051647]",
    track: "bg-slate-300/70 dark:bg-slate-600/60",
    fill: "bg-[#002187] dark:bg-[#C4D600]",
    meta: "text-slate-500 dark:text-slate-400",
    pill: "bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600",
    dot: "bg-[#002187] dark:bg-[#C4D600]",
  },
};

export function AudioPlayer({ src, id, outgoing = false }: Props) {
  const audio = useRef<HTMLAudioElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [muted, setMuted] = useState(false);
  const [unheard, setUnheard] = useState(false);
  const progress = duration > 0 ? Math.min(current / duration, 1) : 0;
  const theme = outgoing ? THEMES.outgoing : THEMES.incoming;

  useEffect(() => {
    if (outgoing || !id) return;
    const heard = readHeard();
    setUnheard(heard !== null && !heard.includes(id));
  }, [id, outgoing]);

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
    if (unheard && id) {
      markHeard(id);
      setUnheard(false);
    }
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

  const updateDuration = (element: HTMLAudioElement) => {
    // Áudio gravado em webm/ogg pode vir sem duração no cabeçalho até ser lido.
    if (Number.isFinite(element.duration)) setDuration(element.duration);
  };

  return (
    <div className={`mb-1 w-full min-w-[260px] max-w-[340px] rounded-xl p-2.5 ${theme.card}`}>
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
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pausar" : "Tocar"}
          title={failed ? "Não foi possível carregar o áudio. Clique para tentar de novo." : playing ? "Pausar" : "Tocar"}
          className={`flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full shadow-sm transition-all hover:scale-105 active:scale-95 ${theme.button}`}
        >
          {loading ? <Loader2 className="size-5 animate-spin" /> : playing ? <Pause className="size-4 fill-current" /> : <Play className="ml-0.5 size-4 fill-current" />}
        </button>
        <div
          ref={track}
          role="slider"
          tabIndex={0}
          aria-label="Posição do áudio"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(current)}
          className="group relative flex h-5 flex-1 cursor-pointer touch-none items-center"
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
            if (!audio.current) return;
            if (event.key === "ArrowRight") audio.current.currentTime += 5;
            if (event.key === "ArrowLeft") audio.current.currentTime -= 5;
          }}
        >
          <div className={`relative h-2 w-full rounded-full ${theme.track}`}>
            <div
              className={`relative h-full rounded-full ${theme.fill} ${dragging ? "" : "transition-[width] duration-200 ease-linear"}`}
              style={{ width: `${progress * 100}%` }}
            >
              <span
                className={`absolute right-0 top-1/2 size-3.5 -translate-y-1/2 translate-x-1/2 rounded-full shadow-sm transition-opacity ${theme.fill} ${dragging ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
              />
            </div>
          </div>
        </div>
      </div>
      <div className={`mt-2 flex items-center justify-between pl-13 pr-1 text-xs ${theme.meta}`}>
        <span className="font-mono tabular-nums">{failed ? "Áudio indisponível" : `${clock(current)} / ${clock(duration)}`}</span>
        <span className="flex items-center gap-2">
          {unheard ? (
            <span aria-label="Áudio não ouvido" title="Áudio não ouvido" className={`size-1.5 rounded-full ${theme.dot}`} />
          ) : (
            <Mic className="size-3.5 opacity-60" aria-hidden />
          )}
          <button
            type="button"
            onClick={() => setMuted((value) => !value)}
            aria-label={muted ? "Ativar som" : "Silenciar"}
            title={muted ? "Ativar som" : "Silenciar"}
            className="cursor-pointer opacity-70 transition-opacity hover:opacity-100"
          >
            {muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
          </button>
          <button
            type="button"
            onClick={cycleSpeed}
            title="Velocidade"
            className={`cursor-pointer select-none rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors ${theme.pill}`}
          >
            {String(speed).replace(".", ",")}x
          </button>
        </span>
      </div>
    </div>
  );
}
