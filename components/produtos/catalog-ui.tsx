"use client";

import { CheckCircle2, CircleSlash, TriangleAlert } from "lucide-react";
import type { StockStatus } from "@/lib/catalog/catalog-query";

export const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Copia para a área de transferência (com alternativa para navegador sem permissão). */
export async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = value;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

const STATUS = {
  em_estoque: { label: "Em estoque", icon: CheckCircle2, className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/30" },
  ultimas_unidades: { label: "Últimas unidades", icon: TriangleAlert, className: "bg-[#F7915E]/10 text-[#9a3d12] ring-[#F7915E]/40 dark:text-[#F7915E]" },
  sem_estoque: { label: "Sem estoque", icon: CircleSlash, className: "bg-slate-100 text-slate-500 ring-slate-300/60 dark:bg-white/5 dark:text-slate-400 dark:ring-white/10" },
} as const;

export function StockBadge({ status, compact = false }: { status: StockStatus; compact?: boolean }) {
  const meta = STATUS[status];
  const Icon = meta.icon;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${meta.className}`}>
      <Icon className="h-3 w-3" />{compact && status === "em_estoque" ? "Disponível" : meta.label}
    </span>
  );
}
