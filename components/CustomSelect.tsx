"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";

interface CustomSelectOption {
  value: string;
  label: string;
}

interface CustomSelectProps {
  value: string;
  options: CustomSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function CustomSelect({
  value,
  options,
  onChange,
  placeholder = "Selecione...",
  disabled = false,
  className = "",
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLUListElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const selectedOption = options.find((opt) => opt.value === value);

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
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className={`flex h-10 w-full items-center justify-between rounded-lg border bg-white px-3 text-sm font-normal outline-none transition-colors ${
          isOpen
            ? "border-[#002187] ring-2 ring-[#002187]/10 dark:border-[#C4D600] dark:ring-[#C4D600]/10"
            : "border-slate-200 dark:border-slate-700"
        } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:cursor-pointer"} dark:bg-slate-800`}
      >
        <span className={selectedOption ? "text-slate-900 dark:text-white" : "text-slate-400 dark:text-slate-500"}>
          {selectedOption?.label ?? placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && dropdownPosition && typeof document !== "undefined" && createPortal(
        <ul
          ref={dropdownRef}
          role="listbox"
          className="fixed z-[99999] max-h-60 overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-800"
          style={{ top: dropdownPosition.top, left: dropdownPosition.left, width: dropdownPosition.width }}
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <li key={option.value} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:cursor-pointer ${
                    isSelected
                      ? "bg-[#051647] text-white dark:bg-[#C4D600] dark:text-[#051647]"
                      : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  <span className="font-medium">{option.label}</span>
                  {isSelected && <Check className="h-4 w-4 shrink-0" />}
                </button>
              </li>
            );
          })}
          {options.length === 0 && (
            <li className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500">Nenhuma opção disponível.</li>
          )}
        </ul>,
        document.body
      )}
    </div>
  );
}