import { NextResponse } from "next/server";

/** Links curtos públicos para o WhatsApp (crm.oticasbrasil.com.br/w/<slug>). */
const WHATSAPP_LINKS: Record<string, string> = {
  "black-11":
    "https://api.whatsapp.com/send/?phone=556293747027&text=Ol%C3%A1%21%20Vi%20a%20promo%C3%A7%C3%A3o%20da%20Black%2011%2F11%20e%20quero%20garantir%20minha%20oferta%21%20Como%20funciona%3F&type=phone_number&app_absent=0",
};

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const destination = Object.hasOwn(WHATSAPP_LINKS, slug.toLowerCase()) ? WHATSAPP_LINKS[slug.toLowerCase()] : null;
  // Atrás do proxy, request.url aponta para o host interno; o domínio público vem nos cabeçalhos encaminhados.
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  const home = host ? `${protocol}://${host}/` : new URL("/", request.url);
  const response = NextResponse.redirect(destination ?? home, 307);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
