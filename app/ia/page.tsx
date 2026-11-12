import { Sparkles } from "lucide-react";
import { AiSettingsPanel } from "@/components/AiSettingsPanel";

export const metadata = { title: "Inteligência Artificial | CRM Óticas Brasil" };

/** Centro de gerenciamento do agente de IA: comportamento, atuação, conexão, consumo e teste. */
export default function AiPage() {
  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-6 sm:p-8">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#051647] text-[#C4D600]"><Sparkles className="h-5 w-5" /></span>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Inteligência Artificial</h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Como a assistente fala, o que responde, onde e quando atende sozinha, quando passa para uma pessoa, quanto custa e um teste antes de colocar em produção.</p>
        </div>
      </div>
      <AiSettingsPanel />
    </main>
  );
}
