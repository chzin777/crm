import { getSessionCookie } from "better-auth/cookies";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/recuperar-senha", "/redefinir-senha", "/api/auth", "/api/whatsapp/webhook", "/api/contacts/sync", "/api/stores/sync", "/exclusao-de-dados", "/politica-de-privacidade", "/termos-de-servico", "/_next", "/favicon.ico", "/icon.png", "/logos"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths without auth check
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Better Auth usa o prefixo __Secure- quando BETTER_AUTH_URL é https; getSessionCookie cobre os dois nomes.
  if (!getSessionCookie(request)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png).*)"],
};
