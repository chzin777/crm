"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Copy, FileSpreadsheet, Loader2, Users, UserX } from "lucide-react";

export type SpreadsheetImportResult = {
  fileName: string;
  rows: number;
  contactIds: string[];
  linked: number;
  matchedByDocument: number;
  matchedByPhone: number;
  notFound: number;
  withoutKey: number;
};

/** Efeito da planilha na lista do segmento (calculado pela página, que guarda a lista). */
export type SpreadsheetMergeSummary = { added: number; alreadyIn: number; total: number };

/** Nome do segmento a partir do arquivo: "VIPS E SUPERVIPS GO.xlsx" → "VIPS E SUPERVIPS GO". */
export const segmentNameFromFile = (fileName: string) => fileName.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * Importa contatos por planilha (.xlsx/.csv): cruza CPF/CNPJ e telefone com a base do CRM.
 * Só vincula quem já existe; quem não está na base é ignorado e contado no resumo.
 */
export function SegmentSpreadsheetImport({ onImported }: { onImported: (result: SpreadsheetImportResult) => SpreadsheetMergeSummary }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Uma entrada por planilha importada neste formulário; a lista do segmento acumula todas.
  const [imports, setImports] = useState<(SpreadsheetImportResult & SpreadsheetMergeSummary)[]>([]);

  const upload = async (file: File) => {
    setLoading(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/segments/import", { method: "POST", body });
      const data = (await response.json().catch(() => null)) as (SpreadsheetImportResult & { error?: string }) | null;
      if (!response.ok || !data) throw new Error(data?.error ?? "Não foi possível importar a planilha.");
      const summary = onImported(data);
      setImports((current) => [...current, { ...data, ...summary }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível importar a planilha.");
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
        className="hidden"
        onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }}
      />
      <button
        type="button"
        disabled={loading}
        onClick={() => inputRef.current?.click()}
        className="flex w-full items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2.5 text-left transition-colors hover:border-[#002187] hover:bg-[#002187]/5 disabled:cursor-wait disabled:opacity-70 dark:border-slate-600 dark:bg-[#07194f] dark:hover:border-[#C4D600] dark:hover:bg-[#C4D600]/10 cursor-pointer"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#C4D600]/25 text-[#051647] dark:text-[#C4D600]">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
        </span>
        <span className="min-w-0">
          <span className="block text-xs font-semibold text-slate-800 dark:text-slate-100">{loading ? "Cruzando planilha com a base..." : "Importar por planilha (.xlsx ou .csv)"}</span>
          <span className="block text-[10px] text-slate-500 dark:text-slate-400">Vincula só contatos que já existem no CRM, por CPF/CNPJ ou telefone celular.</span>
        </span>
      </button>
      {error && <p role="alert" className="text-[11px] font-medium text-[#9a3d12] dark:text-[#F7915E]">{error}</p>}
      {imports.length > 0 && (
        <div role="status" className="space-y-2 rounded-xl bg-white p-3 text-[11px] text-slate-600 dark:bg-[#07194f] dark:text-slate-300">
          {imports.map((item, index) => (
            <div key={`${item.fileName}-${index}`} className="space-y-1 border-b border-slate-100 pb-2 last:border-0 last:pb-0 dark:border-slate-800">
              <p className="truncate font-semibold text-slate-800 dark:text-slate-100" title={item.fileName}>{item.fileName}</p>
              <p className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-300" />
                <span><b className="text-slate-900 dark:text-white">{item.added.toLocaleString("pt-BR")}</b> contatos novos adicionados ao segmento</span>
              </p>
              {item.alreadyIn > 0 && (
                <p className="flex items-center gap-1.5">
                  <Copy className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span><b className="text-slate-900 dark:text-white">{item.alreadyIn.toLocaleString("pt-BR")}</b> já estavam na lista (duplicados ignorados)</span>
                </p>
              )}
              <p className="flex items-center gap-1.5">
                <UserX className="h-3.5 w-3.5 shrink-0 text-[#F7915E]" />
                <span><b className="text-slate-900 dark:text-white">{item.notFound.toLocaleString("pt-BR")}</b> contatos da planilha não foram encontrados na base do CRM</span>
              </p>
              <p className="text-[10px] text-slate-400">
                {item.rows.toLocaleString("pt-BR")} linhas lidas · {item.matchedByDocument.toLocaleString("pt-BR")} por CPF/CNPJ · {item.matchedByPhone.toLocaleString("pt-BR")} por telefone
                {item.withoutKey > 0 ? ` · ${item.withoutKey.toLocaleString("pt-BR")} sem CPF nem telefone` : ""}
              </p>
            </div>
          ))}
          <p className="flex items-center gap-1.5 rounded-lg bg-[#C4D600]/20 px-2 py-1.5 text-xs text-[#051647] dark:text-[#C4D600]">
            <Users className="h-3.5 w-3.5 shrink-0" />
            <span>Total acumulado no segmento: <b>{imports[imports.length - 1].total.toLocaleString("pt-BR")}</b> contatos</span>
          </p>
        </div>
      )}
    </div>
  );
}
