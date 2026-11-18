"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Clapperboard, FileVideo, Loader2, Pencil, PlayCircle, Plus, Search, Trash2, Upload } from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/ToastProvider";

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
};

const ACCEPT = ".mp4,.webm,.mov,.m4v,video/mp4,video/webm,video/quicktime";
const ALLOWED_EXTENSIONS = ["mp4", "webm", "mov", "m4v"];
const MAX_BYTES = 2 * 1024 * 1024 * 1024;
const CHUNK_BYTES = 8 * 1024 * 1024;

const normalize = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const formatDuration = (seconds: number | null) => {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
};
const formatSize = (bytes: number) => (bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`);

const inputClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]";
const primaryButton = "inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#051647] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#002187] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#d4e400]";
const ghostButton = "inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800";

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

/** Seção "Vídeos & Treinamentos": galeria com busca e player; administradores enviam, editam, ordenam e excluem. */
export function ManualVideos() {
  const toast = useToast();
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [form, setForm] = useState<{ mode: "new" | "edit"; video?: Video } | null>(null);
  const [deleting, setDeleting] = useState<Video | null>(null);

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
      .finally(() => { if (active) setLoading(false); });
    fetch("/api/me/permissions")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { data?: { isAdmin?: boolean } } | null) => { if (active) setIsAdmin(body?.data?.isAdmin === true); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const categories = useMemo(() => [...new Set(videos.map((video) => video.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")), [videos]);
  const filtered = useMemo(() => {
    const term = normalize(query.trim());
    return videos.filter((video) =>
      (!category || video.category === category) &&
      (!term || normalize(`${video.title} ${video.description} ${video.category}`).includes(term)));
  }, [videos, query, category]);
  const current = filtered.find((video) => video.id === currentId) ?? filtered[0] ?? null;

  const move = async (video: Video, direction: -1 | 1) => {
    const index = videos.findIndex((item) => item.id === video.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= videos.length) return;
    const next = [...videos];
    [next[index], next[target]] = [next[target], next[index]];
    setVideos(next);
    const response = await fetch("/api/manual/videos/reorder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: next.map((item) => item.id) }) });
    if (!response.ok) {
      toast.error("Não foi possível mudar a ordem", (await readJson(response)).error);
      void load();
    }
  };

  const remove = async () => {
    if (!deleting) return;
    const response = await fetch(`/api/manual/videos/${deleting.id}`, { method: "DELETE" });
    if (!response.ok) {
      toast.error("Não foi possível excluir o vídeo", (await readJson(response)).error);
      return;
    }
    toast.success("Vídeo excluído", `"${deleting.title}" saiu da galeria.`);
    setVideos((items) => items.filter((item) => item.id !== deleting.id));
    setDeleting(null);
  };

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Buscar vídeo</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por título, descrição ou categoria" className={`${inputClass} pl-9`} />
        </label>
        {categories.length > 0 && (
          <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filtrar por categoria" className={`${inputClass} cursor-pointer sm:w-56`}>
            <option value="">Todas as categorias</option>
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        )}
        {isAdmin && (
          <button type="button" onClick={() => setForm({ mode: "new" })} className={primaryButton}>
            <Plus className="h-4 w-4" /> Adicionar vídeo
          </button>
        )}
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-slate-500 dark:text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Carregando vídeos...</p>
      ) : loadError ? (
        <p role="alert" className="text-sm font-medium text-[#9a3d12] dark:text-[#F7915E]">{loadError}</p>
      ) : videos.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500 dark:border-slate-700 dark:text-slate-400">
          <Clapperboard className="h-8 w-8 text-slate-400" />
          <p className="font-semibold text-slate-700 dark:text-slate-200">Nenhum vídeo de treinamento ainda</p>
          <p className="text-xs">{isAdmin ? "Use \"Adicionar vídeo\" para publicar o primeiro treinamento." : "Os vídeos publicados pela administração aparecem aqui."}</p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-slate-500 dark:text-slate-400">Nenhum vídeo encontrado para essa busca.</p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          {current && (
            <div className="min-w-0 space-y-2">
              <div className="overflow-hidden rounded-xl bg-black">
                <video
                  key={current.id}
                  src={current.videoUrl}
                  poster={current.thumbnailUrl ?? undefined}
                  controls
                  playsInline
                  preload="metadata"
                  controlsList="nodownload"
                  className="aspect-video w-full bg-black"
                />
              </div>
              <div className="min-w-0 break-words">
                <h4 className="text-base font-semibold text-slate-900 dark:text-white">{current.title}</h4>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {[current.category, formatDuration(current.duration)].filter(Boolean).join(" · ")}
                </p>
                {current.description && <p className="mt-2 whitespace-pre-line text-slate-600 dark:text-slate-300">{current.description}</p>}
              </div>
            </div>
          )}
          <ol aria-label="Lista de vídeos" className="max-h-[560px] min-w-0 space-y-2 overflow-y-auto pr-1">
            {filtered.map((video) => {
              const active = current?.id === video.id;
              const globalIndex = videos.findIndex((item) => item.id === video.id);
              return (
                <li key={video.id} className={`flex min-w-0 gap-2 rounded-xl border p-2 transition ${active ? "border-[#002187] bg-[#002187]/5 dark:border-[#C4D600] dark:bg-[#C4D600]/10" : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/60"}`}>
                  <button type="button" onClick={() => setCurrentId(video.id)} className="flex min-w-0 flex-1 cursor-pointer gap-3 text-left" aria-current={active ? "true" : undefined}>
                    <span className="relative grid aspect-video w-28 shrink-0 place-items-center overflow-hidden rounded-lg bg-[#051647]">
                      {video.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- miniatura privada servida pela API
                        <img src={video.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <FileVideo className="h-6 w-6 text-[#C4D600]" />
                      )}
                      <PlayCircle className="absolute h-7 w-7 text-white/90 drop-shadow" />
                      {video.duration ? <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[10px] font-semibold text-white">{formatDuration(video.duration)}</span> : null}
                    </span>
                    <span className="min-w-0 break-words">
                      <span className="line-clamp-2 text-xs font-semibold text-slate-900 dark:text-white">{video.title}</span>
                      {video.category && <span className="mt-1 block truncate text-[10px] text-slate-500 dark:text-slate-400">{video.category}</span>}
                    </span>
                  </button>
                  {isAdmin && (
                    <span className="flex shrink-0 flex-col gap-0.5">
                      <button type="button" title="Subir na lista" aria-label={`Subir ${video.title}`} disabled={globalIndex <= 0 || Boolean(query || category)} onClick={() => void move(video, -1)} className="cursor-pointer rounded p-1 text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-slate-700"><ArrowUp className="h-3.5 w-3.5" /></button>
                      <button type="button" title="Descer na lista" aria-label={`Descer ${video.title}`} disabled={globalIndex >= videos.length - 1 || Boolean(query || category)} onClick={() => void move(video, 1)} className="cursor-pointer rounded p-1 text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-slate-700"><ArrowDown className="h-3.5 w-3.5" /></button>
                      <button type="button" title="Editar" aria-label={`Editar ${video.title}`} onClick={() => setForm({ mode: "edit", video })} className="cursor-pointer rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"><Pencil className="h-3.5 w-3.5" /></button>
                      <button type="button" title="Excluir" aria-label={`Excluir ${video.title}`} onClick={() => setDeleting(video)} className="cursor-pointer rounded p-1 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"><Trash2 className="h-3.5 w-3.5" /></button>
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {form && (
        <VideoFormDialog
          mode={form.mode}
          video={form.video}
          categories={categories}
          onClose={() => setForm(null)}
          onSaved={(saved) => {
            setVideos((items) => (form.mode === "new" ? [...items, saved] : items.map((item) => (item.id === saved.id ? saved : item))));
            if (form.mode === "new") setCurrentId(saved.id);
            setForm(null);
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Excluir vídeo"
          description={`"${deleting.title}" será removido da galeria e o arquivo será apagado. Essa ação não pode ser desfeita.`}
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
        <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
          <span>Categoria (opcional)</span>
          <input value={category} maxLength={60} list="manual-video-categories" onChange={(event) => setCategory(event.target.value)} disabled={uploading} className={inputClass} placeholder="Ex.: Atendimento, Campanhas, Automações" />
          <datalist id="manual-video-categories">{categories.map((item) => <option key={item} value={item} />)}</datalist>
        </label>
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
