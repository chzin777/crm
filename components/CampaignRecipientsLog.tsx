"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Search } from "lucide-react";

type RecipientStatus = "queued" | "sent" | "delivered" | "read" | "replied" | "failed";
type RecipientRow = { id: string; name: string; phone: string; status: RecipientStatus; at: string; failureReason: string | null };
type RecipientsResponse = { data?: RecipientRow[]; total?: number; pageSize?: number; error?: string };

const STATUS_LABEL: Record<RecipientStatus, string> = {
  queued: "Na fila",
  sent: "Enviado",
  delivered: "Entregue",
  read: "Lido",
  replied: "Respondeu",
  failed: "Erro",
};
const STATUS_CLASS: Record<RecipientStatus, string> = {
  queued: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  sent: "bg-blue-50 text-[#002187] dark:bg-blue-900/30 dark:text-blue-300",
  delivered: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  read: "bg-[#C4D600]/20 text-[#051647] dark:text-[#C4D600]",
  replied: "bg-[#002187] text-white dark:bg-[#C4D600] dark:text-[#051647]",
  failed: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};
const FILTERS: { value: "" | RecipientStatus; label: string }[] = [
  { value: "", label: "Todos" },
  { value: "sent", label: "Enviados" },
  { value: "delivered", label: "Entregues" },
  { value: "read", label: "Lidos" },
  { value: "replied", label: "Responderam" },
  { value: "failed", label: "Erros" },
];

const formatPhone = (phone: string) => {
  const digits = phone.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return phone;
};
const formatDate = (value: string) => new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

/** Lista paginada dos destinatários de um disparo com o status individual; atualiza sozinha enquanto o envio roda. */
export function CampaignRecipientsLog({ campaignId, live }: { campaignId: string; live: boolean }) {
  const [rows, setRows] = useState<RecipientRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | RecipientStatus>("");
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => { setSearch(query.trim()); setPage(1); }, 350);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => setTick((value) => value + 1), 4000);
    return () => window.clearInterval(timer);
  }, [live]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page) });
    if (search) params.set("q", search);
    if (status) params.set("status", status);
    fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/recipients?${params.toString()}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as RecipientsResponse | null;
        if (!response.ok) throw new Error(body?.error ?? "Não foi possível carregar os destinatários.");
        setRows(body?.data ?? []);
        setTotal(body?.total ?? 0);
        setPageSize(body?.pageSize ?? 25);
        setError("");
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Não foi possível carregar os destinatários.");
      });
    return () => controller.abort();
  }, [campaignId, page, search, status, tick]);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-slate-200 dark:border-slate-700">
      <div className="shrink-0 space-y-2 border-b border-slate-100 p-3 dark:border-slate-800">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold text-slate-800 dark:text-slate-100">Destinatários do disparo</p>
          <span className="flex items-center gap-1 text-[10px] text-slate-400">
            {live && <RefreshCw className="h-3 w-3 animate-spin" />}
            {total.toLocaleString("pt-BR")} contato{total === 1 ? "" : "s"}
          </span>
        </div>
        <label className="relative block">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nome ou telefone"
            aria-label="Buscar destinatário"
            className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-2.5 text-xs text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]"
          />
        </label>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((filter) => (
            <button
              key={filter.value || "all"}
              type="button"
              onClick={() => { setStatus(filter.value); setPage(1); }}
              className={`h-6 rounded-md px-2 text-[10px] font-semibold transition-colors cursor-pointer ${status === filter.value ? "bg-[#051647] text-white dark:bg-[#C4D600] dark:text-[#051647]" : "bg-slate-100 text-slate-500 hover:text-slate-800 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-white"}`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <p role="alert" className="p-4 text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{error}</p>
        ) : rows === null ? (
          <div className="space-y-2 p-3" aria-busy="true">
            {Array.from({ length: 8 }, (_, index) => <div key={index} className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/60" />)}
          </div>
        ) : rows.length === 0 ? (
          <p className="p-6 text-center text-xs text-slate-400">
            {search || status ? "Nenhum destinatário com esse filtro." : live ? "Os destinatários aparecem aqui conforme as mensagens são enviadas." : "Nenhuma mensagem enviada neste disparo ainda."}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((row) => (
              <li key={row.id} className="flex items-start justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{row.name || "Contato sem nome"}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">{formatPhone(row.phone)} · {formatDate(row.at)}</p>
                  {row.status === "failed" && row.failureReason && <p className="mt-0.5 line-clamp-2 text-[10px] text-red-600 dark:text-red-400" title={row.failureReason}>{row.failureReason}</p>}
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_CLASS[row.status]}`}>{STATUS_LABEL[row.status]}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-slate-100 px-3 py-2 text-[10px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <span>Página {Math.min(page, pages)} de {pages}</span>
        <div className="flex gap-1">
          <button type="button" aria-label="Página anterior" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 cursor-pointer"><ChevronLeft className="h-3.5 w-3.5" /></button>
          <button type="button" aria-label="Próxima página" disabled={page >= pages} onClick={() => setPage((value) => Math.min(pages, value + 1))} className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 cursor-pointer"><ChevronRight className="h-3.5 w-3.5" /></button>
        </div>
      </div>
    </div>
  );
}
