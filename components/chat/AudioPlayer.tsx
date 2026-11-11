"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Pause, Play, Volume2, VolumeX } from "lucide-react";

const BARS = 36;
const SPEEDS = [1, 1.5, 2];
const HEARD_KEY = "chat:audios-ouvidos";
const HEARD_LIMIT = 500;

/** Onda decorativa derivada da URL: decodificar o áudio travaria a rolagem em conversas longas. */
function bars(url: string) {
  let hash = 0;
  for (const char of url) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return Array.from({ length: BARS }, (_, index) => {
    hash = (hash * 1103515245 + 12345 + index) | 0;
    return 25 + (Math.abs(hash) % 75);
  });
}

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

export function AudioPlayer({ src, id, outgoing = false }: Props) {
  const audio = useRef<HTMLAudioElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [muted, setMuted] = useState(false);
  const [unheard, setUnheard] = useState(false);
  const waveform = useMemo(() => bars(src), [src]);
  const progress = duration > 0 ? current / duration : 0;
  const started = playing || current > 0;

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

  const button = outgoing
    ? "bg-white/20 text-current hover:bg-white/30 dark:bg-[#051647]/15 dark:hover:bg-[#051647]/25"
    : "bg-[#051647] text-white hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#C4D600]/90";
  const played = outgoing ? "bg-current" : "bg-[#002187] dark:bg-[#C4D600]";
  const pill = outgoing ? "bg-white/15 hover:bg-white/25 dark:bg-[#051647]/10 dark:hover:bg-[#051647]/20" : "bg-slate-200/70 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/20";

  return (
    <div className="mb-1 flex min-w-[220px] max-w-[320px] items-center gap-2.5 px-1.5 py-1">
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
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pausar" : "Tocar"}
        title={failed ? "Não foi possível carregar o áudio. Clique para tentar de novo." : playing ? "Pausar" : "Tocar"}
        className={`relative flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-transform active:scale-95 ${button}`}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
        {unheard && <span aria-label="Áudio não ouvido" className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-[#002187] ring-2 ring-white dark:bg-[#C4D600] dark:ring-slate-800" />}
      </button>
      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label="Posição do áudio"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(current)}
        className="flex h-7 min-w-0 flex-1 cursor-pointer touch-none items-center gap-px"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          seekTo(event.clientX);
        }}
        onPointerMove={(event) => {
          if (event.buttons === 1) seekTo(event.clientX);
        }}
        onKeyDown={(event) => {
          if (!audio.current) return;
          if (event.key === "ArrowRight") audio.current.currentTime += 5;
          if (event.key === "ArrowLeft") audio.current.currentTime -= 5;
        }}
      >
        {waveform.map((height, index) => (
          <span
            key={index}
            className={`flex-1 rounded-full transition-[opacity,background-color] duration-150 ${index / BARS < progress ? `${played} opacity-100` : "bg-current opacity-25"}`}
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
      <span className="shrink-0 font-mono text-[11px] tabular-nums opacity-70">{failed ? "--:--" : clock(started ? current : duration)}</span>
      <button type="button" onClick={cycleSpeed} title="Velocidade" className={`shrink-0 cursor-pointer rounded px-1.5 py-0.5 text-[10px] font-semibold opacity-80 transition-colors ${pill}`}>
        {String(speed).replace(".", ",")}x
      </button>
      <button type="button" onClick={() => setMuted((value) => !value)} aria-label={muted ? "Ativar som" : "Silenciar"} title={muted ? "Ativar som" : "Silenciar"} className="shrink-0 cursor-pointer opacity-60 hover:opacity-100">
        {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
