"use client";
import { useCallback, useEffect, useState } from "react";
import { DEFAULT_USD_BRL_RATE, type MetaPricingView } from "@/lib/meta-pricing-shared";

const FALLBACK: MetaPricingView = { marketing: 0.34, utility: 0.04, authentication: 0.17, usdBrlRate: DEFAULT_USD_BRL_RATE, conversionWindowDays: 7 };

// Compartilhado entre telas abertas: salvar na calculadora atualiza a coluna de custo na hora.
const listeners = new Set<(pricing: MetaPricingView) => void>();
let cached: MetaPricingView | null = null;

/** Tarifas da Meta (R$ por mensagem e cotação US$→R$) para estimativas; `save` grava a partir da tabela em US$. */
export function useMetaPricing() {
  const [pricing, setPricing] = useState<MetaPricingView>(cached ?? FALLBACK);
  const [loaded, setLoaded] = useState(cached !== null);

  useEffect(() => {
    const listener = (next: MetaPricingView) => { setPricing(next); setLoaded(true); };
    listeners.add(listener);
    let active = true;
    fetch("/api/metrics/pricing", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { data?: MetaPricingView } | null) => {
        if (!active || !body?.data) return;
        cached = { ...FALLBACK, ...body.data };
        listener(cached);
      })
      .catch(() => undefined);
    return () => { active = false; listeners.delete(listener); };
  }, []);

  const save = useCallback(async (usd: { marketing: number; utility: number; authentication: number }, usdBrlRate: number) => {
    const response = await fetch("/api/metrics/pricing", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usd, usdBrlRate }),
    });
    const body = (await response.json().catch(() => ({}))) as { data?: MetaPricingView; error?: string };
    if (!response.ok || !body.data) throw new Error(body.error || "Não foi possível salvar as tarifas.");
    cached = { ...FALLBACK, ...body.data };
    listeners.forEach((listener) => listener(cached as MetaPricingView));
    return cached;
  }, []);

  return { pricing, loaded, save };
}
