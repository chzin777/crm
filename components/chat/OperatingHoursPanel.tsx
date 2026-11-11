"use client";
import { useEffect, useMemo, useState } from "react";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useToast } from "@/components/ToastProvider";
import { fieldClass } from "@/components/chat/MenuFormParts";
import { DEFAULT_AUTO_REPLY, DEFAULT_SCHEDULE, GLOBAL_HOURS_SCOPE, WEEKDAY_LABELS, autoReplyText, type HoursRule, type HoursSlot } from "@/lib/chat/hours";

type Rule = HoursRule & { scope: string };

const LABEL = "mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300";
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const emptyRule = (scope: string): Rule => ({ scope, enabled: false, schedule: DEFAULT_SCHEDULE, autoReplyMessage: "" });

/** Horário geral e, opcionalmente, um horário próprio por fila (a fila tem prioridade quando ligada). */
export function OperatingHoursPanel({ queues }: { queues: { id: string; name: string }[] }) {
  const toast = useToast();
  const [rules, setRules] = useState<Map<string, Rule> | null>(null);
  const [scope, setScope] = useState(GLOBAL_HOURS_SCOPE);
  const [draft, setDraft] = useState<Rule>(emptyRule(GLOBAL_HOURS_SCOPE));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/chat/hours", { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as { items?: Rule[] };
        const map = new Map((data.items ?? []).map((item) => [item.scope, item]));
        setRules(map);
        setDraft(map.get(GLOBAL_HOURS_SCOPE) ?? emptyRule(GLOBAL_HOURS_SCOPE));
      })
      .catch(() => setRules(new Map()));
  }, []);

  const choose = (next: string) => {
    setScope(next);
    setError("");
    setDraft(rules?.get(next) ?? emptyRule(next));
  };

  const slotFor = (day: number) => draft.schedule.find((slot) => slot.day === day);
  const setSlot = (day: number, slot: HoursSlot | null) => {
    const others = draft.schedule.filter((item) => item.day !== day);
    setDraft({ ...draft, schedule: slot ? [...others, slot].sort((a, b) => a.day - b.day) : others });
  };

  const preview = useMemo(() => autoReplyText(draft), [draft]);

  const save = async () => {
    setSaving(true);
    setError("");
    const response = await fetch("/api/chat/hours", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as (Rule & { error?: string }) | null;
    setSaving(false);
    if (!response?.ok || !data) {
      setError(data?.error ?? "Não foi possível salvar.");
      return;
    }
    setRules((current) => new Map(current ?? []).set(data.scope, data));
    toast.success("Horário salvo");
  };

  if (!rules) return <div className="flex h-64 items-center justify-center"><LoadingSpinner label="Carregando horários..." /></div>;

  return (
    <div className="max-w-3xl space-y-5 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-[#07194f]">
      <div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">Horário de atendimento</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Fora do horário, o cliente recebe a mensagem automática (no máximo uma vez a cada 12h) e a conversa fica em Aguardando com prioridade alta e a etiqueta &quot;fora do horário&quot;.
        </p>
      </div>

      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="hours-scope" className={LABEL}>Aplicar a</label>
          <select id="hours-scope" value={scope} onChange={(event) => choose(event.target.value)} className={`${fieldClass} h-10 cursor-pointer`}>
            <option value={GLOBAL_HOURS_SCOPE}>Todas as filas (geral)</option>
            {queues.map((queue) => (
              <option key={queue.id} value={queue.id}>Fila {queue.name}{rules.get(queue.id)?.enabled ? " · horário próprio" : ""}</option>
            ))}
          </select>
        </div>
        <label className="flex cursor-pointer items-center gap-2 self-end pb-2 text-sm font-medium text-slate-700 dark:text-slate-200">
          <input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} className="h-4 w-4 cursor-pointer accent-[#002187]" />
          {scope === GLOBAL_HOURS_SCOPE ? "Ativar horário de atendimento" : "Usar horário próprio nesta fila"}
        </label>
      </div>

      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
        {DAY_ORDER.map((day) => {
          const slot = slotFor(day);
          return (
            <div key={day} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <label className="flex w-28 cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input type="checkbox" checked={!!slot} onChange={(event) => setSlot(day, event.target.checked ? { day, open: "08:00", close: "18:00" } : null)} className="h-4 w-4 cursor-pointer accent-[#002187]" />
                {WEEKDAY_LABELS[day]}
              </label>
              {slot ? (
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <input type="time" aria-label={`Abertura ${WEEKDAY_LABELS[day]}`} value={slot.open} onChange={(event) => setSlot(day, { ...slot, open: event.target.value })} className={`${fieldClass} h-9 w-28 cursor-pointer`} />
                  às
                  <input type="time" aria-label={`Fechamento ${WEEKDAY_LABELS[day]}`} value={slot.close} onChange={(event) => setSlot(day, { ...slot, close: event.target.value })} className={`${fieldClass} h-9 w-28 cursor-pointer`} />
                </div>
              ) : (
                <span className="text-xs text-slate-400">Fechado</span>
              )}
            </div>
          );
        })}
      </div>

      <div>
        <label htmlFor="hours-message" className={LABEL}>Mensagem fora do horário</label>
        <textarea id="hours-message" rows={3} maxLength={1000} value={draft.autoReplyMessage} onChange={(event) => setDraft({ ...draft, autoReplyMessage: event.target.value })} placeholder={DEFAULT_AUTO_REPLY} className={`${fieldClass} resize-none`} />
        <p className="mt-1 text-[11px] text-slate-400">Use {"{horario}"} para inserir os dias e horários. Em branco, vale o texto padrão.</p>
        <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-white/5 dark:text-slate-300"><span className="font-semibold">Prévia: </span>{preview}</p>
      </div>

      <div className="flex justify-end">
        <button type="button" onClick={() => void save()} disabled={saving} className="h-10 cursor-pointer rounded-lg bg-[#C4D600] px-4 text-sm font-semibold text-[#051647] hover:bg-[#b3c400] disabled:cursor-not-allowed disabled:opacity-50">
          {saving ? "Salvando..." : "Salvar horário"}
        </button>
      </div>
    </div>
  );
}
