"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Check } from "lucide-react";

export type FloatingMenuItem = {
  label: string;
  icon?: ReactNode;
  onSelect?: () => void;
  href?: string;
  danger?: boolean;
  checked?: boolean;
  hidden?: boolean;
};

type Props = {
  label: string;
  trigger: ReactNode;
  triggerClassName: string;
  widthClassName: string;
  items: FloatingMenuItem[];
  align?: "left" | "right";
  compact?: boolean;
};

const GAP = 6;
const MARGIN = 8;

type PanelProps = {
  label: string;
  items: FloatingMenuItem[];
  widthClassName: string;
  compact: boolean;
  panelRef: RefObject<HTMLDivElement | null>;
  style: { top: number; left?: number; right?: number } | null;
  onClose: (restoreFocus: boolean) => void;
};

/** Painel do menu (portal no body), usado pelo botão de 3 pontinhos e pelo clique direito. */
function MenuPanel({ label, items, widthClassName, compact, panelRef, style, onClose }: PanelProps) {
  const visible = items.filter((item) => !item.hidden);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose(true);
      return;
    }
    if (event.key === "Tab") {
      onClose(false);
      return;
    }
    const entries = Array.from(panelRef.current?.querySelectorAll<HTMLElement>("[data-menu-item]") ?? []);
    if (entries.length === 0) return;
    const current = entries.indexOf(document.activeElement as HTMLElement);
    const targets: Record<string, number> = {
      ArrowDown: (current + 1) % entries.length,
      ArrowUp: (current - 1 + entries.length) % entries.length,
      Home: 0,
      End: entries.length - 1,
    };
    if (event.key in targets) {
      event.preventDefault();
      entries[targets[event.key]].focus();
    }
  };

  return createPortal(
    <div
      ref={panelRef}
      role="menu"
      aria-label={label}
      onKeyDown={handleKeyDown}
      onContextMenu={(event) => event.preventDefault()}
      className={`fixed z-[99999] max-h-72 max-w-[calc(100vw-16px)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl transition-opacity duration-150 dark:border-slate-800 dark:bg-[#07194f] ${widthClassName} ${style ? "opacity-100" : "opacity-0"}`}
      style={style ?? { top: 0, right: MARGIN }}
    >
      {visible.map((item) => {
        const className = `flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-left ${compact ? "text-xs" : "text-sm"} outline-none transition-colors hover:bg-slate-100 focus-visible:bg-slate-100 dark:hover:bg-white/10 dark:focus-visible:bg-white/10 ${item.danger ? "text-red-600 dark:text-red-300" : "text-slate-700 dark:text-slate-200"}`;
        const content = (
          <>
            {item.icon && <span className="grid h-4 w-4 shrink-0 place-items-center">{item.icon}</span>}
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.checked && <Check className="h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]" />}
          </>
        );
        const role = item.checked === undefined ? "menuitem" : "menuitemradio";
        return item.href ? (
          <Link key={item.label} href={item.href} data-menu-item role={role} onClick={() => onClose(false)} className={className}>{content}</Link>
        ) : (
          <button
            key={item.label}
            type="button"
            data-menu-item
            role={role}
            aria-checked={item.checked}
            onClick={() => {
              onClose(false);
              item.onSelect?.();
            }}
            className={className}
          >
            {content}
          </button>
        );
      })}
    </div>,
    document.body
  );
}

/** Fecha ao clicar fora, rolar a lista ou redimensionar a janela. */
function useDismiss(active: boolean, refs: RefObject<HTMLElement | null>[], close: () => void, closeOnScroll = false) {
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => {
    if (!active) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (refs.some((ref) => ref.current?.contains(target))) return;
      closeRef.current();
    };
    const handleScroll = (event: Event) => {
      if (refs.some((ref) => ref.current?.contains(event.target as Node))) return;
      closeRef.current();
    };
    const handleClose = () => closeRef.current();
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("resize", handleClose);
    if (closeOnScroll) window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("resize", handleClose);
      if (closeOnScroll) window.removeEventListener("scroll", handleScroll, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, closeOnScroll]);
}

export function FloatingMenu({ label, trigger, triggerClassName, widthClassName, items, align = "right", compact = false }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setIsOpen(false);
    setPosition(null);
  };

  useLayoutEffect(() => {
    if (!isOpen || !buttonRef.current || !panelRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const height = panelRef.current.offsetHeight;
    const fitsBelow = rect.bottom + GAP + height <= window.innerHeight - MARGIN;
    setPosition({
      top: fitsBelow ? rect.bottom + GAP : Math.max(MARGIN, rect.top - GAP - height),
      right: Math.max(MARGIN, window.innerWidth - (align === "left" ? rect.left + panelRef.current.offsetWidth : rect.right)),
    });
    panelRef.current.querySelector<HTMLElement>("[data-menu-item]")?.focus({ preventScroll: true });
  }, [isOpen, align]);

  useDismiss(isOpen, [buttonRef, panelRef], close);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (isOpen ? close() : setIsOpen(true))}
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className={triggerClassName}
      >
        {trigger}
      </button>

      {isOpen && (
        <MenuPanel
          label={label}
          items={items}
          widthClassName={widthClassName}
          compact={compact}
          panelRef={panelRef}
          style={position}
          onClose={(restoreFocus) => {
            close();
            if (restoreFocus) buttonRef.current?.focus();
          }}
        />
      )}
    </>
  );
}

/** Mesmo menu aberto no ponto do clique direito; quem chama controla o ponto e o fechamento. */
export function ContextMenu({ label, items, point, widthClassName, onClose, compact = false }: { label: string; items: FloatingMenuItem[]; point: { x: number; y: number }; widthClassName: string; onClose: () => void; compact?: boolean }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!panelRef.current) return;
    const { offsetWidth: width, offsetHeight: height } = panelRef.current;
    setPosition({
      left: Math.max(MARGIN, Math.min(point.x, window.innerWidth - width - MARGIN)),
      top: point.y + height <= window.innerHeight - MARGIN ? point.y : Math.max(MARGIN, point.y - height),
    });
    panelRef.current.querySelector<HTMLElement>("[data-menu-item]")?.focus({ preventScroll: true });
  }, [point.x, point.y]);

  useDismiss(true, [panelRef], onClose, true);

  return <MenuPanel label={label} items={items} widthClassName={widthClassName} compact={compact} panelRef={panelRef} style={position} onClose={onClose} />;
}
