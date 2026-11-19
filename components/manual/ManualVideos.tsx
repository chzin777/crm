"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown,
  ArrowUp,
  Clapperboard,
  FileVideo,
  ListVideo,
  Loader2,
  MoreVertical,
  Pencil,
  Play,
  Plus,
  Search,
  SkipBack,
  SkipForward,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/ToastProvider";
import { FormSelect } from "@/components/FormSelect";
import { CustomVideoPlayer } from "@/components/manual/CustomVideoPlayer";

type Video = {
  id: string;
  title: string;
  description: string;
  category: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  duration: number | null;
  sizeBytes: number;
  order: number;
  createdAt?: string;
};

/** Categorias dos treinamentos (acompanham os módulos do CRM). */
const VIDEO_CATEGORIES = [
  "Primeiros passos",
  "Atendimento",
  "Filas e equipe",
  "Pipelines",
  "Contatos e segmentos",
  "Campanhas",
  "Modelos WhatsApp",
  "Automações",
  "Inteligência Artificial",
  "Clientes VIP e pontuação",
  "NPS e métricas",
  "Lojas",
  "Administração",
];
const NO_CATEGORY = "Sem categoria";

const ACCEPT = ".mp4,.webm,.mov,.m4v,video/mp4,video/webm,video/quicktime";
const ALLOWED_EXTENSIONS = ["mp4", "webm", "mov", "m4v"];
const MAX_BYTES = 2 * 1024 * 1024 * 1024;
const CHUNK_BYTES = 8 * 1024 * 1024;
const AUTOPLAY_KEY = "manual:videos:autoplay";

const normalize = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const formatDuration = (seconds: number | null) => {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
};
const formatSize = (bytes: number) => (bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`);
const formatDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Sao_Paulo" }) : "");

const inputClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]";
const primaryButton = "inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#051647] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#002187] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#d4e400]";
const ghostButton = "inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800";
const navButton = "inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-slate-100 px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/15";

/** Lê duração e um quadro (miniatura JPEG) do arquivo local, sem enviar nada. Falha silenciosa: os dois são opcionais. */
function probeVideo(file: File): Promise<{ duration: number | null; thumbnail: string | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    let settled = false;
    const finish = (result: { duration: number | null; thumbnail: string | null }) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(result);
    };
    const timer = window.setTimeout(() => finish({ duration: Number.isFinite(video.duration) ? video.duration : null, thumbnail: null }), 8000);
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(2, (video.duration || 1) / 3);
    };
    video.onseeked = () => {
      try {
        const width = Math.min(640, video.videoWidth || 640);
        const height = Math.round(width * ((video.videoHeight || 360) / (video.videoWidth || 640)));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d")?.drawImage(video, 0, 0, width, height);
        window.clearTimeout(timer);
        finish({ duration: Number.isFinite(video.duration) ? video.duration : null, thumbnail: canvas.toDataURL("image/jpeg", 0.75) });
      } catch {
        window.clearTimeout(timer);
        finish({ duration: Number.isFinite(video.duration) ? video.duration : null, thumbnail: null });
      }
    };
    video.onerror = () => {
      window.clearTimeout(timer);
      finish({ duration: null, thumbnail: null });
    };
    video.src = url;
  });
}

async function readJson<T>(response: Response): Promise<T & { error?: string }> {
  return (await response.json().catch(() => ({}))) as T & { error?: string };
}

function readAutoplay() {
  try {
    return window.localStorage.getItem(AUTOPLAY_KEY) !== "0";
  } catch {
    return true;
  }
}

/** Miniatura do vídeo (quadro capturado no envio) com duração no canto. */
function Thumb({ video, className }: { video: Video; className: string }) {
  return (
    <span className={`relative grid shrink-0 place-items-center overflow-hidden rounded-lg bg-[#051647] ${className}`}>
      {video.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- miniatura privada servida pela API
        <img src={video.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <FileVideo className="h-6 w-6 text-[#C4D600]/80" />
      )}
      {video.duration ? <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1 py-px text-[10px] font-semibold tabular-nums text-white">{formatDuration(video.duration)}</span> : null}
    </span>
  );
}

type MenuState = { video: Video; top: number; left: number };

/** Vídeos & Treinamentos: player grande à esquerda e playlist à direita (estilo YouTube). */
export function ManualVideos() {
  const toast = useToast();
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [autoStart, setAutoStart] = useState(false);
  const [autoplay, setAutoplay] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [form, setForm] = useState<{ mode: "new" | "edit"; video?: Video } | null>(null);
  const [deleting, setDeleting] = useState<Video | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const activeItemRef = useRef<HTMLLIElement>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/manual/videos", { cache: "no-store" });
      const body = await readJson<{ data?: Video[] }>(response);
      if (!response.ok) throw new Error(body.error || "Não foi possível carregar os vídeos.");
      setVideos(body.data ?? []);
      setLoadError("");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Não foi possível carregar os vídeos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/manual/videos", { cache: "no-store" })
      .then(async (response) => {
        const body = await readJson<{ data?: Video[] }>(response);
        if (!response.ok) throw new Error(body.error || "Não foi possível carregar os vídeos.");
        if (active) setVideos(body.data ?? []);
      })
      .catch((error: unknown) => { if (active) setLoadError(error instanceof Error ? error.message : "Não foi possível carregar os vídeos."); })
      .finally(() => { if (active) { setLoading(false); setAutoplay(readAutoplay()); } });
    fetch("/api/me/permissions")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { data?: { isAdmin?: boolean } } | null) => { if (active) setIsAdmin(body?.data?.isAdmin === true); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  // Menu "..." fecha ao rolar, redimensionar ou apertar Esc.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const categories = useMemo(() => [...new Set(videos.map((video) => video.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")), [videos]);
  const playlist = useMemo(() => {
    const term = normalize(query.trim());
    return videos.filter((video) =>
      (!category || video.category === category) &&
      (!term || normalize(`${video.title} ${video.description} ${video.category}`).includes(term)));
  }, [videos, query, category]);
  const current = videos.find((video) => video.id === currentId) ?? playlist[0] ?? videos[0] ?? null;
  const position = current ? playlist.findIndex((video) => video.id === current.id) : -1;
  const previous = position > 0 ? playlist[position - 1] : null;
  const next = position >= 0 && position < playlist.length - 1 ? playlist[position + 1] : null;
  const filtering = Boolean(query.trim() || category);

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: "nearest" });
  }, [current?.id]);

  const play = (video: Video, start = true) => {
    setCurrentId(video.id);
    setAutoStart(start);
    setExpanded(false);
  };

  const toggleAutoplay = () => {
    setAutoplay((value) => {
      try { window.localStorage.setItem(AUTOPLAY_KEY, value ? "0" : "1"); } catch { /* preferência só deste navegador */ }
      return !value;
    });
  };

  const move = async (video: Video, direction: -1 | 1) => {
    const index = videos.findIndex((item) => item.id === video.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= videos.length) return;
    const reordered = [...videos];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setVideos(reordered);
    const response = await fetch("/api/manual/videos/reorder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: reordered.map((item) => item.id) }) });
    if (!response.ok) {
      toast.error("Não foi possível mudar a ordem", (await readJson(response)).error);
      void load();
      return;
    }
    toast.success("Ordem atualizada", `"${video.title}" foi movido para a posição ${target + 1}.`);
  };

  const remove = async () => {
    if (!deleting) return;
    const response = await fetch(`/api/manual/videos/${deleting.id}`, { method: "DELETE" });
    if (!response.ok) {
      toast.error("Não foi possível excluir o vídeo", (await readJson(response)).error);
      return;
    }
    toast.success("Vídeo excluído", `"${deleting.title}" saiu da playlist.`);
    if (currentId === deleting.id) setCurrentId(null);
    setVideos((items) => items.filter((item) => item.id !== deleting.id));
    setDeleting(null);
  };

  const openMenu = (video: Video, button: HTMLButtonElement) => {
    const rect = button.getBoundingClientRect();
    const width = 200;
    setMenu({ video, top: Math.min(rect.bottom + 4, window.innerHeight - 190), left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)) });
  };

  if (loading) {
    return <p className="flex items-center gap-2 py-16 text-sm text-slate-500 dark:text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Carregando treinamentos...</p>;
  }
  if (loadError) return <p role="alert" className="py-16 text-sm font-medium text-[#9a3d12] dark:text-[#F7915E]">{loadError}</p>;

  const description = current?.description ?? "";
  const longDescription = description.length > 220 || description.split("\n").length > 3;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,7fr)_minmax(340px,3fr)]">
      {/* Coluna principal: player e informações da aula */}
      <section aria-label="Player" className="min-w-0">
        {current ? (
          <>
            <CustomVideoPlayer
              key={current.id}
              src={current.videoUrl}
              poster={current.thumbnailUrl ?? undefined}
              autoPlay={autoStart}
              title={current.title}
              onEnded={() => { if (autoplay && next) play(next); }}
            />
            <div className="mt-4 min-w-0 break-words">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                {current.category && <span className="rounded-full bg-[#C4D600]/25 px-2.5 py-0.5 font-semibold text-[#051647] dark:bg-[#C4D600]/15 dark:text-[#C4D600]">{current.category}</span>}
                {current.duration ? <span className="tabular-nums">{formatDuration(current.duration)}</span> : null}
                {current.createdAt && <span>Publicado em {formatDate(current.createdAt)}</span>}
              </div>
              <h2 className="mt-2 text-xl font-semibold leading-snug text-[#051647] sm:text-2xl dark:text-white">{current.title}</h2>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button type="button" disabled={!previous} onClick={() => previous && play(previous)} className={navButton}><SkipBack className="h-4 w-4" /> Anterior</button>
                <button type="button" disabled={!next} onClick={() => next && play(next)} className={navButton}>Próximo <SkipForward className="h-4 w-4" /></button>
                <button type="button" role="switch" aria-checked={autoplay} onClick={toggleAutoplay} className="ml-auto inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <span className={`relative h-5 w-9 rounded-full transition ${autoplay ? "bg-[#002187] dark:bg-[#C4D600]" : "bg-slate-300 dark:bg-slate-600"}`}>
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${autoplay ? "left-[18px]" : "left-0.5"}`} />
                  </span>
                  Reprodução automática
                </button>
              </div>

              {description && (
                <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700 dark:bg-white/5 dark:text-slate-300">
                  <p className={`whitespace-pre-line ${expanded ? "" : "line-clamp-3"}`}>{description}</p>
                  {longDescription && (
                    <button type="button" onClick={() => setExpanded((value) => !value)} className="mt-1 cursor-pointer text-sm font-semibold text-[#051647] hover:underline dark:text-white">
                      {expanded ? "Mostrar menos" : "Mostrar mais"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-2xl bg-[#051647] px-6 text-center text-white">
            <Clapperboard className="h-10 w-10 text-[#C4D600]" />
            <p className="text-lg font-semibold">Nenhum treinamento publicado ainda</p>
            <p className="max-w-sm text-sm text-slate-300">{isAdmin ? "Use “Adicionar vídeo” na playlist para publicar a primeira aula." : "Assim que a administração publicar as aulas, elas aparecem aqui."}</p>
          </div>
        )}
      </section>

      {/* Coluna lateral: playlist */}
      <aside aria-label="Playlist" className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start dark:border-slate-800 dark:bg-[#07194f]/40">
        <div className="space-y-3 border-b border-slate-200 p-4 dark:border-slate-800">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 truncate font-semibold text-[#051647] dark:text-white"><ListVideo className="h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]" />{category || "Todos os treinamentos"}</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {playlist.length === 0 ? "Nenhuma aula" : position >= 0 ? `Aula ${position + 1} de ${playlist.length}` : `${playlist.length} aula${playlist.length === 1 ? "" : "s"}`}
              </p>
            </div>
            {isAdmin && (
              <button type="button" onClick={() => setForm({ mode: "new" })} className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-[#051647] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#d4e400]">
                <Plus className="h-3.5 w-3.5" /> Adicionar vídeo
              </button>
            )}
          </div>
          {videos.length > 0 && (
            <>
              <label className="relative block">
                <span className="sr-only">Buscar aula</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar aula" className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-8 text-sm text-slate-800 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-[#C4D600]" />
                {query && <button type="button" onClick={() => setQuery("")} aria-label="Limpar busca" className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"><X className="h-3.5 w-3.5" /></button>}
              </label>
              {categories.length > 0 && (
                <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5" role="group" aria-label="Filtrar por módulo">
                  {["", ...categories].map((item) => {
                    const selected = category === item;
                    return (
                      <button
                        key={item || "todos"}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setCategory(item)}
                        className={`shrink-0 cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition ${selected ? "bg-[#051647] text-white dark:bg-white dark:text-[#051647]" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-300 dark:hover:bg-white/15"}`}
                      >
                        {item || "Todos"}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <ol className="min-h-0 flex-1 overflow-y-auto p-2 lg:max-h-none">
          {playlist.map((video, index) => {
            const active = current?.id === video.id;
            return (
              <li key={video.id} ref={active ? activeItemRef : undefined} className={`group relative flex items-start gap-1 rounded-xl transition ${active ? "bg-[#002187]/[0.07] dark:bg-[#C4D600]/10" : "hover:bg-slate-50 dark:hover:bg-white/5"}`}>
                <button type="button" onClick={() => play(video)} aria-current={active ? "true" : undefined} className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5 p-2 text-left">
                  <span className="mt-6 w-5 shrink-0 text-center text-xs tabular-nums text-slate-400">
                    {active ? <Play className="mx-auto h-3 w-3 fill-[#002187] text-[#002187] dark:fill-[#C4D600] dark:text-[#C4D600]" /> : index + 1}
                  </span>
                  <Thumb video={video} className="aspect-video w-32 sm:w-36" />
                  <span className="min-w-0 flex-1 break-words pr-6">
                    <span className={`line-clamp-2 text-sm leading-snug ${active ? "font-semibold text-[#051647] dark:text-white" : "font-medium text-slate-800 dark:text-slate-100"}`}>{video.title}</span>
                    {video.category && <span className="mt-1 block truncate text-xs text-slate-500 dark:text-slate-400">{video.category}</span>}
                  </span>
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    aria-label={`Ações de ${video.title}`}
                    aria-haspopup="menu"
                    onClick={(event) => openMenu(video, event.currentTarget)}
                    className="absolute right-1.5 top-2 cursor-pointer rounded-full p-1.5 text-slate-400 opacity-100 transition hover:bg-slate-200 hover:text-slate-700 lg:opacity-0 lg:group-hover:opacity-100 lg:focus:opacity-100 dark:hover:bg-white/10 dark:hover:text-white"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                )}
              </li>
            );
          })}
          {videos.length > 0 && playlist.length === 0 && <li className="px-3 py-8 text-center text-sm text-slate-500 dark:text-slate-400">Nenhuma aula encontrada.</li>}
          {videos.length === 0 && <li className="px-3 py-8 text-center text-sm text-slate-500 dark:text-slate-400">A playlist está vazia.</li>}
        </ol>
      </aside>

      {menu && createPortal(
        <>
          <div className="fixed inset-0 z-[90]" onMouseDown={() => setMenu(null)} aria-hidden />
          <div role="menu" style={{ top: menu.top, left: menu.left }} className="fixed z-[95] w-[200px] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-xl dark:border-slate-700 dark:bg-[#07194f]">
            {(() => {
              const index = videos.findIndex((item) => item.id === menu.video.id);
              const items = [
                { label: "Editar", icon: Pencil, onClick: () => setForm({ mode: "edit", video: menu.video }), disabled: false },
                { label: "Mover para cima", icon: ArrowUp, onClick: () => void move(menu.video, -1), disabled: filtering || index <= 0 },
                { label: "Mover para baixo", icon: ArrowDown, onClick: () => void move(menu.video, 1), disabled: filtering || index >= videos.length - 1 },
              ];
              return (
                <>
                  {items.map((item) => (
                    <button key={item.label} type="button" role="menuitem" disabled={item.disabled} onClick={() => { setMenu(null); item.onClick(); }} className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-200 dark:hover:bg-white/5">
                      <item.icon className="h-4 w-4 text-slate-400" /> {item.label}
                    </button>
                  ))}
                  {filtering && <p className="px-3 pb-1 text-[11px] text-slate-400">Limpe a busca e o filtro para reordenar.</p>}
                  <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                  <button type="button" role="menuitem" onClick={() => { setDeleting(menu.video); setMenu(null); }} className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40">
                    <Trash2 className="h-4 w-4" /> Excluir
                  </button>
                </>
              );
            })()}
          </div>
        </>,
        document.body,
      )}

      {form && (
        <VideoFormDialog
          mode={form.mode}
          video={form.video}
          categories={categories}
          onClose={() => setForm(null)}
          onSaved={(saved) => {
            setVideos((items) => (form.mode === "new" ? [...items, saved] : items.map((item) => (item.id === saved.id ? saved : item))));
            if (form.mode === "new") play(saved, false);
            setForm(null);
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Excluir vídeo"
          description={`"${deleting.title}" será removido da playlist e o arquivo será apagado. Essa ação não pode ser desfeita.`}
          confirmLabel="Excluir vídeo"
          variant="destructive"
          onConfirm={remove}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

function VideoFormDialog({ mode, video, categories, onClose, onSaved }: { mode: "new" | "edit"; video?: Video; categories: string[]; onClose: () => void; onSaved: (video: Video) => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(video?.title ?? "");
  const [description, setDescription] = useState(video?.description ?? "");
  const [category, setCategory] = useState(video?.category ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const cancelled = useRef(false);
  const uploading = progress !== null;
  // Lista fixa; uma categoria antiga fora da lista continua aparecendo para não se perder ao editar.
  const categoryOptions = [NO_CATEGORY, ...VIDEO_CATEGORIES, ...categories.filter((item) => !VIDEO_CATEGORIES.includes(item))];

  useEffect(() => () => { cancelled.current = true; }, []);

  const pickFile = (picked: File | null) => {
    setError("");
    if (!picked) return setFile(null);
    const extension = picked.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXTENSIONS.includes(extension)) return setError("Formato não suportado. Envie um vídeo .mp4, .webm ou .mov.");
    if (picked.size > MAX_BYTES) return setError("O vídeo passa do limite de 2 GB.");
    setFile(picked);
    if (!title.trim()) setTitle(picked.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim());
  };

  const saveEdit = async () => {
    if (!video) return;
    const response = await fetch(`/api/manual/videos/${video.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, category }),
    });
    const body = await readJson<{ data?: Video }>(response);
    if (!response.ok || !body.data) throw new Error(body.error || "Não foi possível salvar.");
    toast.success("Vídeo atualizado", `"${body.data.title}" foi salvo.`);
    onSaved(body.data);
  };

  const upload = async () => {
    if (!file) throw new Error("Escolha o arquivo do vídeo.");
    setProgress(0);
    const probe = await probeVideo(file);
    const initResponse = await fetch("/api/manual/videos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "init", fileName: file.name, size: file.size }),
    });
    const init = await readJson<{ key?: string; uploadId?: string }>(initResponse);
    if (!initResponse.ok || !init.key || !init.uploadId) throw new Error(init.error || "Não foi possível iniciar o envio.");
    const { key, uploadId } = init;
    const abort = () => fetch("/api/manual/videos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "abort", key, uploadId }) }).catch(() => undefined);

    try {
      const parts: { partNumber: number; etag: string }[] = [];
      const total = Math.max(1, Math.ceil(file.size / CHUNK_BYTES));
      for (let index = 0; index < total; index++) {
        if (cancelled.current) throw new Error("Envio cancelado.");
        const chunk = file.slice(index * CHUNK_BYTES, Math.min(file.size, (index + 1) * CHUNK_BYTES));
        let attempt = 0;
        for (;;) {
          const response = await fetch(`/api/manual/videos/upload?key=${encodeURIComponent(key)}&uploadId=${encodeURIComponent(uploadId)}&part=${index + 1}`, {
            method: "PUT",
            headers: { "Content-Type": "application/octet-stream" },
            body: chunk,
          }).catch(() => null);
          const body = response ? await readJson<{ etag?: string }>(response) : null;
          if (response?.ok && body?.etag) {
            parts.push({ partNumber: index + 1, etag: body.etag });
            break;
          }
          if (++attempt >= 3) throw new Error(body?.error || "A conexão caiu durante o envio. Tente novamente.");
          await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
        }
        setProgress(Math.round(((index + 1) / total) * 97));
      }
      const completeResponse = await fetch("/api/manual/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete", key, uploadId, parts, size: file.size, title, description, category, duration: probe.duration, thumbnail: probe.thumbnail }),
      });
      const complete = await readJson<{ data?: Video }>(completeResponse);
      if (!completeResponse.ok || !complete.data) throw new Error(complete.error || "Não foi possível concluir o envio.");
      setProgress(100);
      toast.success("Vídeo publicado", `"${complete.data.title}" já está disponível para a equipe.`);
      onSaved(complete.data);
    } catch (error) {
      void abort();
      throw error;
    }
  };

  const submit = async () => {
    if (!title.trim()) return setError("Informe o título do vídeo.");
    setError("");
    try {
      if (mode === "edit") await saveEdit();
      else await upload();
    } catch (err) {
      setProgress(null);
      setError(err instanceof Error ? err.message : "Não foi possível salvar o vídeo.");
    }
  };

  return (
    <EntityDialog
      titleId="manual-video-dialog"
      title={mode === "new" ? "Adicionar vídeo" : "Editar vídeo"}
      description={mode === "new" ? "Publique um treinamento para toda a equipe. Formatos .mp4, .webm ou .mov, até 2 GB." : "Altere o título, a descrição ou a categoria do vídeo."}
      onClose={() => { if (!uploading) onClose(); }}
      size="sm"
    >
      <form className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
          <span>Título do vídeo <span aria-hidden="true" className="text-red-600 dark:text-red-400">*</span></span>
          <input value={title} maxLength={150} onChange={(event) => { setTitle(event.target.value); setError(""); }} disabled={uploading} className={inputClass} placeholder="Ex.: Como atender pelo /chat" />
        </label>
        <div className={uploading ? "pointer-events-none opacity-60" : ""}>
          <FormSelect
            label="Categoria"
            value={category || NO_CATEGORY}
            options={categoryOptions}
            onChange={(value) => setCategory(value === NO_CATEGORY ? "" : value)}
          />
        </div>
        <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
          <span>Descrição (opcional)</span>
          <textarea value={description} maxLength={2000} rows={3} onChange={(event) => setDescription(event.target.value)} disabled={uploading} className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]" />
        </label>
        {mode === "new" && (
          <label className={`flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 p-3 transition hover:border-[#002187] hover:bg-[#002187]/5 dark:border-slate-600 dark:hover:border-[#C4D600] dark:hover:bg-[#C4D600]/10 ${uploading ? "pointer-events-none opacity-60" : ""}`}>
            <input type="file" accept={ACCEPT} className="sr-only" disabled={uploading} onChange={(event) => pickFile(event.target.files?.[0] ?? null)} />
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#C4D600]/25 text-[#051647] dark:text-[#C4D600]"><Upload className="h-4 w-4" /></span>
            <span className="min-w-0 break-words text-xs">
              <span className="block font-semibold text-slate-800 dark:text-slate-100">{file ? file.name : "Escolher arquivo de vídeo"}</span>
              <span className="block text-slate-500 dark:text-slate-400">{file ? formatSize(file.size) : ".mp4, .webm ou .mov · até 2 GB"}</span>
            </span>
          </label>
        )}
        {uploading && (
          <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ?? 0} aria-label="Progresso do envio" className="space-y-1">
            <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className="h-full rounded-full bg-[#C4D600] transition-all" style={{ width: `${progress ?? 0}%` }} />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Enviando... {progress ?? 0}% — mantenha esta janela aberta.</p>
          </div>
        )}
        {error && <p role="alert" className="text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{error}</p>}
        <div className="mt-auto flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} disabled={uploading} className={ghostButton}>Cancelar</button>
          <button type="submit" disabled={uploading || !title.trim() || (mode === "new" && !file)} className={primaryButton}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "new" ? <Upload className="h-4 w-4" /> : null}
            {mode === "new" ? (uploading ? "Enviando..." : "Publicar vídeo") : "Salvar"}
          </button>
        </div>
      </form>
    </EntityDialog>
  );
}
