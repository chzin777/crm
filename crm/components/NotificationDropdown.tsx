"use client";

import { useEffect, useState } from "react";
import { Star, UserRound, X } from "lucide-react";

interface NotificationActivity {
  id: string;
  tipo: "lead" | "nps";
  titulo: string;
  descricao: string;
  createdAt: string;
}

interface NotificationDropdownProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationDropdown({ isOpen, onClose }: NotificationDropdownProps) {
  const [activities, setActivities] = useState<NotificationActivity[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    fetch("/api/notifications")
      .then(async (response) => {
        const result = await response.json() as { data?: NotificationActivity[]; error?: string };
        if (!response.ok) throw new Error(result.error || "Não foi possível carregar as atividades.");
        if (active) {
          setActivities(result.data ?? []);
          setError("");
          setHasLoaded(true);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "Não foi possível carregar as atividades.");
          setHasLoaded(true);
        }
      })
    return () => { active = false; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <section
      aria-label="Atividades recentes"
      className="notification-dropdown-enter absolute right-0 top-12 z-50 flex w-96 max-w-[90vw] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all duration-200 dark:border-slate-800 dark:bg-[#07194f]"
    >
      <header className="flex items-center justify-between border-b border-slate-100 p-4 dark:border-slate-800">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">Atividades recentes</h2>
          <p className="mt-1 text-[10px] text-slate-400">{activities.length} registros recentes</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar atividades recentes"
          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer hover:cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      {error && <p role="alert" className="m-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      <div className="max-h-[380px] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
        {!hasLoaded ? (
          <p role="status" className="py-10 text-center text-xs text-slate-400">Carregando atividades recentes...</p>
        ) : activities.length === 0 ? (
          <p className="py-10 text-center text-xs text-slate-400">Nenhuma atividade registrada.</p>
        ) : activities.map((activity) => {
          const Icon = activity.tipo === "nps" ? Star : UserRound;
          const iconStyle = activity.tipo === "nps"
            ? "bg-blue-50 text-[#002187] dark:bg-blue-950/50 dark:text-[#C4D600]"
            : "bg-[#C4D600]/20 text-[#051647] dark:bg-[#C4D600]/15 dark:text-[#C4D600]";
          return (
            <article key={activity.id} className="flex items-start gap-3 p-3.5">
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${iconStyle}`}>
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-xs font-bold leading-tight text-slate-900 dark:text-white">{activity.titulo}</p>
                <p className="line-clamp-2 text-[11px] text-slate-600 dark:text-slate-300">{activity.descricao}</p>
                <time dateTime={activity.createdAt} className="block pt-0.5 text-[10px] text-slate-400">
                  {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(activity.createdAt))}
                </time>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
