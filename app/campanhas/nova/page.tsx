import { redirect } from "next/navigation";

/** Atalho "Criar campanha com este segmento": abre o assistente de nova campanha com o público já escolhido. */
export default async function NovaCampanhaPage({ searchParams }: { searchParams: Promise<{ segmentoId?: string }> }) {
  const { segmentoId } = await searchParams;
  redirect(`/campanhas?nova=1${segmentoId ? `&segmentoId=${encodeURIComponent(segmentoId)}` : ""}`);
}
