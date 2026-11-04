"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";

function RedefinirSenhaForm() {
  const token = useSearchParams().get("token");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password.length < 12) return setError("A senha deve ter pelo menos 12 caracteres.");
    if (password !== confirmation) return setError("As senhas não conferem.");
    setIsSubmitting(true);
    setError("");
    try {
      const result = await authClient.resetPassword({ newPassword: password, token: token ?? "" });
      if (result.error) throw new Error(result.error.message);
      setDone(true);
    } catch {
      setError("Link inválido ou expirado. Solicite uma nova redefinição.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#051647] px-4">
      <div className="w-full max-w-sm space-y-5 rounded-2xl border border-white/10 bg-white/5 p-6 text-white">
        <h1 className="text-xl font-semibold">Nova senha</h1>
        {!token ? (
          <p className="text-sm text-white/70">Link inválido. Solicite uma nova redefinição de senha.</p>
        ) : done ? (
          <p className="text-sm text-white/70">Senha alterada com sucesso. Você já pode entrar com a nova senha.</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input type="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Nova senha (mínimo 12 caracteres)" className="h-11 w-full rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-[#C4D600]" />
            <input type="password" required autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} placeholder="Confirme a nova senha" className="h-11 w-full rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-[#C4D600]" />
            {error && <p className="text-xs font-medium text-[#F7915E]">{error}</p>}
            <button type="submit" disabled={isSubmitting} className="inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-xl bg-[#C4D600] px-4 text-sm font-bold text-[#051647] hover:cursor-pointer hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60">{isSubmitting ? "Salvando..." : "Salvar nova senha"}</button>
          </form>
        )}
        <a href="/login" className="block cursor-pointer text-center text-xs font-medium text-white/50 hover:cursor-pointer hover:text-[#C4D600]">Ir para o login</a>
      </div>
    </main>
  );
}

export default function RedefinirSenhaPage() {
  return (
    <Suspense fallback={null}>
      <RedefinirSenhaForm />
    </Suspense>
  );
}
