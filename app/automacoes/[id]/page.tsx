import { FlowEditor } from "@/components/automations/FlowEditor";

export const metadata = { title: "Editor de automação | CRM Óticas Brasil" };

/**
 * Com cacheComponents, rota dinâmica precisa de ao menos um parâmetro conhecido no build (o menu usa usePathname);
 * os ids reais das automações são renderizados sob demanda.
 */
export async function generateStaticParams() {
  return [{ id: "exemplo" }];
}

/** Canvas visual da automação (nós, conexões, configuração e execuções). */
export default async function AutomationEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FlowEditor flowId={id} />;
}
