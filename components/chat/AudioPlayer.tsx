"use client";
import { useMemo, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";

const BARS = 42;
const SPEEDS = [1, 1.5, 2];

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

export function AudioPlayer({ src }: { src: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [muted, setMuted] = useState(false);
  const waveform = useMemo(() => bars(src), [src]);
  const progress = duration > 0 ? current / duration : 0;

  const toggle = () => {
    const element = audio.current;
    if (!element) return;
    if (element.paused) void element.play();
    else element.pause();
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
    <div className="mb-1 flex w-72 max-w-full items-center gap-2">
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        muted={muted}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={(event) => updateDuration(event.currentTarget)}
        onDurationChange={(event) => updateDuration(event.currentTarget)}
        onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
      />
      <button type="button" onClick={toggle} aria-label={playing ? "Pausar" : "Tocar"} title={playing ? "Pausar" : "Tocar"} className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full bg-black/10 dark:bg-white/15">
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </button>
      <div className="min-w-0 flex-1">
        <div
          ref={track}
          role="slider"
          tabIndex={0}
          aria-label="Posição do áudio"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(current)}
          className="flex h-7 cursor-pointer touch-none items-center gap-px"
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
            <span key={index} className={`flex-1 rounded-full bg-current ${index / BARS <= progress ? "opacity-100" : "opacity-30"}`} style={{ height: `${height}%` }} />
          ))}
        </div>
        <div className="flex items-center justify-between text-[10px] opacity-70">
          <span>{clock(current)} / {clock(duration)}</span>
          <span className="flex items-center gap-1">
            <button type="button" onClick={cycleSpeed} title="Velocidade" className="cursor-pointer font-semibold">{String(speed).replace(".", ",")}x</button>
            <button type="button" onClick={() => setMuted((value) => !value)} aria-label={muted ? "Ativar som" : "Silenciar"} title={muted ? "Ativar som" : "Silenciar"} className="cursor-pointer">
              {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
