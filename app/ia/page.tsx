import { AiSettingsPanel } from "@/components/AiSettingsPanel";

export const metadata = { title: "Inteligência Artificial | CRM Óticas Brasil" };

/**
 * Centro de gerenciamento do agente de IA: identidade, base de conhecimento, regras e transbordo, conexão e
 * consumo, e teste. O título, o status e o botão de salvar ficam no cabeçalho do painel (dependem do estado).
 */
export default function AiPage() {
  return <AiSettingsPanel />;
}
