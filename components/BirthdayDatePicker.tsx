"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

interface BirthdayDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  /** Opens on the current month instead of 25 years ago when no date is selected. */
  startAtToday?: boolean;
}

const currentYear = new Date().getFullYear();
const months = Array.from({ length: 12 }, (_, month) =>
  new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date(2024, month, 1))
);
const weekdays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

const parseDateValue = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
};

const formatDateValue = (year: number, month: number, day: number) =>
  `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

/** Convert ISO date to DD/MM/AAAA for display in the text input. */
const isoToDisplay = (iso: string): string => {
  const parsed = parseDateValue(iso);
  if (!parsed) return "";
  return `${String(parsed.day).padStart(2, "0")}/${String(parsed.month + 1).padStart(2, "0")}/${parsed.year}`;
};

/** Validate and convert DD/MM/AAAA (or partial) to ISO. Returns null if invalid. */
const displayToIso = (display: string): string | null => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(display);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]) - 1;
  const year = Number(match[3]);
  if (month < 0 || month > 11 || day < 1 || day > 31 || year < 1900 || year > currentYear) return null;
  const date = new Date(year, month, day);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
  if (date > new Date(currentYear, new Date().getMonth(), new Date().getDate())) return null;
  return formatDateValue(year, month, day);
};

/** Format raw digits into DD/MM/AAAA as the user types. */
const formatInputMask = (raw: string): string => {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

/** Estimated dropdown height: header (~40px) + weekdays (~32px) + 6 rows of days (~192px) + footer (~44px) + padding (~24px) ≈ 332px */
const DROPDOWN_ESTIMATED_HEIGHT = 340;
const DROPDOWN_MIN_WIDTH = 280;
const VIEWPORT_MARGIN = 8;

export function BirthdayDatePicker({ value, onChange, label = "Data de nascimento", startAtToday = false }: BirthdayDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showYears, setShowYears] = useState(false);
  const selectedDate = parseDateValue(value);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const initialDate = selectedDate ?? {
      year: startAtToday ? currentYear : currentYear - 25,
      month: new Date().getMonth(),
      day: 1,
    };
    return new Date(initialDate.year, initialDate.month, 1);
  });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null);

  // Text input state
  const [inputValue, setInputValue] = useState(() => isoToDisplay(value));
  const [isEditing, setIsEditing] = useState(false);

  // Sync input display when value changes externally (e.g., calendar selection or clear)
  useEffect(() => {
    if (!isEditing) {
      setInputValue(isoToDisplay(value));
    }
  }, [value, isEditing]);

  const daysInMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
  const startOffset = (new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1).getDay() + 6) % 7;
  const maximumDate = new Date(currentYear, new Date().getMonth(), new Date().getDate());
  const dateLabel = selectedDate
    ? new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric" })
        .format(new Date(selectedDate.year, selectedDate.month, selectedDate.day))
    : "Selecione a data";
  const years = Array.from({ length: currentYear - 1899 }, (_, index) => currentYear - index);

  const changeMonth = (amount: number) => {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
  };

  useEffect(() => {
    if (!isOpen || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const width = Math.max(rect.width, DROPDOWN_MIN_WIDTH);

    let left = rect.left;
    if (left + width > viewportWidth - VIEWPORT_MARGIN) {
      left = viewportWidth - width - VIEWPORT_MARGIN;
    }
    if (left < VIEWPORT_MARGIN) {
      left = VIEWPORT_MARGIN;
    }

    const spaceBelow = viewportHeight - rect.bottom - VIEWPORT_MARGIN;
    const spaceAbove = rect.top - VIEWPORT_MARGIN;
    let top: number;

    if (spaceBelow >= DROPDOWN_ESTIMATED_HEIGHT) {
      top = rect.bottom + 8;
    } else if (spaceAbove >= DROPDOWN_ESTIMATED_HEIGHT) {
      top = rect.top - DROPDOWN_ESTIMATED_HEIGHT - 8;
    } else {
      if (spaceBelow >= spaceAbove) {
        top = rect.bottom + 8;
      } else {
        top = Math.max(VIEWPORT_MARGIN, rect.top - spaceAbove);
      }
    }

    setDropdownPosition({ top, left, width });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      // Check if click is inside the button OR inside the portal dropdown
      if (buttonRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setIsOpen(false);
      setShowYears(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleInputChange = (raw: string) => {
    const masked = formatInputMask(raw);
    setInputValue(masked);
    setIsEditing(true);

    // Only commit when we have a complete DD/MM/AAAA
    if (masked.length === 10) {
      const iso = displayToIso(masked);
      if (iso) {
        onChange(iso);
        setIsEditing(false);
        // Sync calendar to the typed date
        const parsed = parseDateValue(iso);
        if (parsed) {
          setVisibleMonth(new Date(parsed.year, parsed.month, 1));
        }
      }
    }
  };

  const handleInputBlur = () => {
    setIsEditing(false);
    // If incomplete or invalid, revert to the last valid value
    if (inputValue.length !== 10 || !displayToIso(inputValue)) {
      setInputValue(isoToDisplay(value));
    }
  };

  return (
    <div className="relative space-y-1.5">
      <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="text"
          inputMode="numeric"
          maxLength={10}
          placeholder="DD/MM/AAAA"
          value={inputValue}
          onChange={(event) => handleInputChange(event.target.value)}
          onBlur={handleInputBlur}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              (event.target as HTMLInputElement).blur();
            }
          }}
          className="h-10 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-xs outline-none transition-colors placeholder:text-slate-400 focus:border-[#002187] dark:border-slate-700 dark:bg-[#07194f] dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus:border-[#C4D600]"
        />
        <button
          ref={buttonRef}
          type="button"
          aria-label={`Abrir calendário para ${label.toLocaleLowerCase("pt-BR")}`}
          aria-expanded={isOpen}
          onClick={() => {
            if (!isOpen && selectedDate) setVisibleMonth(new Date(selectedDate.year, selectedDate.month, 1));
            setIsOpen((open) => !open);
            setShowYears(false);
          }}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-xs transition-colors hover:border-[#002187] hover:bg-slate-50 dark:border-slate-700 dark:bg-[#07194f] dark:text-slate-300 dark:hover:border-[#C4D600] dark:hover:bg-[#051647] cursor-pointer hover:cursor-pointer"
        >
          <CalendarDays className="h-4 w-4" />
        </button>
      </div>
      {isOpen && dropdownPosition && typeof document !== "undefined" && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[9999] max-h-[calc(100vh-16px)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-[#07194f]"
          style={{ top: dropdownPosition.top, left: dropdownPosition.left, width: dropdownPosition.width }}
        >
          {showYears ? (
            <div className="grid max-h-56 grid-cols-4 gap-1 overflow-y-auto">
              {years.map((year) => (
                <button
                  key={year}
                  type="button"
                  aria-pressed={visibleMonth.getFullYear() === year}
                  onClick={() => {
                    setVisibleMonth((current) => new Date(year, current.getMonth(), 1));
                    setShowYears(false);
                  }}
                  className={`h-9 rounded-lg text-xs font-semibold transition-colors hover:bg-[#C4D600]/20 hover:text-[#051647] dark:hover:bg-[#C4D600]/15 dark:hover:text-[#C4D600] cursor-pointer hover:cursor-pointer ${visibleMonth.getFullYear() === year ? "bg-[#051647] text-white dark:bg-[#C4D600] dark:text-[#051647]" : "text-slate-700 dark:text-slate-200"}`}
                >
                  {year}
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  aria-label="Mês anterior"
                  onClick={() => changeMonth(-1)}
                  disabled={visibleMonth.getFullYear() <= 1900 && visibleMonth.getMonth() === 0}
                  className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer hover:cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-semibold capitalize text-slate-800 dark:text-slate-100">{months[visibleMonth.getMonth()]}</span>
                  <button
                    type="button"
                    aria-label={`Escolher ano ${visibleMonth.getFullYear()}`}
                    onClick={() => setShowYears(true)}
                    className="inline-flex h-8 items-center gap-0.5 rounded-lg px-1.5 text-xs font-semibold text-[#002187] transition-colors hover:bg-[#C4D600]/20 dark:text-[#C4D600] dark:hover:bg-[#C4D600]/15 cursor-pointer hover:cursor-pointer"
                  >
                    {visibleMonth.getFullYear()}<ChevronDown className="h-3 w-3" />
                  </button>
                </div>
                <button
                  type="button"
                  aria-label="Próximo mês"
                  onClick={() => changeMonth(1)}
                  disabled={visibleMonth.getFullYear() >= currentYear && visibleMonth.getMonth() >= new Date().getMonth()}
                  className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer hover:cursor-pointer"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div role="group" aria-label={`${months[visibleMonth.getMonth()]} ${visibleMonth.getFullYear()}`} className="grid grid-cols-7 gap-1 text-center">
                {weekdays.map((weekday) => (
                  <span key={weekday} className="grid h-8 place-items-center text-[10px] font-semibold text-slate-400">{weekday}</span>
                ))}
                {Array.from({ length: startOffset }, (_, index) => (
                  <span key={`empty-${index}`} aria-hidden="true" />
                ))}
                {Array.from({ length: daysInMonth }, (_, index) => {
                  const day = index + 1;
                  const date = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day);
                  const isSelected = selectedDate?.year === visibleMonth.getFullYear()
                    && selectedDate.month === visibleMonth.getMonth()
                    && selectedDate.day === day;
                  const isFuture = date > maximumDate;
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-label={new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" }).format(date)}
                      aria-pressed={isSelected}
                      disabled={isFuture}
                      onClick={() => {
                        onChange(formatDateValue(visibleMonth.getFullYear(), visibleMonth.getMonth(), day));
                        setIsOpen(false);
                      }}
                      className={`grid h-8 place-items-center rounded-lg text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer hover:cursor-pointer ${isSelected ? "bg-[#051647] font-bold text-white dark:bg-[#C4D600] dark:text-[#051647]" : "text-slate-700 hover:bg-[#C4D600]/20 hover:text-[#051647] dark:text-slate-200 dark:hover:bg-[#C4D600]/15 dark:hover:text-[#C4D600]"}`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </>
          )}
          <div className="mt-3 flex justify-end border-t border-slate-100 pt-2 dark:border-slate-800">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setIsOpen(false);
                setShowYears(false);
              }}
              className="h-8 rounded-lg px-2 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer hover:cursor-pointer"
            >
              Limpar data
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}