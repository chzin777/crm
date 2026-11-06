"use client";
import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import { formatPhone } from "@/lib/chat/phone";

type Blocked = { phone: string; reason: string };

export function BlockedPanel() {
  const toast = useToast();
  const [items, setItems] = useState<Blocked[]>([]);
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/chat/blocked", { cache: "no-store" });
    if (response.ok) setItems(((await response.json()) as { data: Blocked[] }).data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    const response = await fetch("/api/chat/blocked", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, reason }) });
    if (!response.ok) {
      toast.error(((await response.json().catch(() => null)) as { error?: string } | null)?.error ?? "Não foi possível bloquear.");
      return;
    }
    setPhone("");
    setReason("");
    await load();
  };

  const remove = async (value: string) => {
    await fetch(`/api/chat/blocked?phone=${encodeURIComponent(value)}`, { method: "DELETE" });
    await load();
  };

  const field = "h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]";

  return (
    <div className="max-w-2xl">
      <div className="mb-4 flex flex-wrap gap-2">
        <input aria-label="Telefone com DDI" placeholder="5562999999999" value={phone} onChange={(event) => setPhone(event.target.value)} className={`${field} w-48`} />
        <input aria-label="Motivo" placeholder="Motivo" value={reason} onChange={(event) => setReason(event.target.value)} className={`${field} min-w-40 flex-1`} />
        <button type="button" onClick={() => void add()} disabled={phone.trim().length < 8} className="h-10 cursor-pointer rounded-lg bg-[#051647] px-4 text-sm font-semibold text-white hover:bg-[#002187] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#C4D600] dark:text-[#051647]">Bloquear</button>
      </div>
      {items.length === 0 && <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">Nenhum número bloqueado.</p>}
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.phone} className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-3 dark:border-slate-700/80 dark:bg-[#07194f]">
            <span className="min-w-0 flex-1 truncate text-sm text-slate-900 dark:text-white">{formatPhone(item.phone)}{item.reason ? ` · ${item.reason}` : ""}</span>
            <button type="button" title="Desbloquear" aria-label={`Desbloquear ${item.phone}`} onClick={() => void remove(item.phone)} className="cursor-pointer rounded-lg p-2 text-slate-500 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}
