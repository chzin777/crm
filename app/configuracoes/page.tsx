"use client";

import { useState, type ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { FormSelect } from "@/components/FormSelect";
import { WhatsAppConnection } from "@/components/WhatsAppConnection";
import { Bell, CheckCircle2, Clock3, MessageSquare, Save, Store, TrendingUp, Users, Wifi } from "lucide-react";
import { useCrmData } from "@/hooks/useCrmData";
import { useCrmTheme } from "@/hooks/useCrmTheme";

interface PipelineRules {
  posVenda: { minCompras: number; maxDiasDesdeUltimaCompra: number };
  recompra: { minCompras: number; minTotalGasto: number; maxDiasDesdeUltimaCompra: number };
  reativacao: { minDiasInativo: number; minComprasHistoricas: number };
}

interface CrmSettings {
  storeName: string;
  contactEmail: string;
  timezone: string;
  language: string;
  currency: string;
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
  storeName: "Óticas Brasil",
  contactEmail: "",
  timezone: "America/Sao_Paulo",
  language: "pt-BR",
  currency: "BRL",
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

const timezones = ["America/Sao_Paulo", "America/Manaus", "America/Rio_Branco", "America/Noronha"];
const durationUnits: CrmSettings["defaultCampaignUnit"][] = ["horas", "dias", "semanas", "meses"];

function SettingsCard({ title, description, icon: Icon, children }: {
  title: string;
  description: string;
  icon: typeof Store;
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
  const { data: settings, setData: setSettings, isLoading: settingsLoading, isSaving: settingsSaving, error: settingsError, saveData: saveSettingsToDatabase } = useCrmData<CrmSettings>("settings", defaultSettings, { autoSave: false });
  const [saveMessage, setSaveMessage] = useState("");
  const [loadError, setLoadError] = useState("");

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
    if (settings.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.contactEmail)) {
      setSaveMessage("");
      setLoadError("Informe um e-mail de contato válido.");
      return;
    }
    setLoadError("");
    setSaveMessage("");
    try {
      await saveSettingsToDatabase(settings);
      setSaveMessage("Configurações salvas com sucesso.");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Não foi possível salvar as configurações.");
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

          <SettingsCard title="Perfil da loja" description="Informações principais da sua unidade e preferências regionais." icon={Store}>
            <div className="grid gap-4 sm:grid-cols-2">
              <SettingsTextField label="Nome da loja" value={settings.storeName} onChange={(value) => updateSetting("storeName", value)} />
              <SettingsTextField label="E-mail de contato" value={settings.contactEmail} type="email" placeholder="contato@empresa.com.br" onChange={(value) => updateSetting("contactEmail", value)} />
              <FormSelect label="Fuso horário" value={settings.timezone} options={timezones} onChange={(value) => updateSetting("timezone", value)} />
              <div className="grid grid-cols-2 gap-3">
                <FormSelect label="Idioma" value={settings.language} options={["pt-BR", "en-US", "es-ES"]} onChange={(value) => updateSetting("language", value)} />
                <FormSelect label="Moeda" value={settings.currency} options={["BRL", "USD", "EUR"]} onChange={(value) => updateSetting("currency", value)} />
              </div>
            </div>
          </SettingsCard>

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
                checked={settings.campaignDurationIndefinite}
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
              <SettingsToggle label="Novos contatos" description="Avisar quando um contato for adicionado à base." checked={settings.notifyNewContacts} onChange={(checked) => updateSetting("notifyNewContacts", checked)} />
              <SettingsToggle label="Campanhas" description="Avisar sobre mudanças de status e campanhas concluídas." checked={settings.notifyCampaigns} onChange={(checked) => updateSetting("notifyCampaigns", checked)} />
              <SettingsToggle label="Avaliações NPS baixas" description="Avisar quando uma pesquisa receber nota detratora (0 a 6)." checked={settings.notifyLowNps} onChange={(checked) => updateSetting("notifyLowNps", checked)} />
            </div>
          </SettingsCard>

          <SettingsCard title="Automação do Pipeline" description="Controle geral da sincronização automática de contatos nas etapas das pipelines." icon={TrendingUp}>
            <div className="space-y-4">
              <SettingsToggle
                label="Habilitar sincronização automática"
                description="Quando desativado, o botão 'Sincronizar contatos' na página de Pipelines retornará erro."
                checked={settings.pipelineAutoSyncEnabled}
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
                checked={settings.whatsappEnabled}
                onChange={(checked) => updateSetting("whatsappEnabled", checked)}
              />
              <WhatsAppConnection />
              <div className="flex items-start gap-2 rounded-lg border border-[#C4D600]/40 bg-[#C4D600]/10 p-3 text-[11px] text-slate-600 dark:text-slate-300">
                <Users className="mt-0.5 h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]" />
                O envio usa a Evolution API. Escaneie o QR Code com o WhatsApp do número da loja.
              </div>
            </div>
          </SettingsCard>

          <footer className="flex flex-col-reverse items-start justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-800 sm:flex-row sm:items-center">
            <div aria-live="polite" className="text-xs">
              {saveMessage && <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" />{saveMessage}</span>}
              {loadError && !saveMessage && <span role="alert" className="text-red-700 dark:text-red-300">{loadError}</span>}
            </div>
            <button type="button" onClick={saveSettings} disabled={settingsLoading || settingsSaving} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#051647] px-4 text-xs font-bold text-white shadow-xs transition-colors hover:bg-[#002187] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#CFDB6D] cursor-pointer hover:cursor-pointer">
              <Save className="h-4 w-4" />{settingsSaving ? "Salvando..." : "Salvar configurações"}
            </button>
          </footer>
        </main>
      </div>
    </div>
  );
}
