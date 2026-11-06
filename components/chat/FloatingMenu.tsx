"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
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

export function FloatingMenu({ label, trigger, triggerClassName, widthClassName, items, align = "right", compact = false }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const visible = items.filter((item) => !item.hidden);

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

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("resize", close);
    };
  }, [isOpen]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      buttonRef.current?.focus();
      return;
    }
    if (event.key === "Tab") {
      close();
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

      {isOpen && createPortal(
        <div
          ref={panelRef}
          role="menu"
          aria-label={label}
          onKeyDown={handleKeyDown}
          className={`fixed z-[99999] max-h-72 max-w-[calc(100vw-16px)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl transition-opacity duration-150 dark:border-slate-800 dark:bg-[#07194f] ${widthClassName} ${position ? "opacity-100" : "opacity-0"}`}
          style={position ?? { top: 0, right: MARGIN }}
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
              <Link key={item.label} href={item.href} data-menu-item role={role} onClick={close} className={className}>{content}</Link>
            ) : (
              <button
                key={item.label}
                type="button"
                data-menu-item
                role={role}
                aria-checked={item.checked}
                onClick={() => {
                  close();
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
      )}
    </>
  );
}
