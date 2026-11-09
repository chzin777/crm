import { requireApiSession } from "@/lib/api-auth";
import { getMetaPricing } from "@/lib/meta-pricing";

/** Preços por categoria de modelo (R$) e janela de conversão, para as estimativas na tela. */
export async function GET() {
  if (!(await requireApiSession())) return Response.json({ error: "Não autenticado." }, { status: 401 });
  return Response.json({ data: await getMetaPricing() });
}
