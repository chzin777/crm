"use client";

import React, { useState } from "react";
import {
  Bell,
  CheckCheck,
  Flame,
  Star,
  RefreshCw,
  Clock,
  X,
  ChevronRight,
} from "lucide-react";
import { WhatsAppIcon } from "./WhatsAppIcon";

interface NotificationItem {
  id: string;
  tipo: "lead" | "whatsapp" | "nps" | "recall";
  titulo: string;
  descricao: string;
  tempo: string;
  lida: boolean;
  urgente?: boolean;
}

interface NotificationDropdownProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationDropdown({ isOpen, onClose }: NotificationDropdownProps) {
  const [filter, setFilter] = useState<"todas" | "nao-lidas">("todas");

  const [notificacoes, setNotificacoes] = useState<NotificationItem[]>([
    {
      id: "N-1",
      tipo: "lead",
      titulo: "Novo Lead Quente no Instagram",
      descricao: "Guilherme Sampaio pediu orçamento para Ray-Ban Aviator Polarizado.",
      tempo: "Há 15 min",
      lida: false,
      urgente: true,
    },
    {
      id: "N-2",
      tipo: "nps",
      titulo: "NPS 30min: Nota 10 Recebida",
      descricao: "Mariana Albuquerque avaliou o atendimento do balcão como excelente.",
      tempo: "Há 32 min",
      lida: false,
      urgente: false,
    },
    {
      id: "N-3",
      tipo: "recall",
      titulo: "Recall: Exame Anual Vencido",
      descricao: "Roberto Mendes Filho completou 1 ano da última receita oftalmológica.",
      tempo: "Há 1 hora",
      lida: false,
      urgente: true,
    },
    {
      id: "N-4",
      tipo: "whatsapp",
      titulo: "Resposta no WhatsApp",
      descricao: "Carlos Eduardo respondeu sua sugestão sobre a nova linha Oakley.",
      tempo: "Há 2 horas",
      lida: false,
      urgente: false,
    },
    {
      id: "N-5",
      tipo: "nps",
      titulo: "NPS 30 Dias: Adaptação de Lentes",
      descricao: "Beatriz Nogueira completou 1 mês de uso do multifocal Varilux.",
      tempo: "Há 3 horas",
      lida: true,
      urgente: false,
    },
    {
      id: "N-6",
      tipo: "recall",
      titulo: "Reposição de Lentes de Contato",
      descricao: "Lucas Ferraz está no ciclo de reposição do kit Acuvue Oasys.",
      tempo: "Há 5 horas",
      lida: true,
      urgente: false,
    },
    {
      id: "N-7",
      tipo: "lead",
      titulo: "Indicação de Cliente VIP",
      descricao: "Amanda Meirelles foi indicada para agendamento de exame de vista.",
      tempo: "Ontem",
      lida: true,
      urgente: false,
    },
  ]);

  if (!isOpen) return null;

  const marcarTodasComoLidas = () => {
    setNotificacoes((prev) => prev.map((n) => ({ ...n, lida: true })));
  };

  const alternarLida = (id: string) => {
    setNotificacoes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, lida: !n.lida } : n))
    );
  };

  const removerNotificacao = (id: string) => {
    setNotificacoes((prev) => prev.filter((n) => n.id !== id));
  };

  const listaFiltrada = notificacoes.filter((n) =>
    filter === "nao-lidas" ? !n.lida : true
  );

  const totalNaoLidas = notificacoes.filter((n) => !n.lida).length;

  return (
    <div
      className="notification-dropdown-enter absolute right-0 top-12 w-96 max-w-[90vw] bg-white dark:bg-[#07194f] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 z-50 overflow-hidden flex flex-col transition-all duration-200"
    >
      {/* Cabeçalho do Card */}
      <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="font-bold text-sm text-slate-900 dark:text-white">
            Notificações
          </h2>
          {totalNaoLidas > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#F7915E] text-white">
              {totalNaoLidas} novas
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={marcarTodasComoLidas}
          className="flex items-center gap-1 text-[11px] font-semibold text-[#002187] dark:text-[#C4D600] hover:underline cursor-pointer hover:cursor-pointer"
        >
          <CheckCheck className="w-3.5 h-3.5" />
          Marcar como lidas
        </button>
      </div>

      {/* Abas Rápidas */}
      <div className="px-4 pt-2.5 pb-1 flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 text-xs font-semibold">
        <button
          type="button"
          onClick={() => setFilter("todas")}
          className={`pb-2 border-b-2 transition-all cursor-pointer hover:cursor-pointer ${
            filter === "todas"
              ? "border-[#051647] dark:border-[#C4D600] text-slate-900 dark:text-white"
              : "border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          }`}
        >
          Todas ({notificacoes.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter("nao-lidas")}
          className={`pb-2 border-b-2 transition-all cursor-pointer hover:cursor-pointer ${
            filter === "nao-lidas"
              ? "border-[#051647] dark:border-[#C4D600] text-slate-900 dark:text-white"
              : "border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          }`}
        >
          Não Lidas ({totalNaoLidas})
        </button>
      </div>

      {/* Lista de Notificações */}
      <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
        {listaFiltrada.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400">
            Nenhuma notificação encontrada neste filtro.
          </div>
        ) : (
          listaFiltrada.map((item) => {
            let Icone = Bell;
            let iconColor = "text-slate-600 bg-slate-100 dark:bg-slate-800";

            if (item.tipo === "lead") {
              Icone = Flame;
              iconColor = "text-[#F7915E] bg-[#F7915E]/15";
            } else if (item.tipo === "whatsapp") {
              iconColor = "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40";
            } else if (item.tipo === "nps") {
              Icone = Star;
              iconColor = "text-[#002187] bg-blue-50 dark:text-[#C4D600] dark:bg-blue-950/50";
            } else if (item.tipo === "recall") {
              Icone = RefreshCw;
              iconColor = "text-amber-600 bg-amber-50 dark:bg-amber-950/40";
            }

            return (
              <div
                key={item.id}
                className={`p-3.5 flex items-start gap-3 transition-colors ${
                  item.lida
                    ? "bg-white dark:bg-[#07194f] opacity-80"
                    : "bg-blue-50/40 dark:bg-slate-800/40"
                } hover:bg-slate-50 dark:hover:bg-slate-800/70`}
              >
                {/* Ícone */}
                <div className={`p-2 rounded-xl shrink-0 ${iconColor}`}>
                  {item.tipo === "whatsapp" ? (
                    <WhatsAppIcon className="w-4 h-4 fill-emerald-600" />
                  ) : (
                    <Icone className="w-4 h-4" />
                  )}
                </div>

                {/* Conteúdo */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-start justify-between gap-1">
                    <p className="font-bold text-xs text-slate-900 dark:text-white leading-tight">
                      {item.titulo}
                    </p>
                    <button
                      type="button"
                      onClick={() => removerNotificacao(item.id)}
                      className="text-slate-300 hover:text-slate-500 dark:hover:text-slate-200 cursor-pointer hover:cursor-pointer"
                      title="Dispensar notificação"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-2">
                    {item.descricao}
                  </p>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                    <span>{item.tempo}</span>
                    <button
                      type="button"
                      onClick={() => alternarLida(item.id)}
                      className="text-[#002187] dark:text-[#C4D600] hover:underline cursor-pointer hover:cursor-pointer font-semibold"
                    >
                      {item.lida ? "Marcar não lida" : "Marcar como lida"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Rodapé do Card */}
      <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 text-center">
        <button
          type="button"
          onClick={onClose}
          className="text-xs font-semibold text-[#002187] dark:text-[#C4D600] hover:underline flex items-center justify-center gap-1 w-full cursor-pointer hover:cursor-pointer"
        >
          <span>Fechar alertas</span>
        </button>
      </div>
    </div>
  );
}
