import { AiSettingsPanel } from "@/components/AiSettingsPanel";

export const metadata = { title: "Inteligência Artificial | CRM Óticas Brasil" };

/** Centro de gerenciamento do agente de IA: comportamento, atuação, conexão, consumo e teste. */
export default function AiPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Inteligência Artificial</h1>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Como a assistente fala, o que responde, onde e quando atende sozinha, quando passa para uma pessoa, quanto custa e um teste antes de colocar em produção.</p>
      </div>
      <AiSettingsPanel />
    </div>
  );
}
