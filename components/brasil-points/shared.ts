export const inputClass = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-[#002187] dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100 dark:focus:border-[#C4D600]";
export const labelClass = "text-xs font-semibold text-slate-600 dark:text-slate-300";
export const primaryButton = "inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#051647] px-3.5 text-sm font-semibold text-white hover:bg-[#002187] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[#C4D600] dark:text-[#051647]";
export const ghostButton = "inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/[0.05]";

export const pointsLabel = (points: number) => `${points > 0 ? "+" : ""}${points.toLocaleString("pt-BR")}`;
export const pointsTone = (points: number) => (points > 0 ? "text-emerald-600 dark:text-emerald-400" : points < 0 ? "text-red-600 dark:text-red-400" : "text-slate-500");

/** JSON com erro em português ({ error }) vira exceção com a mensagem. */
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = (await response.json().catch(() => ({}))) as { data?: T; error?: string };
  if (!response.ok) throw new Error(body.error ?? "Não foi possível concluir agora.");
  return body.data as T;
}
