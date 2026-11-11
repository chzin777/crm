"use client";
import { useState } from "react";
import { EntityDialog } from "@/components/EntityDialog";
import { fieldClass } from "@/components/chat/MenuFormParts";

const LABEL = "mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300";
const PRESET = "cursor-pointer rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/5";
const PRIMARY = "h-10 cursor-pointer rounded-lg bg-[#051647] px-4 text-sm font-semibold text-white hover:bg-[#002187] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#C4D600] dark:text-[#051647]";
const CANCEL = "h-10 cursor-pointer rounded-lg px-4 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800";

const pad = (value: number) => String(value).padStart(2, "0");
const dateValue = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const timeValue = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

/** Dia útil seguinte (pula sábado e domingo) às `hour`. */
function nextBusinessDay(daysAhead: number, hour: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  while (date.getDay() === 0 || date.getDay() === 6) date.setDate(date.getDate() + 1);
  date.setHours(hour, 0, 0, 0);
  return date;
}

type Preset = { label: string; at: () => Date };

function WhenFields({ date, time, onChange, presets }: { date: string; time: string; onChange: (date: string, time: string) => void; presets: Preset[] }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {presets.map((preset) => (
          <button key={preset.label} type="button" className={PRESET} onClick={() => { const at = preset.at(); onChange(dateValue(at), timeValue(at)); }}>
            {preset.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="when-date" className={LABEL}>Data</label>
          <input id="when-date" type="date" value={date} min={dateValue(new Date())} onChange={(event) => onChange(event.target.value, time)} className={`${fieldClass} h-10 cursor-pointer`} />
        </div>
        <div>
          <label htmlFor="when-time" className={LABEL}>Hora</label>
          <input id="when-time" type="time" value={time} onChange={(event) => onChange(date, event.target.value)} className={`${fieldClass} h-10 cursor-pointer`} />
        </div>
      </div>
    </div>
  );
}

const toIso = (date: string, time: string) => {
  const value = new Date(`${date}T${time}`);
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
};

async function post(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  if (response?.ok) return null;
  const data = (await response?.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? "Não foi possível salvar.";
}

function ErrorLine({ text }: { text: string }) {
  return text ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">{text}</p> : null;
}

const FOLLOW_UP_PRESETS: Preset[] = [
  { label: "Amanhã 9h", at: () => nextBusinessDay(1, 9) },
  { label: "Em 3 dias", at: () => nextBusinessDay(3, 9) },
  { label: "Em 1 semana", at: () => nextBusinessDay(7, 9) },
  { label: "Em 1 mês", at: () => nextBusinessDay(30, 9) },
];

const NOTE_IDEAS = ["Retorno do orçamento de lentes", "Avisar que os óculos estão prontos", "Renovação da receita"];

export function FollowUpDialog({ conversationId, customerName, onClose, onSaved }: { conversationId: string; customerName: string; onClose: () => void; onSaved: () => void }) {
  const initial = nextBusinessDay(1, 9);
  const [date, setDate] = useState(dateValue(initial));
  const [time, setTime] = useState(timeValue(initial));
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const dueAt = toIso(date, time);
    if (!dueAt) return setError("Escolha data e hora.");
    setSaving(true);
    setError("");
    const failure = await post(`/api/chat/conversations/${conversationId}/follow-ups`, { dueAt, note });
    setSaving(false);
    if (failure) setError(failure);
    else onSaved();
  };

  return (
    <EntityDialog titleId="followup-title" title="Agendar retorno" description={`Você recebe um aviso na hora marcada para falar de novo com ${customerName}.`} onClose={onClose} size="sm">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-1">
        <ErrorLine text={error} />
        <WhenFields date={date} time={time} onChange={(nextDate, nextTime) => { setDate(nextDate); setTime(nextTime); }} presets={FOLLOW_UP_PRESETS} />
        <div>
          <label htmlFor="followup-note" className={LABEL}>Motivo do retorno</label>
          <textarea id="followup-note" rows={3} maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ex.: retorno do orçamento multifocal" className={`${fieldClass} resize-none`} />
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {NOTE_IDEAS.map((idea) => <button key={idea} type="button" className={PRESET} onClick={() => setNote(idea)}>{idea}</button>)}
          </div>
        </div>
        <div className="mt-auto flex justify-end gap-2">
          <button type="button" onClick={onClose} className={CANCEL}>Cancelar</button>
          <button type="button" onClick={() => void save()} disabled={saving} className={PRIMARY}>{saving ? "Salvando..." : "Agendar retorno"}</button>
        </div>
      </div>
    </EntityDialog>
  );
}

const MESSAGE_PRESETS: Preset[] = [
  { label: "Em 1 hora", at: () => new Date(Date.now() + 60 * 60 * 1000) },
  { label: "Amanhã 9h", at: () => nextBusinessDay(1, 9) },
  { label: "Amanhã 14h", at: () => nextBusinessDay(1, 14) },
];

/** O texto vem do campo de digitação; a mensagem sai pelo relógio do servidor no horário marcado. */
export function ScheduleMessageDialog({ conversationId, text, onClose, onSaved }: { conversationId: string; text: string; onClose: () => void; onSaved: () => void }) {
  const initial = nextBusinessDay(1, 9);
  const [date, setDate] = useState(dateValue(initial));
  const [time, setTime] = useState(timeValue(initial));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const scheduledFor = toIso(date, time);
    if (!scheduledFor) return setError("Escolha data e hora.");
    setSaving(true);
    setError("");
    const failure = await post(`/api/chat/conversations/${conversationId}/scheduled`, { text, scheduledFor });
    setSaving(false);
    if (failure) setError(failure);
    else onSaved();
  };

  return (
    <EntityDialog titleId="schedule-title" title="Agendar envio" description="A mensagem sai sozinha no horário escolhido, dentro da janela de 24h do cliente." onClose={onClose} size="sm">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-1">
        <ErrorLine text={error} />
        <p className="max-h-28 overflow-y-auto whitespace-pre-wrap rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800/60 dark:text-slate-200">{text}</p>
        <WhenFields date={date} time={time} onChange={(nextDate, nextTime) => { setDate(nextDate); setTime(nextTime); }} presets={MESSAGE_PRESETS} />
        <div className="mt-auto flex justify-end gap-2">
          <button type="button" onClick={onClose} className={CANCEL}>Cancelar</button>
          <button type="button" onClick={() => void save()} disabled={saving} className={PRIMARY}>{saving ? "Agendando..." : "Agendar envio"}</button>
        </div>
      </div>
    </EntityDialog>
  );
}
