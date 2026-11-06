"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

type Props = {
  anchor: RefObject<HTMLElement | null>;
  label: string;
  onClose: () => void;
  children: ReactNode;
};

const GAP = 8;
const MARGIN = 8;

/** Painel flutuante logo acima do botão que o abriu; só fecha por fora, então aceita vários cliques. */
export function ComposerPopover({ anchor, label, onClose, children }: Props) {
  const [position, setPosition] = useState<{ left: number; bottom: number } | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!anchor.current || !panel.current) return;
    const rect = anchor.current.getBoundingClientRect();
    const left = Math.min(rect.left, window.innerWidth - panel.current.offsetWidth - MARGIN);
    setPosition({ left: Math.max(MARGIN, left), bottom: window.innerHeight - rect.top + GAP });
  }, [anchor]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (anchor.current?.contains(target) || panel.current?.contains(target)) return;
      onClose();
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", onClose);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-label={label}
      className={`fixed z-[99999] max-w-[calc(100vw-16px)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl transition-opacity duration-150 dark:border-slate-800 dark:bg-[#07194f] ${position ? "opacity-100" : "opacity-0"}`}
      style={position ?? { left: MARGIN, bottom: MARGIN }}
    >
      {children}
    </div>,
    document.body,
  );
}
