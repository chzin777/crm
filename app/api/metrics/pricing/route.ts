import { requireApiSession, requireModule } from "@/lib/api-auth";
import { getMetaPricing, saveMetaPricing } from "@/lib/meta-pricing";

/** Preços por categoria de modelo (R$), cotação US$→R$ e janela de conversão, para as estimativas na tela. */
export async function GET() {
  if (!(await requireApiSession())) return Response.json({ error: "Não autenticado." }, { status: 401 });
  return Response.json({ data: await getMetaPricing() });
}

const validPrice = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 10;

/** Atualiza a tabela da Meta (US$ por mensagem) e a cotação. Exige acesso a Configurações ou Campanhas. */
export async function PUT(request: Request) {
  const guard = await requireModule("configuracoes", "campanhas");
  if (guard.response) return guard.response;
  const body = (await request.json().catch(() => null)) as { usd?: Record<string, unknown>; usdBrlRate?: unknown } | null;
  const usd = body?.usd;
  const rate = body?.usdBrlRate;
  if (!usd || !validPrice(usd.marketing) || !validPrice(usd.utility) || !validPrice(usd.authentication)) {
    return Response.json({ error: "Informe as tarifas em US$ por mensagem (ex.: 0,0625)." }, { status: 400 });
  }
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate < 1 || rate > 50) {
    return Response.json({ error: "Informe uma cotação do dólar válida (ex.: 5,50)." }, { status: 400 });
  }
  const data = await saveMetaPricing({ marketing: usd.marketing as number, utility: usd.utility as number, authentication: usd.authentication as number }, rate);
  return Response.json({ data });
}
