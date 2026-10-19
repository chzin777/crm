"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ToastProvider";
import { CheckCircle2, Link2Off, Loader2, Phone, QrCode, RefreshCw, Wifi, WifiOff } from "lucide-react";

export function WhatsAppConnection() {
  const toast = useToast();
  const [state, setState] = useState("loading");
  const [number, setNumber] = useState<string | null>(null);
  const [qrcode, setQrcode] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/whatsapp/connection", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Falha ao consultar a conexão.");
      setState(data?.state ?? "close");
      setNumber(data?.number ?? null);
      setError("");
      if (data?.state === "open") setQrcode(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao consultar a conexão.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  async function request(method: "POST" | "DELETE") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/whatsapp/connection", { method });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Falha na operação.");
      setQrcode(method === "POST" ? data.qrcode : null);
      await refresh();
      if (method === "DELETE") toast.success("WhatsApp desconectado", "A conexão foi encerrada.");
      else toast.success("QR Code gerado", "Escaneie o código para conectar o WhatsApp.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha na operação.";
      setError(message);
      toast.error("Erro na conexão do WhatsApp", message);
    } finally {
      setBusy(false);
    }
  }

  const connected = state === "open";
  const loading = state === "loading";

  return (
    <div className="space-y-4">
      {/* Status indicator */}
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/60">
        <span className="relative flex h-3 w-3 shrink-0">
          {connected && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          )}
          <span
            className={[
              "relative inline-flex h-3 w-3 rounded-full",
              connected ? "bg-emerald-500" : loading ? "bg-amber-400" : "bg-red-400",
            ].join(" ")}
          />
        </span>
        <div className="flex flex-1 items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              {connected ? "Conectado" : loading ? "Verificando conexão..." : "Desconectado"}
            </p>
            {connected && number && (
              <span className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                <Phone className="h-3 w-3" />
                {number}
              </span>
            )}
          </div>
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-white shadow-sm dark:bg-slate-700">
            {connected ? (
              <Wifi className="h-4 w-4 text-emerald-500" />
            ) : loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
            ) : (
              <WifiOff className="h-4 w-4 text-red-400" />
            )}
          </span>
        </div>
      </div>

      {/* QR Code area */}
      {qrcode && !connected && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white p-4 dark:border-slate-600 dark:bg-slate-800/40">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Escaneie o QR Code com o WhatsApp do número da loja
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrcode}
            alt="QR Code do WhatsApp"
            className="h-48 w-48 rounded-lg border border-slate-200 bg-white p-2 shadow-sm"
          />
        </div>
      )}

      {/* Disconnected info */}
      {!connected && !loading && !qrcode && (
        <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/40">
          <QrCode className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            Nenhum WhatsApp conectado. Clique no botão abaixo para gerar um QR Code e vincular o número da loja.
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-600 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </p>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        {connected ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => request("DELETE")}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:opacity-60 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/50 cursor-pointer hover:cursor-pointer"
          >
            <Link2Off className="h-3.5 w-3.5" />
            Desconectar
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => request("POST")}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#051647] px-4 text-xs font-bold text-white transition-colors hover:bg-[#002187] disabled:opacity-60 dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#CFDB6D] cursor-pointer hover:cursor-pointer"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : qrcode ? <RefreshCw className="h-3.5 w-3.5" /> : <QrCode className="h-3.5 w-3.5" />}
            {busy ? "Gerando..." : qrcode ? "Gerar novo QR Code" : "Conectar via QR Code"}
          </button>
        )}
      </div>
    </div>
  );
}