import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";
import { lockMessage, LoginRateLimiter } from "@/lib/auth-rate-limit";

const handler = toNextJsHandler(auth);
const globalForLimiter = globalThis as typeof globalThis & { loginLimiter?: LoginRateLimiter };
const limiter = (globalForLimiter.loginLimiter ??= new LoginRateLimiter());

// Atrás do Cloudflare Tunnel: o IP real vem em cf-connecting-ip.
function clientIp(request: Request) {
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconhecido";
}

export const GET = handler.GET;

/** Login por e-mail com bloqueio de força bruta (5 falhas seguidas por IP + e-mail → 15 min, HTTP 429). */
export async function POST(request: Request) {
  if (!new URL(request.url).pathname.endsWith("/sign-in/email")) return handler.POST(request);

  const body = (await request.clone().json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email : "";
  const ip = clientIp(request);
  const key = LoginRateLimiter.key(ip, email);

  const retryAfter = limiter.retryAfterMs(key);
  if (retryAfter > 0) {
    console.warn(`[security] login bloqueado: ${email || "(sem e-mail)"} a partir de ${ip} (${Math.ceil(retryAfter / 1000)}s restantes)`);
    return Response.json(
      { code: "TOO_MANY_ATTEMPTS", message: lockMessage(retryAfter), retryAfterSeconds: Math.ceil(retryAfter / 1000) },
      { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfter / 1000)) } },
    );
  }

  const response = await handler.POST(request);
  if (response.ok) {
    limiter.recordSuccess(key);
  } else if (response.status === 401 || response.status === 403 || response.status === 400) {
    const locked = limiter.recordFailure(key);
    console.warn(`[security] login falhou: ${email || "(sem e-mail)"} a partir de ${ip} (${limiter.failures(key)} falha(s) seguida(s))${locked ? " → bloqueado por 15 min" : ""}`);
  }
  return response;
}
