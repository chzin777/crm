"use client";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";

export type ViewerImage = { id: string; url: string; name: string };

export function MediaViewer({ images, startId, onClose }: { images: ViewerImage[]; startId: string; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [index, setIndex] = useState(() => Math.max(images.findIndex((image) => image.id === startId), 0));
  const go = useCallback((step: number) => setIndex((value) => Math.min(Math.max(value + step, 0), images.length - 1)), [images.length]);

  useEffect(() => {
    setMounted(true);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  const image = images[index];
  if (!mounted || !image) return null;
  const control = "grid h-10 w-10 cursor-pointer place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={image.name}
      className="fixed inset-0 z-[110] flex flex-col bg-[#051647]/90 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex shrink-0 items-center justify-end gap-2">
        <span className="mr-auto truncate text-sm text-white">{image.name} · {index + 1} de {images.length}</span>
        <a href={image.url} download={image.name} aria-label="Baixar" title="Baixar" className={control}><Download className="h-5 w-5" /></a>
        <button type="button" onClick={onClose} aria-label="Fechar" title="Fechar" className={control}><X className="h-5 w-5" /></button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-between gap-3">
        <button type="button" onClick={() => go(-1)} disabled={index === 0} aria-label="Anterior" title="Anterior" className={control}><ChevronLeft className="h-5 w-5" /></button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image.url} alt={image.name} className="max-h-full min-w-0 max-w-full object-contain" />
        <button type="button" onClick={() => go(1)} disabled={index === images.length - 1} aria-label="Próxima" title="Próxima" className={control}><ChevronRight className="h-5 w-5" /></button>
      </div>
    </div>,
    document.body,
  );
}
