"use client";
import { useRef } from "react";
import { Minus, Plus, type LucideIcon } from "lucide-react";

export const fieldClass = "w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]";
export const labelClass = "mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-200";
export const hintClass = "mt-1 text-[11px] text-slate-500 dark:text-slate-400";

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${checked ? "bg-[#002187] dark:bg-[#C4D600]" : "bg-slate-300 dark:bg-slate-600"}`}>
      <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : ""}`} />
    </button>
  );
}

export function SwitchRow({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3 dark:border-slate-800 dark:bg-white/5">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">{title}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
      </div>
      <Switch checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

export function SettingCard({ icon: Icon, title, description, action, children }: { icon: LucideIcon; title: string; description: string; action?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-700/80 dark:bg-[#07194f]">
      <header className="flex items-center gap-3 p-4 sm:px-5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#002187]/8 text-[#002187] dark:bg-[#C4D600]/15 dark:text-[#C4D600]"><Icon className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
        </div>
        {action}
      </header>
      {children && <div className="space-y-4 border-t border-slate-100 p-4 sm:p-5 dark:border-slate-800">{children}</div>}
    </section>
  );
}

type MessageFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  hint?: string;
  variables?: { mark: string; label: string }[];
};

/** Campo de mensagem com variáveis clicáveis, inseridas na posição do cursor. */
export function MessageField({ id, label, value, onChange, rows = 3, hint, variables = [] }: MessageFieldProps) {
  const box = useRef<HTMLTextAreaElement>(null);

  const insert = (mark: string) => {
    const area = box.current;
    const start = area?.selectionStart ?? value.length;
    const end = area?.selectionEnd ?? value.length;
    onChange(`${value.slice(0, start)}${mark}${value.slice(end)}`);
    requestAnimationFrame(() => {
      area?.focus();
      area?.setSelectionRange(start + mark.length, start + mark.length);
    });
  };

  return (
    <div>
      <label htmlFor={id} className={labelClass}>{label}</label>
      <textarea ref={box} id={id} rows={rows} value={value} onChange={(event) => onChange(event.target.value)} className={`${fieldClass} resize-y leading-relaxed`} />
      {variables.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-slate-500 dark:text-slate-400">Inserir:</span>
          {variables.map((variable) => (
            <button key={variable.mark} type="button" onClick={() => insert(variable.mark)} className="cursor-pointer rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-[#002187] hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-[#C4D600] dark:hover:bg-slate-700">{variable.label}</button>
          ))}
        </div>
      )}
      {hint && <p className={hintClass}>{hint}</p>}
    </div>
  );
}

type DurationProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  unit: string;
  min: number;
  max: number;
  step: number;
  presets: { value: number; label: string }[];
};

/** Tempo com botões de menos e mais, atalhos prontos e digitação livre. */
export function DurationField({ label, value, onChange, unit, min, max, step, presets }: DurationProps) {
  const clamp = (next: number) => Math.min(Math.max(Number.isFinite(next) ? Math.round(next) : min, min), max);
  const stepButton = "grid h-10 w-10 cursor-pointer place-items-center text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30 dark:text-slate-300 dark:hover:bg-slate-700";

  return (
    <div>
      <p className={labelClass}>{label}</p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex h-10 items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
          <button type="button" aria-label={`Diminuir ${label}`} disabled={value <= min} onClick={() => onChange(clamp(value - step))} className={stepButton}><Minus className="h-4 w-4" /></button>
          <label className="flex h-full items-center gap-1 border-x border-slate-200 px-2 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-300">
            <input
              type="number"
              inputMode="numeric"
              aria-label={label}
              min={min}
              max={max}
              value={value}
              onChange={(event) => onChange(clamp(Number(event.target.value)))}
              style={{ backgroundColor: "transparent" }}
              className="w-10 text-right text-sm font-bold text-slate-900 outline-none [appearance:textfield] dark:text-white [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            {unit}
          </label>
          <button type="button" aria-label={`Aumentar ${label}`} disabled={value >= max} onClick={() => onChange(clamp(value + step))} className={stepButton}><Plus className="h-4 w-4" /></button>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Atalhos de ${label}`}>
          {presets.map((preset) => {
            const active = preset.value === value;
            return (
              <button key={preset.value} type="button" aria-pressed={active} onClick={() => onChange(preset.value)} className={`h-8 cursor-pointer rounded-full px-3 text-xs font-medium transition-colors ${active ? "bg-[#051647] text-white dark:bg-[#C4D600] dark:text-[#051647]" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"}`}>
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ChoiceCards<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (value: T) => void; options: { id: T; title: string; description: string }[] }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2 sm:grid-cols-2">
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <button key={option.id} type="button" role="radio" aria-checked={selected} onClick={() => onChange(option.id)} className={`cursor-pointer rounded-lg border p-3 text-left transition-colors ${selected ? "border-[#002187] bg-[#002187]/5 dark:border-[#C4D600] dark:bg-[#C4D600]/10" : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-white/5"}`}>
            <span className="block text-sm font-semibold text-slate-900 dark:text-white">{option.title}</span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">{option.description}</span>
          </button>
        );
      })}
    </div>
  );
}
