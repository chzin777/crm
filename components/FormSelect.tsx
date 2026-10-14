"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

interface FormSelectProps {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  required?: boolean;
}

export function FormSelect({ label, value, options, onChange, ariaLabel, required = false }: FormSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className="relative space-y-1.5">
      <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
        {label}{required && <> <span aria-hidden="true" className="text-red-600 dark:text-red-400">*</span></>}
      </span>
      <button
        type="button"
        aria-label={ariaLabel ?? label}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className="flex h-10 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-left text-xs font-medium text-slate-700 shadow-xs transition-colors hover:border-[#002187] hover:bg-slate-50 dark:border-slate-700 dark:bg-[#07194f] dark:text-slate-200 dark:hover:border-[#C4D600] dark:hover:bg-[#051647] cursor-pointer hover:cursor-pointer"
      >
        <span>{value}</span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen && (
        <div role="listbox" aria-label={ariaLabel ?? label} className="absolute left-0 right-0 top-full z-[120] mt-2 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-[#07194f]">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={value === option}
              onClick={() => {
                onChange(option);
                setIsOpen(false);
              }}
              className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-xs text-slate-700 transition-colors hover:bg-[#C4D600]/20 hover:text-[#051647] dark:text-slate-200 dark:hover:bg-[#C4D600]/15 dark:hover:text-[#C4D600] cursor-pointer hover:cursor-pointer"
            >
              {option}
              {value === option && <Check className="h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
