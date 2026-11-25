import { redirect } from "next/navigation";

/**
 * Rota antiga "Conversão Real": os indicadores foram para /metricas-atendimento e as regras de disparo
 * (revisão de grau, lentes de contato e recuperação de orçamento) para /automacoes.
 */
export default function ConversionRedirect() {
  redirect("/metricas-atendimento#conversao");
}
