"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { FormSelect } from "@/components/FormSelect";
import { WhatsAppConnection } from "@/components/WhatsAppConnection";
import { Bell, CheckCircle2, Clock3, MessageSquare, Save, TrendingUp, Users, Wifi } from "lucide-react";
import { useCrmData } from "@/hooks/useCrmData";
import { useCrmTheme } from "@/hooks/useCrmTheme";
import { useToast } from "@/components/ToastProvider";

interface PipelineRules {
  posVenda: { minCompras: number; maxDiasDesdeUltimaCompra: number };
  recompra: { minCompras: number; minTotalGasto: number; maxDiasDesdeUltimaCompra: number };
  reativacao: { minDiasInativo: number; minComprasHistoricas: number };
}

interface CrmSettings {
  npsServiceDelay: string;
  npsProductDelay: string;
  inactiveCustomerDays: string;
  defaultCampaignDuration: string;
  defaultCampaignUnit: "horas" | "dias" | "semanas" | "meses";
  campaignDurationIndefinite: boolean;
  notifyNewContacts: boolean;
  notifyCampaigns: boolean;
  notifyLowNps: boolean;
  whatsappEnabled: boolean;
  pipelineAutoSyncEnabled: boolean;
  pipelineMaxCardsPerStage: number;
  pipelineRules: PipelineRules;
}

const defaultSettings: CrmSettings = {
    npsServiceDelay: "30",
  npsProductDelay: "30",
  inactiveCustomerDays: "180",
  defaultCampaignDuration: "7",
  defaultCampaignUnit: "dias",
  campaignDurationIndefinite: true,
  notifyNewContacts: true,
  notifyCampaigns: true,
  notifyLowNps: true,
  whatsappEnabled: false,
  pipelineAutoSyncEnabled: true,
  pipelineMaxCardsPerStage: 200,
  pipelineRules: {
    posVenda: { minCompras: 1, maxDiasDesdeUltimaCompra: 30 },
    recompra: { minCompras: 2, minTotalGasto: 100, maxDiasDesdeUltimaCompra: 90 },
    reativacao: { minDiasInativo: 180, minComprasHistoricas: 1 },
  },
};

const durationUnits: CrmSettings["defaultCampaignUnit"][] = ["horas", "dias", "semanas", "meses"];

function SettingsCard({ title, description, icon: Icon, children }: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#07194f] sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#C4D600]/20 text-[#051647] dark:bg-[#C4D600]/15 dark:text-[#C4D600]"><Icon className="h-4 w-4" /></span>
        <div><h2 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h2><p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{description}</p></div>
      </div>
      {children}
    </section>
  );
}

function SettingsTextField({ label, value, onChange, type = "text", placeholder }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
      {label}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        min={type === "number" ? "1" : undefined}
        step={type === "number" ? "1" : undefined}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]"
      />
    </label>
  );
}

function SettingsToggle({ label, description, checked, onChange }: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-2">
      <span><span className="block text-xs font-semibold text-slate-700 dark:text-slate-200">{label}</span><span className="mt-0.5 block text-[10px] text-slate-400">{description}</span></span>
      <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
        <input
          type="checkbox"
          role="switch"
          aria-label={label}
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="peer sr-only"
        />
        <span className="pointer-events-none absolute inset-0 rounded-full bg-slate-300 transition-colors peer-checked:bg-[#C4D600] peer-focus-visible:ring-2 peer-focus-visible:ring-[#002187] peer-focus-visible:ring-offset-2 dark:bg-slate-600 dark:peer-checked:bg-[#C4D600] dark:peer-focus-visible:ring-[#C4D600] dark:peer-focus-visible:ring-offset-[#07194f]" />
        <span className="pointer-events-none absolute left-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

export default function ConfiguracoesPage() {
  const { isDark, toggleTheme } = useCrmTheme();
  const toast = useToast();
  const { data: settings, setData: setSettings, isLoading: settingsLoading, isSaving: settingsSaving, error: settingsError, saveData: saveSettingsToDatabase } = useCrmData<CrmSettings>("settings", defaultSettings, { autoSave: false });
  const [saveMessage, setSaveMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const initialSettingsRef = useRef<CrmSettings | null>(null);

  useEffect(() => {
    if (!settingsLoading && !initialSettingsRef.current) {
      initialSettingsRef.current = JSON.parse(JSON.stringify(settings));
    }
  }, [settingsLoading, settings]);

  useEffect(() => {
    if (initialSettingsRef.current) {
      const changed = JSON.stringify(settings) !== JSON.stringify(initialSettingsRef.current);
      setHasChanges(changed);
    }
  }, [settings]);

  const updateSetting = <K extends keyof CrmSettings>(key: K, value: CrmSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
    setSaveMessage("");
  };

  const saveSettings = async () => {
    const numericValues = [
      settings.npsServiceDelay,
      settings.npsProductDelay,
      settings.inactiveCustomerDays,
      ...(settings.campaignDurationIndefinite ? [] : [settings.defaultCampaignDuration]),
    ];
    if (numericValues.some((value) => !Number.isInteger(Number(value)) || Number(value) < 1)) {
      setSaveMessage("");
      setLoadError("Os intervalos e durações devem ser números inteiros maiores que zero.");
      return;
    }
    setLoadError("");
    setSaveMessage("");
    try {
      await saveSettingsToDatabase(settings);
      setSaveMessage("Configurações salvas com sucesso.");
      toast.success("Configurações salvas", "As alterações foram aplicadas.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível salvar as configurações.";
      setLoadError(message);
      toast.error("Erro ao salvar configurações", message);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#f4f5f8] text-slate-800 transition-colors dark:bg-[#030d29] dark:text-slate-100">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="mx-4 mt-4 flex h-16 items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-6 shadow-sm dark:border-slate-800 dark:bg-[#051647]">
          <div className="text-sm font-semibold text-slate-500 dark:text-slate-300">
            Workspace <span className="text-slate-300 dark:text-slate-600">/</span> <strong className="text-slate-900 dark:text-white">Configurações</strong>
          </div>
          <div className="flex items-center gap-3">
            <ThemeSwitch isDark={isDark} onToggle={toggleTheme} />
            <button type="button" aria-label="Alertas" title="Alertas" className="topbar-icon-button bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700 cursor-pointer hover:cursor-pointer">
              <Bell className="h-4 w-4" />
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl space-y-6 p-6 sm:p-8">
          {settingsLoading && <LoadingSpinner label="Carregando configurações do banco..." />}
          {settingsError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{settingsError}</p>}
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Configurações do CRM</h1>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Gerencie os dados da loja, automações, notificações e canais de atendimento.</p>
            </div>
            <span className="text-[10px] text-slate-400">Salve as alterações para aplicá-las.</span>
          </div>

          {loadError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{loadError}</p>}

          <SettingsCard title="Automações e pesquisas NPS" description="Defina os intervalos para pesquisas e regras usadas pela base de clientes." icon={Clock3}>
            <div className="grid gap-4 sm:grid-cols-3">
              <SettingsTextField label="Enviar NPS de atendimento após (minutos)" value={settings.npsServiceDelay} type="number" onChange={(value) => updateSetting("npsServiceDelay", value)} />
              <SettingsTextField label="Enviar pesquisa de produto após (dias)" value={settings.npsProductDelay} type="number" onChange={(value) => updateSetting("npsProductDelay", value)} />
              <SettingsTextField label="Considerar cliente inativo após (dias)" value={settings.inactiveCustomerDays} type="number" onChange={(value) => updateSetting("inactiveCustomerDays", value)} />
            </div>
          </SettingsCard>

          <SettingsCard title="Padrão para campanhas" description="Configure a duração sugerida para novas campanhas. A data começa ao ativar." icon={MessageSquare}>
            <div className="space-y-3">
              <SettingsToggle
                label="Manter campanhas ativas por tempo indeterminado"
                description="Quando desativado, novas campanhas começam com o período definido abaixo."
                checked={Boolean(settings.campaignDurationIndefinite)}
                onChange={(checked) => updateSetting("campaignDurationIndefinite", checked)}
              />
              {!settings.campaignDurationIndefinite && (
                <div className="grid max-w-lg grid-cols-2 gap-3">
                  <SettingsTextField label="Duração padrão" value={settings.defaultCampaignDuration} type="number" onChange={(value) => updateSetting("defaultCampaignDuration", value)} />
                  <FormSelect
                    label="Unidade"
                    value={settings.defaultCampaignUnit}
                    options={durationUnits}
                    onChange={(value) => {
                      const unit = durationUnits.find((option) => option === value);
                      if (unit) updateSetting("defaultCampaignUnit", unit);
                    }}
                  />
                </div>
              )}
            </div>
          </SettingsCard>

          <SettingsCard title="Notificações" description="Escolha quais eventos devem chamar sua atenção no CRM." icon={Bell}>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              <SettingsToggle label="Novos contatos" description="Avisar quando um contato for adicionado à base." checked={Boolean(settings.notifyNewContacts)} onChange={(checked) => updateSetting("notifyNewContacts", checked)} />
              <SettingsToggle label="Campanhas" description="Avisar sobre mudanças de status e campanhas concluídas." checked={Boolean(settings.notifyCampaigns)} onChange={(checked) => updateSetting("notifyCampaigns", checked)} />
              <SettingsToggle label="Avaliações NPS baixas" description="Avisar quando uma pesquisa receber nota detratora (0 a 6)." checked={Boolean(settings.notifyLowNps)} onChange={(checked) => updateSetting("notifyLowNps", checked)} />
            </div>
          </SettingsCard>

          <SettingsCard title="Automação do Pipeline" description="Controle geral da sincronização automática de contatos nas etapas das pipelines." icon={TrendingUp}>
            <div className="space-y-4">
              <SettingsToggle
                label="Habilitar sincronização automática"
                description="Quando desativado, o botão 'Sincronizar contatos' na página de Pipelines retornará erro."
                checked={settings.pipelineAutoSyncEnabled ?? true}
                onChange={(checked) => updateSetting("pipelineAutoSyncEnabled", checked)}
              />
              <SettingsTextField label="Limite de cards por etapa" value={String(settings.pipelineMaxCardsPerStage)} type="number" onChange={(value) => updateSetting("pipelineMaxCardsPerStage", Number(value))} />
              <p className="text-xs text-slate-500 dark:text-slate-400">As regras de cada etapa (filtros, posição, prazo e nome) são editadas na página Pipelines, pelo ícone de lápis no cabeçalho de cada etapa.</p>
            </div>
          </SettingsCard>

          <SettingsCard title="Canal WhatsApp" description="Preferências do canal usado para mensagens e pesquisas." icon={Wifi}>
            <div className="space-y-4">
              <SettingsToggle
                label="Habilitar canal WhatsApp"
                description="Preferência salva no banco; não conecta um provedor nem habilita o envio de mensagens."
                checked={Boolean(settings.whatsappEnabled)}
                onChange={(checked) => updateSetting("whatsappEnabled", checked)}
              />
              <WhatsAppConnection />
            </div>
          </SettingsCard>

          <footer className="border-t border-slate-200 pt-4 dark:border-slate-800">
            <div aria-live="polite" className="text-xs">
              {saveMessage && <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" />{saveMessage}</span>}
            </div>
          </footer>
        </main>
      </div>

      {/* Floating save bar — Discord style */}
      <div
        className={[
          "fixed inset-x-0 bottom-0 z-50 flex items-center justify-between gap-4 border-t border-slate-200 bg-white/95 px-6 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] backdrop-blur-sm transition-all duration-300 dark:border-slate-700 dark:bg-slate-900/95",
          hasChanges ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0",
        ].join(" ")}
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Você tem alterações não salvas
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (initialSettingsRef.current) {
                setSettings(JSON.parse(JSON.stringify(initialSettingsRef.current)));
                setHasChanges(false);
              }
            }}
            className="inline-flex h-9 items-center rounded-lg px-4 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer hover:cursor-pointer"
          >
            Descartar
          </button>
          <button
            type="button"
            onClick={saveSettings}
            disabled={settingsSaving}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#C4D600] px-5 text-sm font-bold text-[#051647] shadow-sm transition-all hover:brightness-105 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer hover:cursor-pointer"
          >
            <Save className="h-4 w-4" />
            {settingsSaving ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </div>
    </div>
  );
}
