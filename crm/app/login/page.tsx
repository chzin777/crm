"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import {
  BadgeCheck,
  Bot,
  Clock,
  Eye,
  EyeOff,
  Headset,
  LoaderCircle,
  LockKeyhole,
  Mail,
  MessageSquare,
  Ticket,
} from "lucide-react";
import Grainient from "@/components/Grainient";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { authClient } from "@/lib/auth-client";

/* -------------------------------------------------------------------------- */
/*                                   Styles                                   */
/* -------------------------------------------------------------------------- */

const floatKeyframes = `
@keyframes flutua {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}
@keyframes radar-pulse {
  0% { transform: scale(1); opacity: 0.6; }
  100% { transform: scale(1.8); opacity: 0; }
}
`;

/* -------------------------------------------------------------------------- */
/*                              Floating Chips                                */
/* -------------------------------------------------------------------------- */

const CHIPS = [
  {
    icon: MessageSquare,
    title: "Nova conversa",
    detail: "WhatsApp · agora",
    delay: "0s",
    top: "12%",
    right: "8%",
  },
  {
    icon: Bot,
    title: "IA respondeu",
    detail: "Resolução automática",
    delay: "1.2s",
    top: "34%",
    right: "28%",
  },
  {
    icon: Clock,
    title: "Tempo de resposta",
    detail: "Dentro da meta",
    delay: "2.4s",
    top: "58%",
    right: "6%",
  },
  {
    icon: Ticket,
    title: "Negócio atualizado",
    detail: "Óticas Centro · R$ 1.240",
    delay: "3.6s",
    top: "76%",
    right: "24%",
  },
] as const;

/* -------------------------------------------------------------------------- */
/*                               Login Content                                */
/* -------------------------------------------------------------------------- */

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("crm_remembered_email");
    if (stored) {
      setEmail(stored);
      setRememberMe(true);
    }
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");

    try {
      if (rememberMe) {
        localStorage.setItem("crm_remembered_email", email.trim());
      } else {
        localStorage.removeItem("crm_remembered_email");
      }

      const result = await authClient.signIn.email({ email: email.trim(), password });
      if (result.error) {
        setErrorMessage("E-mail ou senha inválidos. Confira seus dados e tente novamente.");
        return;
      }

      // Better Auth may not set the session cookie automatically behind Cloudflare Tunnel.
      // Manually set it from the token returned in the response body.
      if (result.data?.token) {
        document.cookie = `better-auth.session_token=${result.data.token}; path=/; max-age=86400; SameSite=Lax; Secure`;
      }

      const callbackUrl = searchParams.get("callbackUrl");
      const destination =
        callbackUrl?.startsWith("/") && !callbackUrl.startsWith("//")
          ? callbackUrl
          : "/painel";
      window.location.href = destination;
    } catch {
      setErrorMessage("Não foi possível entrar agora. Verifique sua conexão e tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="relative isolate min-h-dvh overflow-hidden bg-[#051647]">
      {/* Inject keyframes */}
      <style>{floatKeyframes}</style>

      {/* Background grainient */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
        <Grainient
          colors={["#051647", "#002187", "#051647", "#002187", "#C4D600"]}
          angle={55}
          flow={0.8}
          silk={0.35}
          grainAmount={0.06}
          type="linear"
          bands={1}
          softness={1}
          scale={1}
          speed={0.7}
          grainSize={1.2}
          grainAnimated
          contrast={1}
          saturation={1}
          variation={0}
          interactive
          stir={1}
          clickSwirl
          intro
          lightMode={false}
          dpr={1}
          className="h-full w-full"
        />
      </div>

      {/* -------------------------------------------------------------- */}
      {/* RIGHT SIDE — Vitrine Operacional Flutuante (behind half-moon)  */}
      {/* -------------------------------------------------------------- */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[1] hidden lg:block"
      >
        {/* Subtle radial glow on the right half */}
        <div className="absolute right-0 top-0 h-full w-1/2 bg-[radial-gradient(ellipse_at_center,_rgba(196,214,0,0.08)_0%,_transparent_70%)]" />

        {/* Radar center icon */}
        <div className="absolute left-[62%] top-1/2 -translate-x-1/2 -translate-y-1/2">
          {/* Pulse rings */}
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="absolute inset-0 rounded-full border border-[#C4D600]/30"
              style={{
                animation: `radar-pulse 3s ease-out ${i * 1}s infinite`,
              }}
            />
          ))}
          <div className="relative flex size-40 items-center justify-center rounded-[28%] border border-white/10 bg-white/5 shadow-2xl backdrop-blur-xl">
            <Headset className="size-16 text-[#C4D600]" strokeWidth={1.4} />
          </div>
        </div>

        {/* Floating chips */}
        {CHIPS.map((chip) => (
          <div
            key={chip.title}
            className="absolute flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.07] px-5 py-3.5 shadow-lg backdrop-blur-xl"
            style={{
              top: chip.top,
              right: chip.right,
              animation: `flutua 4s ease-in-out ${chip.delay} infinite`,
            }}
          >
            <chip.icon className="size-5 shrink-0 text-[#C4D600]" strokeWidth={1.6} />
            <div className="leading-tight">
              <p className="text-[13px] font-semibold text-white">{chip.title}</p>
              <p className="text-[11px] text-white/60">{chip.detail}</p>
            </div>
          </div>
        ))}

        {/* Value proposition — bottom-right */}
        <div className="absolute bottom-12 right-12 max-w-xs text-right">
          <h3 className="text-[26px] font-semibold leading-tight tracking-tight text-white">
            Relacionamento inteligente
          </h3>
          <p className="mt-2 text-[14px] leading-relaxed text-white/60">
            Centralize conversas, automações e métricas da sua operação ótica em um único painel.
          </p>
        </div>
      </div>

      {/* -------------------------------------------------------------- */}
      {/* LEFT HALF-MOON PANEL (desktop) / centered card (mobile)         */}
      {/* -------------------------------------------------------------- */}
      <section
        className={[
          /* Mobile: centered glass card */
          "relative z-10 mx-auto my-auto max-w-[440px] rounded-[28px] border border-white/10 bg-[#051647]/75 p-7 shadow-2xl backdrop-blur-[26px] backdrop-saturate-[1.4] sm:p-8",
          /* Desktop: half-moon anchored left */
          "lg:absolute lg:left-0 lg:top-1/2 lg:mx-0 lg:max-w-none lg:-translate-y-1/2 lg:rounded-none lg:border-r lg:border-white/10 lg:border-t-0 lg:border-b-0 lg:border-l-0 lg:bg-[#051647]/75 lg:p-0 lg:shadow-[8px_0_40px_-12px_rgba(0,0,0,0.45)]",
          "lg:w-[min(63vw,1020px)] lg:h-[138dvh]",
          "lg:rounded-tr-[69dvh] lg:rounded-br-[69dvh]",
          "flex items-center",
        ].join(" ")}
      >
        {/* Inner form wrapper — vertically centered inside the half-moon */}
        <div className="mx-auto flex w-full max-w-[310px] flex-col gap-6 lg:ml-[clamp(48px,8vw,140px)]">
          {/* Logo login (7.png) + badge */}
          <div className="flex flex-col items-start gap-2">
            <Image
              src="/logos/logo-login-oticas-brasil.png"
              alt="Óticas Brasil"
              width={600}
              height={172}
              priority
              className="h-28 w-auto object-contain drop-shadow-[0_2px_10px_rgba(0,0,0,0.35)]"
            />
            <span className="text-[10.5px] font-medium uppercase tracking-[0.25em] text-[#C4D600]">
              CRM · Painel Operacional
            </span>
          </div>

          {/* Heading */}
          <div>
            <h1 className="text-[21px] font-semibold tracking-tight text-white">
              Acesse sua conta
            </h1>
            <p className="mt-1 text-[13px] text-white/60">
              Entre para continuar no CRM.
            </p>
          </div>

          {/* Form */}
          <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
            {/* Email */}
            <label className="block space-y-1.5 text-[13px] font-medium text-white/80">
              E-mail
              <span className="relative block">
                <Mail
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40"
                />
                <input
                  type="email"
                  name="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@oticasbrasil.com.br"
                  className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.06] pl-10 pr-4 text-sm text-white outline-none transition-all placeholder:text-white/30 focus:border-[#C4D600]/60 focus:bg-white/[0.09] focus:ring-2 focus:ring-[#C4D600]/20"
                />
              </span>
            </label>

            {/* Password */}
            <label className="block space-y-1.5 text-[13px] font-medium text-white/80">
              Senha
              <span className="relative block">
                <LockKeyhole
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40"
                />
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  autoComplete="current-password"
                  required
                  minLength={12}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Sua senha"
                  className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.06] pl-10 pr-12 text-sm text-white outline-none transition-all placeholder:text-white/30 focus:border-[#C4D600]/60 focus:bg-white/[0.09] focus:ring-2 focus:ring-[#C4D600]/20"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-white/40 transition-colors hover:bg-white/10 hover:text-white cursor-pointer hover:cursor-pointer"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </span>
            </label>

            {/* Error */}
            {errorMessage && (
              <p
                role="alert"
                className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-[13px] text-red-200"
              >
                {errorMessage}
              </p>
            )}

            {/* Remember me */}
            <label className="flex items-center gap-2.5 select-none cursor-pointer group">
              <div className="relative flex items-center">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="peer sr-only"
                />
                <div className="h-5 w-5 rounded-md border-2 border-white/25 bg-transparent transition-all peer-checked:border-[#C4D600] peer-checked:bg-[#C4D600] peer-focus-visible:ring-2 peer-focus-visible:ring-[#C4D600]/50 peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-[#051647] group-hover:border-white/40" />
                <svg
                  className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 scale-0 text-[#051647] transition-transform peer-checked:scale-100"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={3.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <span className="text-[13px] font-medium text-white/60 transition-colors group-hover:text-white/80">
                Lembrar de mim
              </span>
            </label>

            {/* Submit button — 3D tactile */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#C4D600] px-4 text-sm font-bold text-[#051647] shadow-[0_4px_0_0_rgb(142,156,0),0_6px_16px_-4px_rgba(196,214,0,0.4)] transition-all active:translate-y-[2px] active:shadow-[0_2px_0_0_rgb(142,156,0),0_3px_8px_-2px_rgba(196,214,0,0.3)] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60 disabled:active:translate-y-0 disabled:active:shadow-[0_4px_0_0_rgb(142,156,0),0_6px_16px_-4px_rgba(196,214,0,0.4)] cursor-pointer hover:cursor-pointer"
            >
              {isSubmitting && <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />}
              {isSubmitting ? "Entrando..." : "Entrar"}
            </button>
          </form>

          {/* Forgot password link */}
          <a
            href="/recuperar-senha"
            className="text-center text-[12px] font-medium text-white/50 transition-colors hover:text-[#C4D600] cursor-pointer hover:cursor-pointer"
          >
            Esqueci minha senha
          </a>

          {/* Footer */}
          <div className="space-y-1 border-t border-white/[0.06] pt-4 text-center">
            <p className="text-[10px] text-white/35">
              Ambiente interno · Acesso restrito
            </p>
            <p className="text-[10px] text-white/35">
              suporte@oticasbrasil.com.br
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingSpinner label="Carregando..." size={96} fullScreen />}>
      <LoginContent />
    </Suspense>
  );
}