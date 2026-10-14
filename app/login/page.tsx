"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import Grainient from "@/components/Grainient";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { authClient } from "@/lib/auth-client";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const result = await authClient.signIn.email({ email: email.trim(), password });
      if (result.error) {
        setErrorMessage("E-mail ou senha inválidos. Confira seus dados e tente novamente.");
        return;
      }
      const callbackUrl = searchParams.get("callbackUrl");
      const destination = callbackUrl?.startsWith("/") && !callbackUrl.startsWith("//")
        ? callbackUrl
        : "/painel";
      router.replace(destination);
      router.refresh();
    } catch {
      setErrorMessage("Não foi possível entrar agora. Verifique sua conexão e tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-[#051647] p-4 sm:p-8">
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

      <section className="relative z-10 grid w-full max-w-6xl overflow-hidden rounded-[2rem] bg-white shadow-2xl shadow-black/25 md:min-h-[650px] md:grid-cols-[1.2fr_0.8fr]">
        <div className="relative flex min-h-64 flex-col justify-between overflow-hidden bg-[linear-gradient(145deg,#002187_0%,#051647_78%)] p-8 text-white sm:p-10 md:min-h-[650px] md:p-14">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -left-36 -top-40 h-[26rem] w-[26rem] rounded-full border border-[#C4D600]/20" />
            <div className="absolute -left-20 -top-24 h-[22rem] w-[22rem] rounded-full border border-white/10" />
            <div className="absolute -bottom-36 -right-28 h-[34rem] w-[34rem] rounded-full bg-[#002187]/70" />
            <div className="absolute -bottom-20 -right-12 h-[25rem] w-[25rem] rounded-full border border-[#C4D600]/20" />
            <div className="absolute right-10 top-10 h-24 w-10 opacity-45 [background-image:radial-gradient(#ffffff_1.5px,transparent_1.5px)] [background-size:12px_12px]" />
            <svg className="absolute inset-0 h-full w-full opacity-25" viewBox="0 0 720 650" fill="none">
              <path d="M0 155C98 129 35 71 134 0M0 185C120 156 61 92 163 0M0 216C145 184 84 116 193 0" stroke="#C4D600" />
              <path d="M720 382C613 347 684 291 575 272C509 261 504 322 463 354C430 380 395 367 380 344M720 415C602 375 662 329 567 307C514 294 500 356 455 387C418 413 376 397 361 372M720 449C592 403 644 363 555 342C512 331 486 390 442 423C405 450 358 430 340 400" stroke="#C4D600" />
              <path d="M120 90V124M103 107H137M410 490V530M390 510H430" stroke="white" strokeWidth="2" />
              <circle cx="300" cy="116" r="10" stroke="white" strokeWidth="2" />
              <circle cx="94" cy="535" r="8" stroke="#C4D600" strokeWidth="2" />
            </svg>
          </div>

          <Image
            src="/logos/simbolo-oticas-brasil.png"
            alt="Símbolo Óticas Brasil"
            width={390}
            height={230}
            priority
            className="relative z-10 mx-auto h-20 w-auto self-center object-contain sm:h-24"
          />
          <div className="relative z-10 max-w-lg py-8">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">Bem-vindo de volta!</h1>
            <p className="mt-4 max-w-md text-base leading-relaxed text-white/80 sm:text-lg">
              Acesse sua conta para continuar cuidando dos relacionamentos com seus clientes.
            </p>
          </div>
          <p className="relative z-10 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-white/70">
            <span className="h-2 w-2 rounded-full bg-[#C4D600]" />
            CRM Óticas Brasil
          </p>
        </div>

        <div className="flex items-center justify-center bg-white px-7 py-10 sm:px-12 md:px-14">
          <div className="w-full max-w-sm">
            <header className="mb-9">
              <h2 className="text-3xl font-bold tracking-tight text-slate-800">Acesse sua conta</h2>
              <p className="mt-2 text-sm text-slate-500">Entre para continuar no CRM.</p>
            </header>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <label className="block space-y-2 text-sm font-semibold text-slate-700">
                E-mail
                <span className="relative block">
                  <Mail aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    name="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="voce@oticasbrasil.com.br"
                    className="h-12 w-full rounded-full border border-slate-200 bg-white pl-11 pr-4 text-sm font-normal text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[#002187] focus:ring-2 focus:ring-[#002187]/10"
                  />
                </span>
              </label>

              <label className="block space-y-2 text-sm font-semibold text-slate-700">
                Senha
                <span className="relative block">
                  <LockKeyhole aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    autoComplete="current-password"
                    required
                    minLength={12}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Sua senha"
                    className="h-12 w-full rounded-full border border-slate-200 bg-white pl-11 pr-12 text-sm font-normal text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[#002187] focus:ring-2 focus:ring-[#002187]/10"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    onClick={() => setShowPassword((visible) => !visible)}
                    className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 cursor-pointer hover:cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </span>
              </label>

              {errorMessage && (
                <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                  {errorMessage}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(100deg,#002187,#051647)] px-4 text-sm font-bold text-white shadow-md shadow-[#051647]/20 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70 cursor-pointer hover:cursor-pointer"
              >
                {isSubmitting && <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />}
                {isSubmitting ? "Entrando..." : "Entrar"}
              </button>
            </form>

            <p className="mt-7 text-center text-xs leading-relaxed text-slate-500">
              O acesso é gerenciado pelo administrador da sua equipe.
            </p>
            <div className="mt-7 flex items-center justify-center gap-2 border-t border-slate-100 pt-5 text-[10px] font-medium uppercase tracking-wider text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-[#C4D600]" />
              Óticas Brasil
            </div>
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
