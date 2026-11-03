"use client";

import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";

export default function RecuperarSenhaPage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    try {
      const result = await authClient.requestPasswordReset({ email: email.trim(), redirectTo: `${window.location.origin}/redefinir-senha` });
      if (result.error) throw new Error(result.error.message);
      setSent(true);
    } catch {
      setError("Não foi possível enviar o e-mail agora. Tente novamente em instantes.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#051647] px-4">
      <div className="w-full max-w-sm space-y-5 rounded-2xl border border-white/10 bg-white/5 p-6 text-white">
        <h1 className="text-xl font-semibold">Recuperar senha</h1>
        {sent ? (
          <p className="text-sm text-white/70">Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha. O link vale por 1 hora.</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-white/70">Informe o e-mail da sua conta para receber o link de redefinição.</p>
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com.br" className="h-11 w-full rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-[#C4D600]" />
            {error && <p className="text-xs font-medium text-[#F7915E]">{error}</p>}
            <button type="submit" disabled={isSubmitting} className="inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-xl bg-[#C4D600] px-4 text-sm font-bold text-[#051647] hover:cursor-pointer hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60">{isSubmitting ? "Enviando..." : "Enviar link"}</button>
          </form>
        )}
        <a href="/login" className="block cursor-pointer text-center text-xs font-medium text-white/50 hover:cursor-pointer hover:text-[#C4D600]">Voltar ao login</a>
      </div>
    </main>
  );
}
