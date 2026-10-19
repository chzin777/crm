"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, X } from "lucide-react";

interface FormMultiSelectProps {
  label: string;
  selected: readonly string[];
  options: readonly string[];
  onChange: (selected: string[]) => void;
  ariaLabel?: string;
  required?: boolean;
  placeholder?: string;
}

export function FormMultiSelect({
  label,
  selected,
  options,
  onChange,
  ariaLabel,
  required = false,
  placeholder = "Selecione as opções",
}: FormMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    if (!isOpen || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const dropdownHeight = Math.min(options.length * 40 + 12, 260);
    const margin = 8;

    let left = rect.left;
    const width = rect.width;
    if (left + width > viewportWidth - margin) {
      left = viewportWidth - width - margin;
    }
    if (left < margin) {
      left = margin;
    }

    const spaceBelow = viewportHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    let top: number;

    if (spaceBelow >= dropdownHeight) {
      top = rect.bottom + 8;
    } else if (spaceAbove >= dropdownHeight) {
      top = rect.top - dropdownHeight - 8;
    } else {
      top = spaceBelow >= spaceAbove ? rect.bottom + 8 : Math.max(margin, rect.top - spaceAbove);
    }

    setDropdownPosition({ top, left, width });
  }, [isOpen, options.length]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setIsOpen(false);
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

  const toggleOption = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter((item) => item !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  const removeTag = (option: string, event: React.MouseEvent) => {
    event.stopPropagation();
    onChange(selected.filter((item) => item !== option));
  };

  const displayValue = selected.length === 0
    ? placeholder
    : selected.length <= 2
      ? selected.join(", ")
      : `${selected.length} selecionados`;

  return (
    <div ref={rootRef} className="relative space-y-1.5">
      <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
        {label}{required && <> <span aria-hidden="true" className="text-red-600 dark:text-red-400">*</span></>}
      </span>
      <button
        ref={buttonRef}
        type="button"
        aria-label={ariaLabel ?? label}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className="flex h-auto min-h-10 w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs font-medium text-slate-700 shadow-xs transition-colors hover:border-[#002187] hover:bg-slate-50 dark:border-slate-700 dark:bg-[#07194f] dark:text-slate-200 dark:hover:border-[#C4D600] dark:hover:bg-[#051647] cursor-pointer hover:cursor-pointer"
      >
        <div className="flex flex-1 flex-wrap gap-1.5">
          {selected.length === 0 ? (
            <span className="text-slate-400">{placeholder}</span>
          ) : (
            selected.map((item) => (
              <span
                key={item}
                className="inline-flex items-center gap-1 rounded-lg bg-[#051647]/10 px-2 py-0.5 text-[11px] font-semibold text-[#051647] dark:bg-[#C4D600]/15 dark:text-[#C4D600]"
              >
                {item}
                <button
                  type="button"
                  onClick={(event) => removeTag(item, event)}
                  className="grid h-4 w-4 place-items-center rounded-md transition-colors hover:bg-[#051647]/20 dark:hover:bg-[#C4D600]/20 cursor-pointer hover:cursor-pointer"
                  aria-label={`Remover ${item}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))
          )}
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen && dropdownPosition && typeof document !== "undefined" && createPortal(
        <div
          ref={dropdownRef}
          role="listbox"
          aria-label={ariaLabel ?? label}
          aria-multiselectable="true"
          className="fixed z-[9999] max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-[#07194f]"
          style={{ top: dropdownPosition.top, left: dropdownPosition.left, width: dropdownPosition.width }}
        >
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500">Nenhuma opção disponível</div>
          ) : (
            options.map((option) => {
              const isSelected = selected.includes(option);
              return (
                <button
                  key={option}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => toggleOption(option)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs text-slate-700 transition-colors hover:bg-[#C4D600]/20 hover:text-[#051647] dark:text-slate-200 dark:hover:bg-[#C4D600]/15 dark:hover:text-[#C4D600] cursor-pointer hover:cursor-pointer"
                >
                  <span
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition-all ${
                      isSelected
                        ? "border-[#051647] bg-[#051647] dark:border-[#C4D600] dark:bg-[#C4D600]"
                        : "border-slate-300 bg-transparent dark:border-slate-500"
                    }`}
                  >
                    {isSelected && <Check className="h-3.5 w-3.5 text-white dark:text-[#051647]" />}
                  </span>
                  <span className="flex-1">{option}</span>
                </button>
              );
            })
          )}
        </div>,
        document.body
      )}
    </div>
  );
}