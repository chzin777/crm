"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquare, RefreshCw } from "lucide-react";

type Messaging = {
  tier?: string | null;
  dailyLimit?: number | null;
  throughput?: string | null;
  canSendMessage?: string | null;
  blockers?: { code: number | null; description: string; solution: string }[];
};
type Connection = { state?: string; number?: string | null; verifiedName?: string | null; quality?: string | null; messaging?: Messaging | null; error?: string };

const QUALITY_LABEL: Record<string, string> = { GREEN: "Alta", YELLOW: "Média", RED: "Baixa", UNKNOWN: "Indisponível" };
const SEND_LABEL: Record<string, string> = { AVAILABLE: "Apto a enviar", LIMITED: "Limitado", BLOCKED: "Bloqueado" };

function formatPhone(value?: string | null) {
  if (!value) return "—";
  const digits = value.replace(/\D/g, "");
  const match = /^55(\d{2})(9?\d{4})(\d{4})$/.exec(digits);
  return match ? `+55 (${match[1]}) ${match[2]}-${match[3]}` : value;
}

function formatLimit(messaging?: Messaging | null) {
  if (!messaging || messaging.dailyLimit == null) return "—";
  if (messaging.dailyLimit < 0) return "Ilimitado";
  return `${messaging.dailyLimit.toLocaleString("pt-BR")} contatos / 24h`;
}

export function WhatsAppSettings() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/whatsapp/connection", { cache: "no-store" });
      setConnection((await response.json().catch(() => ({ error: "Falha ao consultar a conexão." }))) as Connection);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const connected = connection?.state === "open";
  const messaging = connection?.messaging;
  const canSend = messaging?.canSendMessage;
  const items = [
    { label: "Status", value: loading ? "Verificando..." : connected ? "Conectado" : "Desconectado", tone: connected },
    { label: "Número", value: formatPhone(connection?.number) },
    { label: "Nome verificado", value: connection?.verifiedName ?? "—" },
    { label: "Qualidade", value: connection?.quality ? QUALITY_LABEL[connection.quality] ?? connection.quality : "—" },
    { label: "Limite de mensagens", value: formatLimit(messaging) },
    { label: "Envio de mensagens", value: canSend ? SEND_LABEL[canSend] ?? canSend : "—", ...(canSend ? { tone: canSend === "AVAILABLE" } : {}) },
  ];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#07194f] sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#C4D600]/20 text-[#051647] dark:bg-[#C4D600]/15 dark:text-[#C4D600]"><MessageSquare className="h-4 w-4" /></span>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">WhatsApp Business</h2>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Conta conectada ao CRM para envio de mensagens.</p>
          </div>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer hover:cursor-pointer">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {items.map((item) => (
          <div key={item.label} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{item.label}</p>
            <p className="mt-1 flex items-center gap-1.5 truncate text-sm font-bold text-slate-900 dark:text-white">
              {"tone" in item && !loading && <span className={`h-2 w-2 rounded-full ${item.tone ? "bg-[#C4D600]" : "bg-[#F7915E]"}`} />}
              {item.value}
            </p>
          </div>
        ))}
      </div>
      {messaging?.blockers && messaging.blockers.length > 0 && (
        <ul role="alert" className="mt-3 space-y-1 rounded-lg border border-[#F7915E]/50 bg-[#F7915E]/10 p-3 text-xs text-[#9a3d12] dark:text-[#F7915E]">
          {messaging.blockers.map((blocker, index) => (
            <li key={`${blocker.code}-${index}`}>
              <strong>{blocker.description}</strong>{blocker.solution ? ` ${blocker.solution}` : ""}
            </li>
          ))}
        </ul>
      )}
      {connection?.error && <p role="alert" className="mt-2 text-xs text-[#9a3d12] dark:text-[#F7915E]">{connection.error}</p>}
    </section>
  );
}
