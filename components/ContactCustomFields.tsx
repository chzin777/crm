"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Settings2 } from "lucide-react";
import { TierBadge } from "@/components/TierBadge";
import { RfvpBadge, RfvpSegmentChip, SCORE_TONE } from "@/components/RfvpBadge";
import { PILLARS } from "@/lib/rfvp";
import { ContactFieldsManager } from "@/components/ContactFieldsManager";
import { useToast } from "@/components/ToastProvider";
import { displayFieldValue, type ContactFieldDefinition } from "@/lib/contact-fields";

type Log = { id: string; delta: number; scoreAfter: number; tierAfter: string; reason: string; createdAt: string };
type Data = { score: number; tier: string; fields: Record<string, string>; definitions: ContactFieldDefinition[]; logs: Log[]; rfvp?: ContactRfvpView | null };

const INPUT = "h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-[#002187] disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]";
const when = (value: string) => new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

/**
 * Lead Score (nível, pontos e últimas movimentações) e campos personalizados do contato, editáveis aqui.
 * Usado na ficha de /contatos e no "Dados do cliente" do /chat.
 */
export function ContactCustomFields({ contactId, canWrite = true, canManage = false }: { contactId: string; canWrite?: boolean; canManage?: boolean }) {
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [managing, setManaging] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/contacts/${contactId}/custom`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const body = (await response.json()) as Data;
      setData(body);
      setForm(body.fields);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [contactId]);
  useEffect(() => { void load(); }, [load]);

  const dirty = !!data && data.definitions.some((def) => (form[def.key] ?? "") !== (data.fields[def.key] ?? ""));

  const save = async () => {
    if (!data) return;
    setSaving(true);
    try {
      const changed = Object.fromEntries(data.definitions.filter((def) => (form[def.key] ?? "") !== (data.fields[def.key] ?? "")).map((def) => [def.key, form[def.key] ?? ""]));
      const response = await fetch(`/api/contacts/${contactId}/custom`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields: changed }) });
      const body = (await response.json().catch(() => ({}))) as { fields?: Record<string, string>; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Não foi possível salvar.");
      setData({ ...data, fields: body.fields ?? {} });
      setForm(body.fields ?? {});
      toast.success("Campos salvos");
    } catch (error) {
      toast.error("Não foi possível salvar", error instanceof Error ? error.message : "Tente de novo.");
    } finally {
      setSaving(false);
    }
  };

  if (failed) return <p className="text-xs text-slate-500">Não foi possível carregar a pontuação e os campos.</p>;
  if (!data) return <p className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" />Carregando...</p>;

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <TierBadge tier={data.tier} score={data.score} size="md" />
          <Link href="/clientes-vip" className="text-xs font-semibold text-[#002187] hover:underline dark:text-[#C4D600]">Ranking de clientes</Link>
        </div>
      </div>
      {data.rfvp && <RfvpDetail rfvp={data.rfvp} />}
      {data.logs.length > 0 && (
        <ul className="space-y-1">
          {data.logs.slice(0, 5).map((log) => (
            <li key={log.id} className="flex min-w-0 items-center gap-2 text-xs">
              <span className={`w-12 shrink-0 text-right font-bold ${log.delta >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-red-600 dark:text-red-300"}`}>{log.delta > 0 ? "+" : ""}{log.delta}</span>
              <span className="min-w-0 flex-1 break-words text-slate-600 dark:text-slate-300">{log.reason || "Ajuste de pontos"}</span>
              <span className="shrink-0 text-[10px] text-slate-400">{when(log.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Campos personalizados</p>
          {canManage && <button type="button" onClick={() => setManaging(true)} className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-[#002187] hover:underline dark:text-[#C4D600]"><Settings2 className="h-3.5 w-3.5" />Gerenciar campos</button>}
        </div>
        {data.definitions.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">Nenhum campo criado ainda.{canManage ? " Use Gerenciar campos para criar (ex.: loja preferida, data da última consulta)." : ""}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {data.definitions.map((def) => {
              const value = form[def.key] ?? "";
              const set = (next: string) => setForm((current) => ({ ...current, [def.key]: next }));
              return (
                <label key={def.id} className="block min-w-0 space-y-1">
                  <span className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">{def.label}</span>
                  {def.type === "select" ? (
                    <select value={value} disabled={!canWrite} onChange={(event) => set(event.target.value)} className={`${INPUT} cursor-pointer`}>
                      <option value="">—</option>
                      {def.options.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  ) : (
                    <input value={value} type={def.type === "date" ? "date" : def.type === "number" ? "number" : "text"} step="any" disabled={!canWrite} onChange={(event) => set(event.target.value)} className={INPUT} title={def.type === "date" && value ? displayFieldValue(def, value) : undefined} />
                  )}
                </label>
              );
            })}
          </div>
        )}
        {canWrite && data.definitions.length > 0 && (
          <div className="flex justify-end">
            <button type="button" onClick={() => void save()} disabled={!dirty || saving} className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-[#C4D600] px-4 text-sm font-semibold text-[#051647] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">{saving ? "Salvando..." : "Salvar campos"}</button>
          </div>
        )}
      </div>
      {managing && <ContactFieldsManager onClose={() => { setManaging(false); void load(); }} />}
    </div>
  );
}

type ContactRfvpView = {
  code: string | null; segment: string | null; updatedAt: string | null;
  scores: { r: number; f: number; v: number; p: number } | null;
  metrics: { daysSinceLastPurchase: number | null; purchases: number; value: number; valueMetric: "total" | "avg"; months: { f: number; v: number; p: number }; punctuality: { due: number; onTime: number; avgDelay: number; maxOverdueDays: number } | null };
};

/** Matriz RFV-P do contato: código, segmento e as 4 notas com o número por trás de cada uma. */
function RfvpDetail({ rfvp }: { rfvp: ContactRfvpView }) {
  const m = rfvp.metrics;
  const money = m.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const p = m.punctuality;
  const detail: Record<"r" | "f" | "v" | "p", string> = {
    r: m.daysSinceLastPurchase === null ? "Nunca comprou" : `Última compra há ${m.daysSinceLastPurchase} dia(s)`,
    f: `${m.purchases} compra(s) em ${m.months.f} meses`,
    v: `${money} ${m.valueMetric === "avg" ? "de ticket médio" : "gastos"} em ${m.months.v} meses`,
    p: !p || p.due === 0 ? "Sem crediário na janela (à vista/PIX/cartão)" : `${Math.round((p.onTime / p.due) * 100)}% em dia de ${p.due} parcela(s) · atraso médio ${p.avgDelay} dia(s)${p.maxOverdueDays > 0 ? ` · em aberto há ${p.maxOverdueDays} dia(s)` : ""}`,
  };
  return (
    <div className="min-w-0 space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">RFV-P</span>
        <RfvpBadge code={rfvp.code} segment={rfvp.segment} size="md" />
        <RfvpSegmentChip segment={rfvp.segment} />
      </div>
      {rfvp.scores ? (
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {PILLARS.map((pillar) => (
            <li key={pillar.key} className="flex min-w-0 items-start gap-2">
              <span className={`grid h-5 w-5 shrink-0 place-items-center rounded text-[10px] font-bold ${SCORE_TONE[rfvp.scores![pillar.key]]}`}>{rfvp.scores![pillar.key]}</span>
              <span className="min-w-0 break-words text-[11px] text-slate-600 dark:text-slate-300"><b className="text-[#051647] dark:text-white">{pillar.label}:</b> {detail[pillar.key]}</span>
            </li>
          ))}
        </ul>
      ) : <p className="text-[11px] text-slate-500 dark:text-slate-400">Ainda não calculado. O recálculo roda todo dia às 6h ou em Clientes VIP & Pontuação.</p>}
    </div>
  );
}
