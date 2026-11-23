"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, EyeOff, KeyRound, LogOut, X } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useToast } from "@/components/ToastProvider";
import { PASSWORD_RULES, passwordMeetsPolicy } from "@/lib/password-policy";

const inputClass = "h-11 w-full rounded-xl border border-white/15 bg-white/5 pl-3 pr-11 text-sm text-white outline-none placeholder:text-white/40 focus:border-[#C4D600]";

function PasswordField({ label, value, onChange, visible, onToggle }: { label: string; value: string; onChange: (value: string) => void; visible: boolean; onToggle: () => void }) {
  return (
    <label className="block space-y-1.5 text-xs font-semibold text-white/80">
      <span>{label}</span>
      <span className="relative block">
        <input type={visible ? "text" : "password"} required autoComplete="new-password" value={value} onChange={(event) => onChange(event.target.value)} className={inputClass} />
        <button type="button" onClick={onToggle} aria-label={visible ? "Ocultar senha" : "Mostrar senha"} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-white/50 hover:text-[#C4D600] cursor-pointer">
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </span>
    </label>
  );
}

export default function PrimeiroAcessoPage() {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/auth/primeiro-acesso", { cache: "no-store" })
      .then(async (response) => {
        if (!active) return;
        if (response.status === 401) return window.location.replace("/login");
        const result = (await response.json()) as { data?: { name: string; mustChangePassword: boolean } };
        if (!result.data?.mustChangePassword) return window.location.replace("/painel");
        setName(result.data.name.split(" ")[0] ?? "");
        setReady(true);
      })
      .catch(() => active && setReady(true));
    return () => { active = false; };
  }, []);

  const confirmed = confirmation.length > 0 && password === confirmation;
  const canSubmit = passwordMeetsPolicy(password) && confirmed && !isSubmitting;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!passwordMeetsPolicy(password)) return setError("A senha precisa de pelo menos 12 caracteres, com letras e números.");
    if (!confirmed) return setError("As senhas não conferem.");
    setIsSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/auth/primeiro-acesso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirmation }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (response.status === 401) return window.location.replace("/login");
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar a nova senha.");
      toast.success("Senha criada", "Sua nova senha foi salva. Bem-vindo ao CRM!");
      router.replace("/painel");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar a nova senha.");
      setIsSubmitting(false);
    }
  };

  const signOut = async () => {
    await authClient.signOut().catch(() => undefined);
    window.location.replace("/login");
  };

  return (
    <main className="flex min-h-dvh items-center justify-center overflow-y-auto bg-[#051647] px-4 py-8">
      <div className="w-full max-w-sm space-y-5 rounded-2xl border border-white/10 bg-white/5 p-6 text-white">
        <div className="space-y-2">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#C4D600]/15 text-[#C4D600]"><KeyRound className="h-5 w-5" /></span>
          <h1 className="text-xl font-semibold">Crie sua nova senha</h1>
          <p className="text-sm text-white/70">{name ? `Olá, ${name}! ` : ""}Este é seu primeiro acesso: troque a senha provisória por uma senha só sua para entrar no CRM.</p>
        </div>
        {!ready ? (
          <p className="text-sm text-white/60">Carregando...</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <PasswordField label="Nova senha" value={password} onChange={(value) => { setPassword(value); setError(""); }} visible={visible} onToggle={() => setVisible((value) => !value)} />
            <PasswordField label="Confirmar nova senha" value={confirmation} onChange={(value) => { setConfirmation(value); setError(""); }} visible={visible} onToggle={() => setVisible((value) => !value)} />
            <ul className="space-y-1.5" aria-label="Requisitos da senha">
              {[...PASSWORD_RULES.map((rule) => ({ id: rule.id, label: rule.label, ok: rule.test(password) })), { id: "match", label: "As duas senhas são iguais", ok: confirmed }].map((rule) => (
                <li key={rule.id} className={`flex items-center gap-2 text-xs ${rule.ok ? "text-[#C4D600]" : "text-white/50"}`}>
                  {rule.ok ? <Check className="h-3.5 w-3.5 shrink-0" /> : <X className="h-3.5 w-3.5 shrink-0" />}
                  {rule.label}
                </li>
              ))}
            </ul>
            {error && <p role="alert" className="text-xs font-medium text-[#F7915E]">{error}</p>}
            <button type="submit" disabled={!canSubmit} className="inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-xl bg-[#C4D600] px-4 text-sm font-bold text-[#051647] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60">{isSubmitting ? "Salvando..." : "Salvar e entrar"}</button>
          </form>
        )}
        <button type="button" onClick={() => void signOut()} className="mx-auto flex cursor-pointer items-center gap-1.5 text-xs font-medium text-white/50 hover:text-[#C4D600]"><LogOut className="h-3.5 w-3.5" />Sair</button>
      </div>
    </main>
  );
}
