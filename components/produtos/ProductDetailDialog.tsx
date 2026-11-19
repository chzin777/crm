"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Loader2, MessageCircle, Package, Store } from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";
import { useToast } from "@/components/ToastProvider";
import { stockStatus, whatsappSummary } from "@/lib/catalog/catalog-query";
import { StockBadge, brl, copyText } from "@/components/produtos/catalog-ui";

type Detail = {
  product: {
    code: string; description: string; reference: string | null; ean: string | null; brand: string | null; category: string | null; categoryLabel: string;
    subcategory: string | null; ncm: string | null; color: string | null; material: string | null; eyeSize: string | null; bridge: string | null;
    warrantyMonths: number | null; price: number | null; priceMin: number | null; priceMax: number | null;
  };
  stores: { unit: string; label: string; available: number; reserved: number; price: number | null }[];
  prices: number[];
  live: boolean;
  totalStock: number;
  stockAt: number;
};

/** Ficha completa do produto no VMSET com estoque por loja e resumo pronto para o WhatsApp. */
export function ProductDetailDialog({ code, onClose }: { code: string; onClose: () => void }) {
  const toast = useToast();
  const [state, setState] = useState<{ code: string; detail?: Detail; error?: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/produtos/${encodeURIComponent(code)}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as Detail & { error?: string };
        setState(response.ok ? { code, detail: body } : { code, error: body.error || "Não foi possível abrir o produto." });
      })
      .catch((error: unknown) => { if (!controller.signal.aborted) setState({ code, error: error instanceof Error ? error.message : "Falha de conexão." }); });
    return () => controller.abort();
  }, [code]);

  const current = state?.code === code ? state : null;
  const detail = current?.detail;
  const copy = async (key: string, value: string, title: string) => {
    if (await copyText(value)) {
      setCopied(key);
      window.setTimeout(() => setCopied((value) => (value === key ? null : value)), 1500);
      toast.success(title);
    } else toast.error("Não foi possível copiar", "Copie manualmente o texto.");
  };

  const specs = detail ? ([
    ["Código", detail.product.code],
    ["Referência", detail.product.reference],
    ["EAN / código de barras", detail.product.ean],
    ["Marca", detail.product.brand],
    ["Categoria", detail.product.categoryLabel],
    ["Grupo", detail.product.subcategory],
    ["Cor", detail.product.color],
    ["Material", detail.product.material],
    ["Aro", detail.product.eyeSize],
    ["Ponte", detail.product.bridge],
    ["Garantia", detail.product.warrantyMonths ? `${detail.product.warrantyMonths} meses` : null],
    ["NCM", detail.product.ncm],
  ] as const).filter(([, value]) => value) : [];

  return (
    <EntityDialog titleId="produto-detalhe" title={detail?.product.description ?? "Produto"} description={detail ? `${detail.product.brand ?? "Sem marca"} · ${detail.product.categoryLabel}` : "Carregando dados do VMSET..."} onClose={onClose} size="xl">
      {!current && <p className="flex items-center gap-2 py-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Consultando o VMSET...</p>}
      {current?.error && <p role="alert" className="py-10 text-sm font-medium text-[#9a3d12] dark:text-[#F7915E]">{current.error}</p>}
      {detail && (
        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="min-w-0 space-y-4">
            <section className="rounded-2xl bg-[#051647] p-5 text-white">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#C4D600]">Preço de venda</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums">{detail.product.price ? brl(detail.product.price) : "Sob consulta"}</p>
              {detail.prices.length > 1 && <p className="mt-1 text-xs text-slate-300">Varia por loja: {brl(detail.prices[0])} a {brl(detail.prices[detail.prices.length - 1])}</p>}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <StockBadge status={stockStatus(detail.totalStock)} />
                <span className="text-xs text-slate-300">{detail.totalStock.toLocaleString("pt-BR")} peça{detail.totalStock === 1 ? "" : "s"} na rede · {detail.stores.filter((row) => row.available > 0).length} loja(s)</span>
              </div>
              <button
                type="button"
                onClick={() => void copy("whatsapp", whatsappSummary(detail.product, detail.stores), "Resumo copiado para colar no WhatsApp")}
                className="mt-4 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#C4D600] px-3 py-2.5 text-sm font-semibold text-[#051647] transition hover:brightness-105"
              >
                {copied === "whatsapp" ? <Check className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />} Copiar resumo para WhatsApp
              </button>
            </section>

            <section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><Package className="h-4 w-4 text-[#002187] dark:text-[#C4D600]" /> Especificações</h3>
              <dl className="grid grid-cols-1 gap-x-4 gap-y-2.5 text-sm sm:grid-cols-2">
                {specs.map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-[11px] text-slate-500 dark:text-slate-400">{label}</dt>
                    <dd className="flex min-w-0 items-center gap-1 font-medium text-slate-800 dark:text-slate-100">
                      <span className="truncate" title={String(value)}>{value}</span>
                      {(label === "Código" || label === "Referência" || label === "EAN / código de barras") && (
                        <button type="button" aria-label={`Copiar ${label.toLowerCase()}`} onClick={() => void copy(label, String(value), `${label} copiado`)} className="shrink-0 cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-[#002187] dark:hover:bg-white/10 dark:hover:text-[#C4D600]">
                          {copied === label ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>

          <section className="min-w-0 rounded-2xl border border-slate-200 dark:border-slate-700">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><Store className="h-4 w-4 text-[#002187] dark:text-[#C4D600]" /> Estoque por loja</h3>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">{detail.live ? "Saldo ao vivo do VMSET" : `Retrato das ${new Date(detail.stockAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}</span>
            </header>
            <div className="max-h-[52vh] overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-[10px] font-bold uppercase text-slate-400 dark:bg-[#0a2160]">
                  <tr><th className="px-4 py-2">Loja</th><th className="px-3 py-2 text-right">Disponível</th><th className="px-3 py-2 text-right">Reservado</th><th className="px-3 py-2 text-right">Preço</th><th className="px-4 py-2">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {detail.stores.map((row) => (
                    <tr key={row.unit} className={row.available > 0 ? "bg-[#C4D600]/5" : "text-slate-400"}>
                      <td className="px-4 py-2"><span className={`block truncate ${row.available > 0 ? "font-semibold text-slate-900 dark:text-white" : ""}`}>{row.label}</span></td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{Math.max(0, row.available).toLocaleString("pt-BR")}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.reserved > 0 ? row.reserved.toLocaleString("pt-BR") : "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.price ? brl(row.price) : "—"}</td>
                      <td className="px-4 py-2"><StockBadge status={stockStatus(row.available)} compact /></td>
                    </tr>
                  ))}
                  {detail.stores.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-500">Nenhuma loja de varejo cadastrada.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </EntityDialog>
  );
}
