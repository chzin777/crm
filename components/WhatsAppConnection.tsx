"use client";

import { useCallback, useEffect, useState } from "react";

export function WhatsAppConnection() {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na operação.");
    } finally {
      setBusy(false);
    }
  }

  const connected = state === "open";
  const buttonClass = "inline-flex h-9 items-center rounded-lg bg-[#051647] px-3 text-xs font-bold text-white transition-colors hover:bg-[#002187] disabled:opacity-60 dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#CFDB6D] cursor-pointer hover:cursor-pointer";

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-600 dark:text-slate-300">
        Status: <strong>{connected ? "Conectado" : state === "loading" ? "Verificando..." : "Desconectado"}</strong>
      </p>
      <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
        Número conectado
        <output className="flex h-10 w-full items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-normal text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {connected ? number ?? "Número não identificado" : "Conecte via QR Code para identificar o número"}
        </output>
      </label>
      {qrcode && !connected && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qrcode} alt="QR Code do WhatsApp" className="h-56 w-56 rounded-lg border border-slate-200 bg-white p-2" />
      )}
      {error && <p role="alert" className="text-xs text-red-700 dark:text-red-300">{error}</p>}
      <div className="flex gap-2">
        {connected ? (
          <button type="button" disabled={busy} onClick={() => request("DELETE")} className={buttonClass}>Desconectar</button>
        ) : (
          <button type="button" disabled={busy} onClick={() => request("POST")} className={buttonClass}>{qrcode ? "Gerar novo QR Code" : "Conectar via QR Code"}</button>
        )}
      </div>
    </div>
  );
}
