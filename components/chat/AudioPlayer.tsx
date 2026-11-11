"use client";
import { useRef, useState } from "react";
import { Loader2, Pause, Play } from "lucide-react";

const SPEEDS = [1, 1.5, 2];

const clock = (value: number) => {
  if (!Number.isFinite(value)) return "0:00";
  return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
};

type Props = {
  src: string;
  /** Bolha enviada (fundo escuro) ou recebida (fundo claro). */
  outgoing?: boolean;
};

const THEMES = {
  outgoing: {
    button: "bg-white/15 text-white hover:bg-white/25 dark:bg-[#051647]/10 dark:text-[#051647] dark:hover:bg-[#051647]/20",
    track: "bg-white/25 dark:bg-[#051647]/20",
    fill: "bg-white dark:bg-[#051647]",
    speed: "hover:bg-white/10 dark:hover:bg-[#051647]/10",
  },
  incoming: {
    button: "bg-slate-600 text-white hover:bg-slate-700 dark:bg-slate-500 dark:hover:bg-slate-400",
    track: "bg-slate-200 dark:bg-slate-700",
    fill: "bg-[#002187] dark:bg-[#C4D600]",
    speed: "hover:bg-black/5 dark:hover:bg-white/10",
  },
};

export function AudioPlayer({ src, outgoing = false }: Props) {
  const audio = useRef<HTMLAudioElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const progress = duration > 0 ? Math.min(current / duration, 1) : 0;
  const theme = outgoing ? THEMES.outgoing : THEMES.incoming;

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
    <div className="flex w-[260px] max-w-full items-center gap-3 sm:w-[290px]">
      <audio
        ref={audio}
        src={src}
        preload="metadata"
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
        className={`flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors ${theme.button}`}
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : playing ? <Pause className="size-4 fill-current" /> : <Play className="ml-0.5 size-4 fill-current" />}
      </button>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
        <div
          ref={track}
          role="slider"
          tabIndex={0}
          aria-label="Posição do áudio"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(current)}
          className="group relative w-full cursor-pointer touch-none py-1"
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
          <div className={`relative h-1 w-full rounded-full ${theme.track}`}>
            <div
              className={`relative h-1 rounded-full ${theme.fill} ${dragging ? "" : "transition-[width] duration-200 ease-linear"}`}
              style={{ width: `${progress * 100}%` }}
            >
              <span
                className={`absolute -top-[3px] right-0 size-2.5 translate-x-1/2 rounded-full transition-opacity ${theme.fill} ${dragging ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
              />
            </div>
          </div>
        </div>
        <div className="flex select-none items-center justify-between text-[11px] opacity-70">
          <span className="tabular-nums">{failed ? "Áudio indisponível" : clock(playing || current > 0 ? current : duration)}</span>
          <button
            type="button"
            onClick={cycleSpeed}
            title="Velocidade"
            className={`cursor-pointer rounded-full px-1.5 py-0.5 text-[10px] font-medium transition-colors ${theme.speed}`}
          >
            {String(speed).replace(".", ",")}x
          </button>
        </div>
      </div>
    </div>
  );
}
