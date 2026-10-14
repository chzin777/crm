"use client";

import { useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

interface BirthdayDatePickerProps {
  value: string;
  onChange: (value: string) => void;
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

export function BirthdayDatePicker({ value, onChange }: BirthdayDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showYears, setShowYears] = useState(false);
  const selectedDate = parseDateValue(value);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const initialDate = selectedDate ?? {
      year: currentYear - 25,
      month: new Date().getMonth(),
      day: 1,
    };
    return new Date(initialDate.year, initialDate.month, 1);
  });

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

  return (
    <div className={`relative space-y-1.5 ${isOpen ? "z-[130]" : ""}`}>
      <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Data de nascimento</span>
      <button
        type="button"
        aria-label="Escolher data de nascimento"
        aria-expanded={isOpen}
        onClick={() => {
          if (!isOpen && selectedDate) setVisibleMonth(new Date(selectedDate.year, selectedDate.month, 1));
          setIsOpen((open) => !open);
          setShowYears(false);
        }}
        className="flex h-10 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-left text-xs font-medium text-slate-700 shadow-xs transition-colors hover:border-[#002187] hover:bg-slate-50 dark:border-slate-700 dark:bg-[#07194f] dark:text-slate-200 dark:hover:border-[#C4D600] dark:hover:bg-[#051647] cursor-pointer hover:cursor-pointer"
      >
        <span className={`flex items-center gap-2 ${selectedDate ? "" : "text-slate-400"}`}>
          <CalendarDays className="h-4 w-4" />{dateLabel}
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen && (
        <div className="absolute left-0 top-full z-[130] mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-[#07194f]">
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
        </div>
      )}
    </div>
  );
}
