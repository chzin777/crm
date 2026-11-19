"use client";

import { useEffect, useState } from "react";
import { CircleDollarSign } from "lucide-react";
import { LoadingSpinner } from "@/components/LoadingSpinner";

type Purchase = { produto: string; data: string; valor: string };

/** Data do ERP em dd/mm/aaaa (aceita ISO, dd/mm/aaaa ou data do JS). */
export function formatContactDate(value: string | null | undefined) {
  if (!value) return "—";
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (isoMatch) return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  if (/^(\d{2})\/(\d{2})\/(\d{4})$/.test(value)) return value;
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
  return value;
}

/** Aba Histórico da ficha do cliente: compras do ERP VMSET. Usada na ficha completa e no modal do /chat. */
export function ContactPurchaseHistory({ contactId }: { contactId: string }) {
  const [state, setState] = useState<{ contactId: string; purchases: Purchase[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/contacts/${encodeURIComponent(contactId)}/purchases`)
      .then((res) => res.json())
      .then((result: { data?: unknown }) => {
        if (!cancelled) setState({ contactId, purchases: Array.isArray(result.data) ? (result.data as Purchase[]) : [] });
      })
      .catch(() => {
        if (!cancelled) setState({ contactId, purchases: [] });
      });
    return () => { cancelled = true; };
  }, [contactId]);

  const purchases = state?.contactId === contactId ? state.purchases : null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Histórico de compras</h3>
      {purchases === null ? (
        <LoadingSpinner label="Carregando compras..." className="w-full justify-center py-8" />
      ) : purchases.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center dark:border-slate-700">
          <CircleDollarSign className="mx-auto h-5 w-5 text-slate-400" />
          <p className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-300">Nenhuma compra registrada</p>
        </div>
      ) : (
        <div className="space-y-2">
          {purchases.map((purchase, index) => (
            <div key={index} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-800/40">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">{purchase.produto}</p>
                <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">{formatContactDate(purchase.data)}</p>
              </div>
              <span className="ml-3 shrink-0 text-xs font-bold text-slate-900 dark:text-white">{purchase.valor}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
