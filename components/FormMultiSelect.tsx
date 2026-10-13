"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

interface FormMultiSelectProps {
  label: string;
  values: string[];
  options: readonly string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}

export function FormMultiSelect({
  label,
  values,
  options,
  onChange,
  placeholder = "Selecione uma ou mais opções",
}: FormMultiSelectProps) {
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
      <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300">{label}</span>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className="flex min-h-10 w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs font-medium text-slate-700 shadow-xs transition-colors hover:border-[#002187] hover:bg-slate-50 dark:border-slate-700 dark:bg-[#07194f] dark:text-slate-200 dark:hover:border-[#C4D600] dark:hover:bg-[#051647] cursor-pointer hover:cursor-pointer"
      >
        <span className={values.length ? "min-w-0 truncate" : "text-slate-400"}>
          {values.length ? values.join(", ") : placeholder}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen && (
        <div role="group" aria-label={label} className="absolute left-0 right-0 top-full z-[120] mt-2 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-[#07194f]">
          {options.map((option) => {
            const isSelected = values.includes(option);
            return (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-slate-700 transition-colors hover:bg-[#C4D600]/20 hover:text-[#051647] dark:text-slate-200 dark:hover:bg-[#C4D600]/15 dark:hover:text-[#C4D600]"
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(event) => onChange(event.target.checked
                    ? [...values, option]
                    : values.filter((value) => value !== option))}
                  className="h-4 w-4 shrink-0 accent-[#002187] dark:accent-[#C4D600]"
                />
                <span className="min-w-0 flex-1">{option}</span>
                {isSelected && <Check className="h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]" />}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
