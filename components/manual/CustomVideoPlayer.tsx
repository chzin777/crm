"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Loader2, Maximize, Minimize, Pause, PictureInPicture2, Play, RotateCcw, RotateCw, Volume1, Volume2, VolumeX } from "lucide-react";

const SPEEDS = [1, 1.25, 1.5, 2];
const HIDE_AFTER_MS = 2500;

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

type WebkitVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };

const iconButton = "grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full text-white/90 transition hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4D600]";

/**
 * Player de vídeo com controles próprios na identidade do CRM: timeline arrastável com buffer e prévia do tempo,
 * ±10 s, volume, velocidade, picture-in-picture e tela cheia. Atalhos com o player em foco:
 * Espaço/K (play/pause), ←/→ (−5/+5 s), M (mudo) e F (tela cheia). No celular, tocar mostra/oculta os controles.
 */
export function CustomVideoPlayer({ src, poster, autoPlay = false, title, onEnded }: { src: string; poster?: string; autoPlay?: boolean; title: string; onEnded?: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const volumeRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<number | null>(null);
  const scrubbingRef = useRef(false);
  const resumeAfterScrub = useRef(false);

  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [waiting, setWaiting] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [hover, setHover] = useState<{ x: number; width: number; time: number } | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [pipSupported] = useState(() => typeof document !== "undefined" && "pictureInPictureEnabled" in document && document.pictureInPictureEnabled);
  const [flash, setFlash] = useState<{ kind: "play" | "pause" | "back" | "forward"; key: number } | null>(null);

  const clearHide = () => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = null;
  };

  /** Mostra os controles e, tocando, esconde depois de um tempo parado. */
  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      const video = videoRef.current;
      if (video && !video.paused && !scrubbingRef.current) {
        setControlsVisible(false);
        setSpeedOpen(false);
      }
    }, HIDE_AFTER_MS);
  }, []);

  useEffect(() => () => clearHide(), []);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const showFlash = (kind: "play" | "pause" | "back" | "forward") => setFlash({ kind, key: Date.now() });

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused || video.ended) {
      void video.play().catch(() => undefined);
      showFlash("play");
    } else {
      video.pause();
      showFlash("pause");
    }
  }, []);

  const seekBy = useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = clamp(video.currentTime + delta, 0, video.duration || 0);
    setCurrent(video.currentTime);
    showFlash(delta < 0 ? "back" : "forward");
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.muted || video.volume === 0) {
      video.muted = false;
      if (video.volume === 0) video.volume = 0.5;
    } else {
      video.muted = true;
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    const video = videoRef.current as WebkitVideo | null;
    if (!container || !video) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else if (container.requestFullscreen) {
      void container.requestFullscreen().catch(() => video.webkitEnterFullscreen?.());
    } else {
      video.webkitEnterFullscreen?.();
    }
  }, []);

  const togglePip = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch {
      /* navegador recusou: nada a fazer */
    }
  };

  const changeRate = (value: number) => {
    const video = videoRef.current;
    if (video) video.playbackRate = value;
    setRate(value);
    setSpeedOpen(false);
  };

  // ------------------------------------------------------------ timeline (clique e arraste, mouse e toque)
  const ratioAt = (clientX: number, element: HTMLElement | null) => {
    if (!element) return 0;
    const rect = element.getBoundingClientRect();
    return clamp((clientX - rect.left) / rect.width);
  };

  const seekToRatio = (ratio: number) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    video.currentTime = ratio * duration;
    setCurrent(ratio * duration);
  };

  const onTrackDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const video = videoRef.current;
    scrubbingRef.current = true;
    setScrubbing(true);
    resumeAfterScrub.current = Boolean(video && !video.paused);
    video?.pause();
    seekToRatio(ratioAt(event.clientX, trackRef.current));
    revealControls();
  };

  const onTrackMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const ratio = ratioAt(event.clientX, trackRef.current);
    const rect = trackRef.current?.getBoundingClientRect();
    if (rect) setHover({ x: ratio * rect.width, width: rect.width, time: ratio * duration });
    if (scrubbingRef.current) seekToRatio(ratio);
  };

  const onTrackUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!scrubbingRef.current) return;
    event.stopPropagation();
    scrubbingRef.current = false;
    setScrubbing(false);
    if (event.pointerType !== "mouse") setHover(null);
    if (resumeAfterScrub.current) void videoRef.current?.play().catch(() => undefined);
    revealControls();
  };

  // ------------------------------------------------------------ volume (clique e arraste)
  const setVolumeFromPointer = (clientX: number) => {
    const video = videoRef.current;
    if (!video) return;
    const value = ratioAt(clientX, volumeRef.current);
    video.volume = value;
    video.muted = value === 0;
  };

  const onVolumeDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setVolumeFromPointer(event.clientX);
  };

  // ------------------------------------------------------------ teclado (player em foco)
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key.toLowerCase();
    // Espaço/Enter num botão focado já aciona o próprio botão; não alterna o play de novo.
    if ((key === " " || key === "enter") && (event.target as HTMLElement).tagName === "BUTTON") return;
    if (key === " " || key === "k") togglePlay();
    else if (key === "arrowleft") seekBy(-5);
    else if (key === "arrowright") seekBy(5);
    else if (key === "m") toggleMute();
    else if (key === "f") toggleFullscreen();
    else return;
    event.preventDefault();
    revealControls();
  };

  // ------------------------------------------------------------ toque/clique na área do vídeo
  const lastTap = useRef(0);
  const onSurfaceUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") {
      // No celular: tocar mostra/oculta os controles; o play fica no botão central e na barra.
      if (controlsVisible && playing) {
        clearHide();
        setControlsVisible(false);
        setSpeedOpen(false);
      } else {
        revealControls();
      }
      return;
    }
    const now = Date.now();
    if (now - lastTap.current < 280) {
      toggleFullscreen();
      lastTap.current = 0;
      return;
    }
    lastTap.current = now;
    setSpeedOpen(false);
    togglePlay();
  };

  const progress = duration ? (current / duration) * 100 : 0;
  const bufferedPct = duration ? (buffered / duration) * 100 : 0;
  const effectiveVolume = muted ? 0 : volume;
  const VolumeIcon = effectiveVolume === 0 ? VolumeX : effectiveVolume < 0.5 ? Volume1 : Volume2;
  const showUi = controlsVisible || !playing || scrubbing || speedOpen;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="region"
      aria-label={`Player: ${title}`}
      onKeyDown={onKeyDown}
      onPointerMove={(event) => { if (event.pointerType === "mouse") revealControls(); }}
      onMouseLeave={() => { if (playing && !scrubbingRef.current) { clearHide(); setControlsVisible(false); setSpeedOpen(false); } setHover(null); }}
      className={`group/player relative isolate w-full select-none overflow-hidden bg-black outline-none focus-visible:ring-2 focus-visible:ring-[#C4D600] ${fullscreen ? "h-full" : "aspect-video rounded-2xl shadow-sm"} ${showUi ? "" : "cursor-none"}`}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        autoPlay={autoPlay}
        playsInline
        preload="metadata"
        controlsList="nodownload"
        onContextMenu={(event) => event.preventDefault()}
        className="h-full w-full bg-black object-contain"
        onPlay={() => { setPlaying(true); revealControls(); }}
        onPause={() => { setPlaying(false); setControlsVisible(true); clearHide(); }}
        onEnded={() => { setPlaying(false); setControlsVisible(true); onEnded?.(); }}
        onLoadedMetadata={(event) => { setDuration(event.currentTarget.duration || 0); setVolume(event.currentTarget.volume); setMuted(event.currentTarget.muted); }}
        onDurationChange={(event) => setDuration(event.currentTarget.duration || 0)}
        onTimeUpdate={(event) => { if (!scrubbingRef.current) setCurrent(event.currentTarget.currentTime); }}
        onProgress={(event) => {
          const video = event.currentTarget;
          const ranges = video.buffered;
          for (let index = ranges.length - 1; index >= 0; index--) {
            if (ranges.start(index) <= video.currentTime) { setBuffered(ranges.end(index)); return; }
          }
          if (ranges.length) setBuffered(ranges.end(ranges.length - 1));
        }}
        onVolumeChange={(event) => { setVolume(event.currentTarget.volume); setMuted(event.currentTarget.muted); }}
        onRateChange={(event) => setRate(event.currentTarget.playbackRate)}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onCanPlay={() => setWaiting(false)}
      />

      {/* Área clicável do vídeo (clique alterna play/pause; duplo clique, tela cheia; toque mostra/oculta controles) */}
      <div className="absolute inset-0" onPointerUp={onSurfaceUp} aria-hidden />

      {/* Estado central: carregando, botão grande quando pausado e animação curta de ação */}
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        {waiting && playing ? (
          <Loader2 className="h-10 w-10 animate-spin text-white/90" />
        ) : !playing ? (
          <button
            type="button"
            onClick={togglePlay}
            aria-label="Reproduzir"
            className="pointer-events-auto grid h-16 w-16 cursor-pointer place-items-center rounded-full bg-[#051647]/70 text-white ring-1 ring-white/20 backdrop-blur-sm transition hover:scale-105 hover:bg-[#051647]/85 sm:h-20 sm:w-20"
          >
            <Play className="ml-1 h-7 w-7 fill-[#C4D600] text-[#C4D600] sm:h-9 sm:w-9" />
          </button>
        ) : null}
        {flash && playing && (
          <span key={flash.key} className="manual-player-flash absolute grid h-14 w-14 place-items-center rounded-full bg-black/45 text-white">
            {flash.kind === "play" ? <Play className="ml-0.5 h-6 w-6 fill-white" /> : flash.kind === "pause" ? <Pause className="h-6 w-6 fill-white" /> : flash.kind === "back" ? <RotateCcw className="h-6 w-6" /> : <RotateCw className="h-6 w-6" />}
          </span>
        )}
      </div>

      {/* Gradiente e barra de controles */}
      <div className={`pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/80 via-black/35 to-transparent transition-opacity duration-300 ${showUi ? "opacity-100" : "opacity-0"}`} aria-hidden />
      <div className={`absolute inset-x-0 bottom-0 px-3 pb-2 transition-all duration-300 sm:px-4 sm:pb-3 ${showUi ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"}`}>
        {/* Timeline */}
        <div
          ref={trackRef}
          role="slider"
          tabIndex={-1}
          aria-label="Posição do vídeo"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(current)}
          aria-valuetext={`${formatTime(current)} de ${formatTime(duration)}`}
          onPointerDown={onTrackDown}
          onPointerMove={onTrackMove}
          onPointerUp={onTrackUp}
          onPointerCancel={onTrackUp}
          onPointerLeave={(event) => { if (event.pointerType === "mouse" && !scrubbingRef.current) setHover(null); }}
          className="group/track relative flex h-5 cursor-pointer touch-none items-center"
        >
          <div className={`relative w-full overflow-hidden rounded-full bg-white/25 transition-all ${scrubbing ? "h-1.5" : "h-1 group-hover/track:h-1.5"}`}>
            <div className="absolute inset-y-0 left-0 bg-white/40" style={{ width: `${bufferedPct}%` }} />
            {hover && !scrubbing && <div className="absolute inset-y-0 left-0 bg-white/20" style={{ width: hover.x }} />}
            <div className="absolute inset-y-0 left-0 bg-[#C4D600]" style={{ width: `${progress}%` }} />
          </div>
          <span
            className={`pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#C4D600] shadow ring-2 ring-[#051647]/30 transition-transform ${scrubbing ? "scale-125" : "scale-0 group-hover/track:scale-100"} max-sm:scale-100`}
            style={{ left: `${progress}%` }}
          />
          {hover && (
            <span
              className="pointer-events-none absolute bottom-6 -translate-x-1/2 rounded-md bg-[#051647] px-2 py-1 text-[11px] font-semibold tabular-nums text-white shadow-lg ring-1 ring-white/10"
              style={{ left: clamp(hover.x, 22, hover.width - 22) }}
            >
              {formatTime(hover.time)}
            </span>
          )}
        </div>

        {/* Botões */}
        <div className="mt-1 flex items-center gap-0.5 sm:gap-1">
          <button type="button" onClick={togglePlay} aria-label={playing ? "Pausar (K)" : "Reproduzir (K)"} title={playing ? "Pausar (K)" : "Reproduzir (K)"} className={iconButton}>
            {playing ? <Pause className="h-5 w-5 fill-current" /> : <Play className="ml-0.5 h-5 w-5 fill-current" />}
          </button>
          <button type="button" onClick={() => seekBy(-10)} aria-label="Voltar 10 segundos" title="Voltar 10 s" className={iconButton}>
            <span className="relative grid place-items-center"><RotateCcw className="h-5 w-5" /><span className="absolute text-[8px] font-bold">10</span></span>
          </button>
          <button type="button" onClick={() => seekBy(10)} aria-label="Avançar 10 segundos" title="Avançar 10 s" className={iconButton}>
            <span className="relative grid place-items-center"><RotateCw className="h-5 w-5" /><span className="absolute text-[8px] font-bold">10</span></span>
          </button>

          <div className="group/volume flex items-center">
            <button type="button" onClick={toggleMute} aria-label={effectiveVolume === 0 ? "Ativar som (M)" : "Silenciar (M)"} title={effectiveVolume === 0 ? "Ativar som (M)" : "Silenciar (M)"} className={iconButton}>
              <VolumeIcon className="h-5 w-5" />
            </button>
            <div
              ref={volumeRef}
              role="slider"
              tabIndex={-1}
              aria-label="Volume"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(effectiveVolume * 100)}
              onPointerDown={onVolumeDown}
              onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) setVolumeFromPointer(event.clientX); }}
              className="relative hidden h-5 w-0 cursor-pointer touch-none items-center overflow-hidden transition-all duration-200 group-hover/volume:mr-1 group-hover/volume:w-20 group-focus-within/volume:mr-1 group-focus-within/volume:w-20 sm:flex"
            >
              <div className="relative h-1 w-full rounded-full bg-white/25">
                <div className="absolute inset-y-0 left-0 rounded-full bg-white" style={{ width: `${effectiveVolume * 100}%` }} />
              </div>
              <span className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow" style={{ left: `clamp(6px, ${effectiveVolume * 100}%, calc(100% - 6px))` }} />
            </div>
          </div>

          <span className="ml-1 whitespace-nowrap text-xs font-medium tabular-nums text-white/90 sm:text-[13px]">
            {formatTime(current)} <span className="text-white/50">/ {formatTime(duration)}</span>
          </span>

          <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
            <div className="relative">
              <button
                type="button"
                onClick={(event) => { event.stopPropagation(); setSpeedOpen((open) => !open); revealControls(); }}
                aria-haspopup="menu"
                aria-expanded={speedOpen}
                aria-label="Velocidade de reprodução"
                title="Velocidade"
                className="h-9 min-w-11 cursor-pointer rounded-full px-2 text-xs font-bold tabular-nums text-white/90 transition hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4D600]"
              >
                {rate}x
              </button>
              {speedOpen && (
                <div role="menu" className="absolute bottom-11 right-0 z-10 w-28 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-xl dark:border-slate-700 dark:bg-[#07194f]">
                  <p className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Velocidade</p>
                  {SPEEDS.map((speed) => (
                    <button
                      key={speed}
                      type="button"
                      role="menuitemradio"
                      aria-checked={rate === speed}
                      onClick={() => changeRate(speed)}
                      className={`flex w-full cursor-pointer items-center justify-between px-3 py-1.5 text-left tabular-nums transition hover:bg-slate-50 dark:hover:bg-white/5 ${rate === speed ? "font-semibold text-[#002187] dark:text-[#C4D600]" : "text-slate-700 dark:text-slate-200"}`}
                    >
                      {speed === 1 ? "Normal" : `${speed}x`}
                      {rate === speed && <span className="h-1.5 w-1.5 rounded-full bg-[#C4D600]" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {pipSupported && (
              <button type="button" onClick={() => void togglePip()} aria-label="Picture-in-picture" title="Picture-in-picture" className={`${iconButton} max-sm:hidden`}>
                <PictureInPicture2 className="h-5 w-5" />
              </button>
            )}
            <button type="button" onClick={toggleFullscreen} aria-label={fullscreen ? "Sair da tela cheia (F)" : "Tela cheia (F)"} title={fullscreen ? "Sair da tela cheia (F)" : "Tela cheia (F)"} className={iconButton}>
              {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
